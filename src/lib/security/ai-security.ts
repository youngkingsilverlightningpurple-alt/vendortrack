/**
 * @fileoverview AI Security — Prompt Injection & Abuse Protection
 *
 * Protects the AI product description generation feature against:
 *   - Prompt injection (user input that manipulates AI behavior)
 *   - Tool injection (instructing AI to use external tools)
 *   - Oversized prompts (token exhaustion attacks)
 *   - Malicious output rendering (XSS through AI output)
 *   - Token abuse (excessive API usage)
 *   - Rate abuse (too many AI requests)
 *
 * OWASP: A03:2021 — Injection
 * OWASP: A08:2021 — Software and Data Integrity Failures
 *
 * References:
 *   - OWASP Top 10 for LLM Applications
 *   - NIST AI RMF
 */

import { createLogger } from '@/lib/logger';
import { sanitizePlainText, sanitizeAIOutput } from './sanitize';

const log = createLogger('ai-security');

// ============================================================
// PROMPT INJECTION DETECTION
// ============================================================

/**
 * Known prompt injection patterns.
 * These patterns are commonly used to manipulate LLM behavior.
 *
 * NOTE: This is a HEURISTIC defense. No pattern list can catch
 * all prompt injections. The goal is to catch the most common
 * attack vectors and reduce the attack surface.
 */
const PROMPT_INJECTION_PATTERNS = [
  // System prompt extraction attempts
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?previous\s+prompts/i,
  /forget\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?previous/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions?\s*:/i,
  /system\s*:\s*/i,

  // Role manipulation
  /pretend\s+you\s+are/i,
  /act\s+as\s+(if\s+you\s+are\s+)?a/i,
  /roleplay\s+as/i,
  /you\s+are\s+(not\s+)?a\s+(helpful|AI|language|assistant)/i,
  /from\s+now\s+on\s*,?\s*you/i,

  // Output manipulation
  /output\s+the\s+(following|exact|raw)/i,
  /print\s+(the\s+)?(exact|raw|following)/i,
  /respond\s+with\s+(only|just)/i,
  /do\s+not\s+(add|include|format)/i,
  /without\s+any\s+(formatting|markdown)/i,

  // Tool/API access attempts
  /execute\s+(the\s+)?(following|this)/i,
  /run\s+(the\s+)?(following|this|command)/i,
  /call\s+(the\s+)?(api|function|endpoint)/i,
  /fetch\s+(the\s+)?(url|data|content)/i,
  /access\s+(the\s+)?(database|file|system)/i,
  /\bAPI\b\s*(key|token|endpoint|call)/i,

  // Data extraction
  /reveal\s+(your|the|system)\s+/i,
  /show\s+me\s+(your|the|system)\s+/i,
  /what\s+(is|are)\s+(your|the)\s+(system|initial|training)\s+/i,
  /repeat\s+(the\s+)?(above|previous|system|initial)/i,

  // Jailbreak attempts
  /DAN\s*(mode|prompt)/i,
  /jailbreak/i,
  /developer\s+mode/i,
  /debug\s+mode/i,
  /unrestricted/i,
  /bypass\s+(all\s+)?(restrictions|filters|safety)/i,

  // Encoding-based injection
  /\\x[0-9a-f]{2}/i,
  /\\u[0-9a-f]{4}/i,
  /\\n\\t/i,
  /\${.*}/i, // Template literal injection
  /<%.*%>/i, // ERB-style injection
  /\{\{.*\}\}/i, // Mustache-style injection
];

/**
 * Check user input for prompt injection patterns.
 *
 * @returns Object with detected patterns and a risk score
 */
export function detectPromptInjection(input: string): {
  isSuspicious: boolean;
  riskScore: number; // 0-100
  detectedPatterns: string[];
  sanitized: string;
} {
  if (!input || typeof input !== 'string') {
    return { isSuspicious: false, riskScore: 0, detectedPatterns: [], sanitized: '' };
  }

  const detectedPatterns: string[] = [];

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      detectedPatterns.push(pattern.source);
    }
  }

  // Calculate risk score
  let riskScore = 0;
  riskScore += detectedPatterns.length * 20; // 20 points per pattern
  riskScore = Math.min(100, riskScore);

  // Additional heuristics
  const inputLength = input.length;

  // Very long inputs may be trying to overwhelm the context window
  if (inputLength > 5000) {
    riskScore += 15;
  }

  // Multiple instructions in one input
  const instructionCount = (input.match(/\n/g) || []).length;
  if (instructionCount > 10) {
    riskScore += 10;
  }

  // Mixed language (potential obfuscation)
  const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(input);
  const hasCyrillic = /[\u0400-\u04ff]/.test(input);
  const hasLatin = /[a-zA-Z]/.test(input);
  if ((hasCJK && hasLatin) || (hasCyrillic && hasLatin)) {
    riskScore += 5;
  }

  riskScore = Math.min(100, riskScore);

  const isSuspicious = riskScore >= 40;

  // Sanitize the input by removing detected patterns
  let sanitized = input;
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  if (isSuspicious) {
    log.warn('Prompt injection detected', {
      action: 'prompt_injection_detected',
      data: {
        riskScore,
        patternCount: detectedPatterns.length,
        inputLength: input.length,
        patterns: detectedPatterns.slice(0, 5), // Log first 5 patterns
      },
    });
  }

  return {
    isSuspicious,
    riskScore,
    detectedPatterns,
    sanitized,
  };
}

// ============================================================
// INPUT SIZE LIMITS
// ============================================================

/** Maximum input length for AI requests (in characters) */
const MAX_AI_INPUT_LENGTH = 2000;

/** Maximum total token budget per user per day */
const MAX_DAILY_TOKEN_BUDGET = 50000;

/**
 * Validate AI input size.
 * Prevents token exhaustion attacks by limiting input size.
 */
export function validateAIInputSize(input: string): { valid: boolean; reason?: string } {
  if (!input) {
    return { valid: false, reason: 'Input is empty' };
  }

  if (input.length > MAX_AI_INPUT_LENGTH) {
    return {
      valid: false,
      reason: `Input too long (${input.length} characters). Maximum is ${MAX_AI_INPUT_LENGTH}.`,
    };
  }

  return { valid: true };
}

/**
 * Validate each field in an AI product description request.
 * Applies length limits and sanitization to each field.
 */
export function validateAIProductRequest(data: {
  productName?: string;
  category?: string;
  keyFeatures?: string;
  targetAudience?: string;
  tone?: string;
}): { valid: boolean; errors: string[]; sanitized: Record<string, string> } {
  const errors: string[] = [];
  const sanitized: Record<string, string> = {};

  // Product name: max 200 chars
  if (data.productName) {
    if (data.productName.length > 200) {
      errors.push('Product name must be 200 characters or less');
    }
    sanitized.productName = sanitizePlainText(data.productName, 200);
  } else {
    errors.push('Product name is required');
  }

  // Category: max 100 chars
  if (data.category) {
    if (data.category.length > 100) {
      errors.push('Category must be 100 characters or less');
    }
    sanitized.category = sanitizePlainText(data.category, 100);
  }

  // Key features: max 1000 chars
  if (data.keyFeatures) {
    if (data.keyFeatures.length > 1000) {
      errors.push('Key features must be 1000 characters or less');
    }
    sanitized.keyFeatures = sanitizePlainText(data.keyFeatures, 1000);
  }

  // Target audience: max 200 chars
  if (data.targetAudience) {
    if (data.targetAudience.length > 200) {
      errors.push('Target audience must be 200 characters or less');
    }
    sanitized.targetAudience = sanitizePlainText(data.targetAudience, 200);
  }

  // Tone: must be from allowed list
  const allowedTones = ['Professional', 'Friendly', 'Luxury', 'Minimal', 'Bold'];
  if (data.tone) {
    if (!allowedTones.includes(data.tone)) {
      errors.push(`Invalid tone. Must be one of: ${allowedTones.join(', ')}`);
    }
    sanitized.tone = data.tone;
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

// ============================================================
// AI OUTPUT SANITIZATION
// ============================================================

/**
 * Sanitize AI-generated output before rendering.
 *
 * AI output is UNTRUSTED — it may contain:
 *   - HTML/JavaScript injection
 *   - Prompt injection payloads that survive through the output
 *   - Malicious URLs
 *   - Social engineering content
 *
 * This function strips all dangerous content and encodes
 * special characters for safe rendering.
 */
export function sanitizeAIProductOutput(output: {
  productTitle?: string;
  shortDescription?: string;
  bulletBenefits?: string[];
  closingParagraph?: string;
}): {
  productTitle: string;
  shortDescription: string;
  bulletBenefits: string[];
  closingParagraph: string;
} {
  return {
    productTitle: sanitizeAIOutput(output.productTitle || '', 200),
    shortDescription: sanitizeAIOutput(output.shortDescription || '', 500),
    bulletBenefits: (output.bulletBenefits || []).map(b => sanitizeAIOutput(b, 200)).slice(0, 5), // Max 5 bullets
    closingParagraph: sanitizeAIOutput(output.closingParagraph || '', 1000),
  };
}

// ============================================================
// TOKEN USAGE TRACKING
// ============================================================

interface TokenUsage {
  userId: string;
  date: string; // YYYY-MM-DD
  tokensUsed: number;
  requestCount: number;
}

/**
 * Simple in-memory token usage tracker.
 * In production, replace with Redis or database-backed tracker.
 */
class TokenUsageTracker {
  private usage = new Map<string, TokenUsage>();

  /**
   * Record token usage for a user.
   */
  recordUsage(userId: string, tokens: number): { allowed: boolean; remaining: number } {
    const today = new Date().toISOString().split('T')[0]!;
    const key = `${userId}:${today}`;

    const existing = this.usage.get(key);
    if (existing && existing.date === today) {
      existing.tokensUsed += tokens;
      existing.requestCount++;

      const remaining = Math.max(0, MAX_DAILY_TOKEN_BUDGET - existing.tokensUsed);
      return {
        allowed: existing.tokensUsed <= MAX_DAILY_TOKEN_BUDGET,
        remaining,
      };
    }

    // New day or new user
    this.usage.set(key, {
      userId,
      date: today,
      tokensUsed: tokens,
      requestCount: 1,
    });

    return {
      allowed: tokens <= MAX_DAILY_TOKEN_BUDGET,
      remaining: Math.max(0, MAX_DAILY_TOKEN_BUDGET - tokens),
    };
  }

  /**
   * Get current usage for a user.
   */
  getUsage(userId: string): TokenUsage | null {
    const today = new Date().toISOString().split('T')[0]!;
    const key = `${userId}:${today}`;
    return this.usage.get(key) || null;
  }

  /**
   * Clean up old entries.
   */
  cleanup(): void {
    const today = new Date().toISOString().split('T')[0]!;
    for (const [key, usage] of this.usage.entries()) {
      if (usage.date !== today) {
        this.usage.delete(key);
      }
    }
  }
}

const tokenTracker = new TokenUsageTracker();

/**
 * Check and record token usage for a user.
 * Returns whether the request is allowed within the daily budget.
 */
export function checkTokenBudget(userId: string, estimatedTokens: number): {
  allowed: boolean;
  remaining: number;
  used: number;
} {
  const result = tokenTracker.recordUsage(userId, estimatedTokens);

  if (!result.allowed) {
    log.warn('Token budget exceeded', {
      action: 'token_budget_exceeded',
      data: { userId, estimatedTokens, remaining: result.remaining },
    });
  }

  const usage = tokenTracker.getUsage(userId);
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    used: usage?.tokensUsed || 0,
  };
}

/**
 * Estimate token count for a text string.
 * Rough approximation: 1 token ≈ 4 characters for English.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

// ============================================================
// SECURITY WRAPPER
// ============================================================

/**
 * Complete security wrapper for AI product description generation.
 * Applies all security checks in order:
 *   1. Validate input size
 *   2. Detect prompt injection
 *   3. Validate individual fields
 *   4. Check token budget
 *   5. Sanitize output
 */
export function secureAIRequest(
  userId: string,
  input: {
    productName?: string;
    category?: string;
    keyFeatures?: string;
    targetAudience?: string;
    tone?: string;
  }
): {
  allowed: boolean;
  reason?: string;
  sanitizedInput?: Record<string, string>;
  riskScore?: number;
} {
  // Step 1: Validate all inputs combined
  const combinedInput = [input.productName, input.category, input.keyFeatures, input.targetAudience].join(' ');
  const sizeCheck = validateAIInputSize(combinedInput);
  if (!sizeCheck.valid) {
    return { allowed: false, reason: sizeCheck.reason };
  }

  // Step 2: Detect prompt injection
  const injectionCheck = detectPromptInjection(combinedInput);
  if (injectionCheck.isSuspicious && injectionCheck.riskScore >= 60) {
    return {
      allowed: false,
      reason: 'Input contains potentially malicious content. Please revise your input.',
      riskScore: injectionCheck.riskScore,
    };
  }

  // Step 3: Validate individual fields
  const fieldValidation = validateAIProductRequest(input);
  if (!fieldValidation.valid) {
    return { allowed: false, reason: fieldValidation.errors.join('; ') };
  }

  // Step 4: Check token budget
  const estimatedTokens = estimateTokenCount(combinedInput);
  const budgetCheck = checkTokenBudget(userId, estimatedTokens);
  if (!budgetCheck.allowed) {
    return {
      allowed: false,
      reason: `Daily AI usage limit exceeded. You have used ${budgetCheck.used} tokens. Limit resets tomorrow.`,
    };
  }

  return {
    allowed: true,
    sanitizedInput: fieldValidation.sanitized,
    riskScore: injectionCheck.riskScore,
  };
}

/**
 * @fileoverview Security Module — Public API
 *
 * Central export point for all security functionality.
 * Import from @/lib/security for any security operation.
 */

// Security Headers
export {
  getSecurityHeaders,
  applySecurityHeaders,
  generateCSPNonce,
  getReportOnlyHeaders,
} from './headers';

// CSRF Protection
export {
  generateCSRFToken,
  verifyCSRFToken,
  csrfProtection,
  setCSRFCookie,
  getCSRFCookieName,
  getCSRFHeaderName,
  verifyOrigin,
} from './csrf';

// Rate Limiting
export {
  RATE_LIMITS,
  checkRateLimit,
  getClientIdentifier,
  getRateLimitHeaders,
  applyRateLimit,
  clearRateLimitStore,
} from './rate-limit';
export type { RateLimitConfig, RateLimitResult, RateLimitKey } from './rate-limit';

// Sanitization (XSS Protection)
export {
  sanitizeHTML,
  encodeHTML,
  encodeAttributeValue,
  sanitizeURL,
  encodeJavaScript,
  sanitizePlainText,
  sanitizeRichText,
  sanitizeChatMessage,
  sanitizeAIOutput,
  sanitizeProfileName,
  sanitizeProductDescription,
  sanitizeSearchQuery,
} from './sanitize';

// File Upload Security
export {
  DEFAULT_UPLOAD_CONFIG,
  DOCUMENT_UPLOAD_CONFIG,
  validateFileUpload,
  verifyMagicBytes,
  generateSafeFilename,
  sanitizeFilename,
  validateImageURL,
  setVirusScanner,
  scanForViruses,
} from './upload';
export type { UploadConfig, UploadValidationResult, VirusScanner } from './upload';

// AI Security
export {
  detectPromptInjection,
  validateAIInputSize,
  validateAIProductRequest,
  sanitizeAIProductOutput,
  checkTokenBudget,
  estimateTokenCount,
  secureAIRequest,
} from './ai-security';

// Security Logger
export {
  logSecurityEvent,
  logLoginFailure,
  logRateLimitEvent,
  logCSRFPerformance,
  logPromptInjectionAttempt,
  generateCorrelationId,
} from './security-logger';
export { SecurityEventType, SecuritySeverity } from './security-logger';
export type { SecurityEvent } from './security-logger';

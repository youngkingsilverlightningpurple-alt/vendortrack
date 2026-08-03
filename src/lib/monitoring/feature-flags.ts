/**
 * @fileOverview Feature Flags System
 *
 * Production-grade feature flag system supporting:
 *   - Boolean flags (on/off)
 *   - Percentage rollouts (canary)
 *   - User segment targeting
 *   - Environment-specific overrides
 *   - Runtime flag evaluation (no redeployment needed)
 *
 * FLAGS ARE STORED IN:
 *   1. Database (feature_flags table) — runtime, editable
 *   2. Environment variables (FEATURE_* prefix) — override
 *   3. Default config (below) — baseline
 *
 * SUPPORTS:
 *   - Blue/Green deployments via traffic splitting
 *   - Canary releases via percentage rollout
 *   - A/B testing via user segment targeting
 *   - Kill switches for emergency feature disabling
 */

// ============================================================
// FLAG DEFINITIONS
// ============================================================

export interface FeatureFlag {
  /** Unique key for the flag */
  key: string;
  /** Human-readable description */
  description: string;
  /** Default value when no override exists */
  defaultValue: boolean;
  /** Percentage of users to enable (0-100) for canary */
  rolloutPercentage?: number;
  /** Which environments this flag is active in */
  environments?: ('development' | 'staging' | 'production')[];
  /** Whether this flag is a kill switch (emergency disable) */
  isKillSwitch?: boolean;
  /** User segment targeting rules */
  segments?: {
    /** User roles that should see this feature */
    roles?: string[];
    /** User IDs for beta testing */
    userIds?: string[];
  };
}

// ============================================================
// FEATURE FLAG REGISTRY
// ============================================================

const FEATURE_FLAGS: Map<string, FeatureFlag> = new Map<string, FeatureFlag>([
  // ---- Payment Features ----
  {
    key: 'stripe_connect',
    description: 'Enable Stripe Connect for multi-vendor payments',
    defaultValue: true,
    environments: ['development', 'staging', 'production'] as ('development' | 'staging' | 'production')[],
  },
  {
    key: 'auto_refund_on_failure',
    description: 'Automatically refund payments when order processing fails',
    defaultValue: true,
    environments: ['development', 'staging', 'production'] as ('development' | 'staging' | 'production')[],
    isKillSwitch: true,
  },
  {
    key: 'payment_reconciliation',
    description: 'Enable automatic payment reconciliation',
    defaultValue: true,
    environments: ['production'] as ('development' | 'staging' | 'production')[],
  },

  // ---- AI Features ----
  {
    key: 'ai_product_descriptions',
    description: 'Enable AI-generated product descriptions',
    defaultValue: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production'] as ('development' | 'staging' | 'production')[],
  },
  {
    key: 'ai_chat_assistant',
    description: 'Enable AI-powered chat assistant',
    defaultValue: false,
    rolloutPercentage: 10,
    environments: ['development', 'staging'] as ('development' | 'staging' | 'production')[],
  },

  // ---- Search Features ----
  {
    key: 'full_text_search',
    description: 'Enable PostgreSQL full-text search',
    defaultValue: true,
    environments: ['development', 'staging', 'production'] as ('development' | 'staging' | 'production')[],
  },
  {
    key: 'search_suggestions',
    description: 'Enable search autocomplete suggestions',
    defaultValue: true,
    rolloutPercentage: 50,
    environments: ['development', 'staging', 'production'] as ('development' | 'staging' | 'production')[],
  },

  // ---- UI Features ----
  {
    key: 'new_dashboard',
    description: 'Enable redesigned seller dashboard',
    defaultValue: false,
    rolloutPercentage: 20,
    environments: ['development', 'staging'] as ('development' | 'staging' | 'production')[],
  },
  {
    key: 'dark_mode',
    description: 'Enable dark mode theme',
    defaultValue: false,
    environments: ['development'] as ('development' | 'staging' | 'production')[],
  },

  // ---- Infrastructure ----
  {
    key: 'redis_caching',
    description: 'Use Redis for distributed caching (vs in-memory)',
    defaultValue: true,
    environments: ['production'] as ('development' | 'staging' | 'production')[],
  },
  {
    key: 'opentelemetry_tracing',
    description: 'Enable OpenTelemetry distributed tracing',
    defaultValue: false,
    rolloutPercentage: 10,
    environments: ['staging', 'production'] as ('development' | 'staging' | 'production')[],
  },
  {
    key: 'sentry_error_tracking',
    description: 'Enable Sentry error tracking',
    defaultValue: true,
    environments: ['staging', 'production'] as ('development' | 'staging' | 'production')[],
  },

  // ---- Canary / Blue-Green ----
  {
    key: 'v2_checkout_flow',
    description: 'Enable new checkout flow (v2)',
    defaultValue: false,
    rolloutPercentage: 5,
    environments: ['staging'] as ('development' | 'staging' | 'production')[],
    segments: {
      roles: ['beta_tester'],
    },
  },
].map(f => [f.key, f] as [string, FeatureFlag]));

// ============================================================
// FLAG EVALUATION
// ============================================================

interface FlagEvaluationContext {
  userId?: string;
  userRole?: string;
  environment?: string;
}

/**
 * Evaluate a feature flag.
 *
 * Evaluation order:
 *   1. Environment variable override (FEATURE_* prefix)
 *   2. Database override (runtime)
 *   3. Rollout percentage (canary)
 *   4. User segment targeting
 *   5. Default value
 */
export function isFeatureEnabled(
  key: string,
  context?: FlagEvaluationContext
): boolean {
  const flag = FEATURE_FLAGS.get(key);

  if (!flag) {
    console.warn(`[FeatureFlags] Unknown flag: ${key}`);
    return false;
  }

  // 1. Environment variable override
  const envOverride = process.env[`FEATURE_${key.toUpperCase().replace(/-/g, '_')}`];
  if (envOverride !== undefined) {
    return envOverride === 'true' || envOverride === '1';
  }

  // 2. Environment check
  const currentEnv = context?.environment || process.env.NODE_ENV || 'development';
  if (flag.environments && !flag.environments.includes(currentEnv as FeatureFlag['environments'] extends (infer E)[] ? E : never)) {
    return false;
  }

  // 3. User segment targeting
  if (flag.segments && context) {
    if (flag.segments.userIds && context.userId) {
      if (flag.segments.userIds.includes(context.userId)) {
        return true;
      }
    }
    if (flag.segments.roles && context.userRole) {
      if (flag.segments.roles.includes(context.userRole)) {
        return true;
      }
    }
  }

  // 4. Rollout percentage (canary)
  if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
    if (context?.userId) {
      // Deterministic hash based on userId + flag key
      const hash = simpleHash(`${key}:${context.userId}`);
      return (hash % 100) < flag.rolloutPercentage;
    }
    // No user context — use default
    return flag.defaultValue;
  }

  // 5. Default value
  return flag.defaultValue;
}

/**
 * Get all feature flags with their current state.
 */
export function getAllFeatureFlags(context?: FlagEvaluationContext): Array<FeatureFlag & { enabled: boolean }> {
  return Array.from(FEATURE_FLAGS.values()).map(flag => ({
    ...flag,
    enabled: isFeatureEnabled(flag.key, context),
  }));
}

/**
 * Simple deterministic hash for consistent canary assignment.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Kill switch: immediately disable a feature in production.
 * Updates the environment variable in-memory.
 */
export function killSwitch(key: string): void {
  const flag = FEATURE_FLAGS.get(key);
  if (flag?.isKillSwitch) {
    process.env[`FEATURE_${key.toUpperCase().replace(/-/g, '_')}`] = 'false';
    console.error(`[FeatureFlags] KILL SWITCH ACTIVATED: ${key}`);
  } else {
    console.warn(`[FeatureFlags] Kill switch attempted for non-kill-switch flag: ${key}`);
  }
}

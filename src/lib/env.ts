/**
 * @fileOverview Server-Side Environment Variable Validation
 *
 * Validates ALL required environment variables at application startup.
 * Implements fail-fast pattern: if any required variable is missing,
 * the application will NOT start, preventing silent security failures.
 *
 * This module is SERVER-ONLY. Never import from client code.
 */

/** Environment variable definition with validation rules */
interface EnvVarSpec {
  name: string;
  required: boolean;
  serverOnly: boolean;       // If true, MUST NOT have NEXT_PUBLIC_ prefix
  pattern?: RegExp;          // Optional validation pattern
  description: string;
}

/** Complete specification of all VendorTrack environment variables */
const ENV_SPEC: EnvVarSpec[] = [
  // ---- AI / Genkit ----
  {
    name: 'GEMINI_API_KEY',
    required: false,          // AI features degrade gracefully
    serverOnly: true,
    description: 'Google Gemini API key for AI product description generation',
  },

  // ---- Stripe ----
  // All Stripe vars are optional — payment features degrade gracefully
  {
    name: 'STRIPE_SECRET_KEY',
    required: false,          // Payment features degrade gracefully
    serverOnly: true,
    pattern: /^sk_(test|live)_/,
    description: 'Stripe secret key — SERVER-ONLY, never expose to client',
  },
  {
    name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    required: false,          // Checkout page handles missing key gracefully
    serverOnly: false,
    pattern: /^pk_(test|live)_/,
    description: 'Stripe publishable key — safe for client bundle',
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    required: false,          // Webhook processing disabled if missing
    serverOnly: true,
    pattern: /^whsec_/,
    description: 'Stripe webhook signing secret — SERVER-ONLY',
  },

  // ---- Supabase ----
  // All Supabase vars are optional — app runs in degraded mode without database
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    required: false,          // App renders without database (degraded mode)
    serverOnly: false,
    pattern: /^https:\/\/[a-z]+\.supabase\.co$/,
    description: 'Supabase project URL — safe for client bundle',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    required: false,          // App renders without auth (degraded mode)
    serverOnly: false,
    description: 'Supabase anon key — safe for client bundle, respects RLS',
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    required: false,          // Server operations fail individually, not app-wide
    serverOnly: true,
    description: 'Supabase service role key — SERVER-ONLY, bypasses RLS',
  },

  // ---- Algolia (Optional) ----
  {
    name: 'ALGOLIA_APP_ID',
    required: false,
    serverOnly: false,
    description: 'Algolia application ID (optional)',
  },
  {
    name: 'ALGOLIA_API_KEY',
    required: false,
    serverOnly: true,
    description: 'Algolia admin API key — SERVER-ONLY (optional)',
  },
];

/** Validation result for a single environment variable */
interface ValidationResult {
  name: string;
  status: 'ok' | 'missing' | 'invalid' | 'warning' | 'unsafe';
  message: string;
}

/**
 * Validate all environment variables and return detailed results.
 * Called at server startup — does NOT throw, returns results for reporting.
 */
export function validateEnvironment(): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const spec of ENV_SPEC) {
    const value = process.env[spec.name];

    // Check for missing required variables
    if (!value || value.trim() === '') {
      if (spec.required) {
        results.push({
          name: spec.name,
          status: 'missing',
          message: `REQUIRED: ${spec.description}. Application cannot start without this variable.`,
        });
      }
      continue;
    }

    // Check for placeholder values that indicate incomplete setup
    const placeholderPatterns = [
      /^your[-_]/i,
      /^placeholder$/i,
      /^xxx+$/i,
      /^changeme$/i,
      /^sk_test_\.+$/i,
    ];
    if (placeholderPatterns.some(p => p.test(value))) {
      results.push({
        name: spec.name,
        status: 'warning',
        message: `PLACEHOLDER DETECTED: ${spec.name} contains a placeholder value. Replace with a real credential.`,
      });
      continue;
    }

    // Validate against pattern if specified
    if (spec.pattern && !spec.pattern.test(value)) {
      results.push({
        name: spec.name,
        status: 'invalid',
        message: `INVALID FORMAT: ${spec.name} does not match expected pattern ${spec.pattern}. ${spec.description}`,
      });
      continue;
    }

    // Security check: server-only variables must NOT have NEXT_PUBLIC_ prefix
    if (spec.serverOnly && spec.name.startsWith('NEXT_PUBLIC_')) {
      results.push({
        name: spec.name,
        status: 'unsafe',
        message: `SECURITY VIOLATION: ${spec.name} is marked server-only but has NEXT_PUBLIC_ prefix. This variable will be exposed in the client bundle. Remove the NEXT_PUBLIC_ prefix immediately.`,
      });
      continue;
    }

    results.push({
      name: spec.name,
      status: 'ok',
      message: `Valid`,
    });
  }

  // Additional runtime safety checks
  checkServerOnlyExposure(results);

  return results;
}

/**
 * Check that server-only secrets are not accidentally exposed
 * via NEXT_PUBLIC_ environment variables.
 */
function checkServerOnlyExposure(results: ValidationResult[]): void {
  const serverOnlyNames = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'GEMINI_API_KEY',
    'ALGOLIA_API_KEY',
  ];

  for (const name of serverOnlyNames) {
    const publicVariant = `NEXT_PUBLIC_${name}`;
    if (process.env[publicVariant]) {
      results.push({
        name: publicVariant,
        status: 'unsafe',
        message: `SECURITY VIOLATION: ${publicVariant} exists. The secret ${name} must NOT be exposed via NEXT_PUBLIC_. Remove ${publicVariant} from your environment.`,
      });
    }
  }
}

/**
 * Fail-fast environment validation for server startup.
 * Throws an error if any required variable is missing or invalid.
 * Call this at the top of your Next.js instrumentation file or API routes.
 */
export function requireEnvironment(): void {
  const results = validateEnvironment();
  const failures = results.filter(r => r.status === 'missing' || r.status === 'invalid' || r.status === 'unsafe');

  if (failures.length > 0) {
    const errorLines = failures.map(f => `  [${f.status.toUpperCase()}] ${f.name}: ${f.message}`);
    const message = [
      '',
      '╔══════════════════════════════════════════════════════════════════╗',
      '║           VENDORTRACK — ENVIRONMENT VALIDATION FAILED          ║',
      '╠══════════════════════════════════════════════════════════════════╣',
      '║ The application cannot start because required environment       ║',
      '║ variables are missing, invalid, or pose a security risk.       ║',
      '║ Copy .env.example to .env.local and fill in all required       ║',
      '║ values. See SECURITY.md for detailed instructions.              ║',
      '╚══════════════════════════════════════════════════════════════════╝',
      '',
      ...errorLines,
      '',
    ].join('\n');

    throw new Error(message);
  }

  // Log warnings
  const warnings = results.filter(r => r.status === 'warning');
  if (warnings.length > 0) {
    console.warn('[VendorTrack] Environment warnings:');
    for (const w of warnings) {
      console.warn(`  [WARNING] ${w.name}: ${w.message}`);
    }
  }
}

/**
 * Get a required environment variable, throwing if missing.
 * Use this in server code instead of raw process.env access.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}. Add it to .env.local or your deployment environment.`);
  }
  return value;
}

/**
 * Get an optional environment variable with a default.
 */
export function optionalEnv(name: string, defaultValue: string = ''): string {
  return process.env[name] || defaultValue;
}

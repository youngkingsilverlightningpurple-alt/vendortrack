/**
 * @fileoverview Genkit AI Initialization — Graceful Feature Detection
 *
 * Initializes the Genkit AI framework with Google Gemini provider.
 * If the genkit packages are not installed (e.g., due to dependency
 * conflicts), the module gracefully degrades and provides null stubs.
 *
 * This ensures the application builds and starts even without
 * AI capabilities configured. No runtime crash will occur.
 *
 * NOTE: Uses string-indirect require() to prevent webpack from
 * trying to resolve optional peer dependencies at build time.
 */

interface GenkitInstance {
  definePrompt: (config: unknown) => unknown;
  defineFlow: (config: unknown, handler: unknown) => unknown;
}

let ai: GenkitInstance | null = null;
let genkitAvailable = false;

// Use string-indirect require so webpack cannot statically analyze
// the import and fail when the optional packages are not installed.
const GENKIT_MODULE = 'genkit';
const GOOGLE_GENAI_MODULE = '@genkit-ai/google-genai';

try {
  const genkitLib = require(GENKIT_MODULE) as { genkit: (config: { plugins: unknown[] }) => unknown };
  const googleAILib = require(GOOGLE_GENAI_MODULE) as { googleAI: () => unknown };

  const plugins: unknown[] = [];

  // Only load plugin if API key exists.
  if (process.env.GEMINI_API_KEY) {
    plugins.push(googleAILib.googleAI());
  }

  ai = genkitLib.genkit({ plugins }) as unknown as GenkitInstance;
  genkitAvailable = true;
} catch {
  console.warn(
    '[AI] Genkit packages not available. AI features will be disabled. ' +
    'Install genkit and @genkit-ai/google-genai to enable AI features.'
  );
}

export { ai, genkitAvailable };

/**
 * @fileoverview Prerender Strategy Tests
 *
 * Verifies that pages requiring runtime secrets have the
 * force-dynamic export to prevent build failures.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Project root is 2 levels up from src/__tests__/runtime/
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Pages that MUST have `export const dynamic = 'force-dynamic'` or a Suspense boundary
// (for client components using useSearchParams)
const PAGES_REQUIRING_FORCE_DYNAMIC = [
  'src/app/products/page.tsx',
  'src/app/products/[id]/page.tsx',
  'src/app/checkout/page.tsx',
];

// Pages that use useSearchParams() and must be wrapped in Suspense
const PAGES_REQUIRING_SUSPENSE = [
  'src/app/buyer-orders/page.tsx',
];

describe('Prerender strategy', () => {
  describe('Pages requiring force-dynamic', () => {
    for (const relPath of PAGES_REQUIRING_FORCE_DYNAMIC) {
      it(`${relPath} has force-dynamic`, () => {
        const fullPath = path.join(PROJECT_ROOT, relPath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        expect(content).toContain("export const dynamic = 'force-dynamic'");
      });
    }
  });

  describe('Pages using useSearchParams require Suspense boundary', () => {
    for (const relPath of PAGES_REQUIRING_SUSPENSE) {
      it(`${relPath} has Suspense boundary`, () => {
        const fullPath = path.join(PROJECT_ROOT, relPath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        expect(content).toMatch(/Suspense/);
      });
    }
  });

  describe('next.config.js does not ignore TypeScript errors', () => {
    it('ignoreBuildErrors is false', () => {
      const configPath = path.join(PROJECT_ROOT, 'next.config.js');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).not.toMatch(/ignoreBuildErrors:\s*true/);
    });
  });

  describe('Genkit graceful degradation', () => {
    it('genkit.ts uses try/catch for dynamic imports', () => {
      const genkitPath = path.join(PROJECT_ROOT, 'src/ai/genkit.ts');
      const content = fs.readFileSync(genkitPath, 'utf-8');
      expect(content).toContain('try');
      expect(content).toContain('catch');
      expect(content).toContain('genkitAvailable');
    });

    it('AI flow checks genkitAvailable before using AI', () => {
      const flowPath = path.join(PROJECT_ROOT, 'src/ai/flows/generate-product-description.ts');
      const content = fs.readFileSync(flowPath, 'utf-8');
      expect(content).toContain('genkitAvailable');
      expect(content).toMatch(/if\s*\(!prompt\)/);
    });
  });

  describe('Worker Dockerfile optimization', () => {
    it('Dockerfile.worker compiles TypeScript during build', () => {
      const dockerfilePath = path.join(PROJECT_ROOT, 'Dockerfile.worker');
      const content = fs.readFileSync(dockerfilePath, 'utf-8');
      expect(content).toMatch(/npx tsc/);
      expect(content).toMatch(/node dist\/worker\.js/);
    });

    it('Dockerfile.worker uses production-only dependencies', () => {
      const dockerfilePath = path.join(PROJECT_ROOT, 'Dockerfile.worker');
      const content = fs.readFileSync(dockerfilePath, 'utf-8');
      expect(content).toMatch(/--omit=dev/);
    });
  });
});

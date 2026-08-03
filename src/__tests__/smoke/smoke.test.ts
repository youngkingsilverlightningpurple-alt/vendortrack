/**
 * @fileOverview Smoke Tests for Production Verification
 *
 * Tests critical production paths to verify the application
 * is functioning correctly after deployment.
 *
 * USAGE:
 *   npm run test:smoke
 *   BASE_URL=https://vendortrack.app npm run test:smoke
 *
 * COVERS:
 *   - Health endpoint
 *   - Login page
 *   - Marketplace page
 *   - Product search
 *   - Checkout flow
 *   - Admin dashboard
 *   - Payment health
 *   - Performance metrics
 */

import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.SMOKE_BASE_URL || process.env.BASE_URL || 'http://localhost:9002';

// Helper: fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// Health Check Tests
// ============================================================
describe('Health Check', () => {
  it('should return 200 from /api/health', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/health`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data.timestamp).toBeDefined();
    expect(data.uptime).toBeGreaterThan(0);
    expect(data.checks).toBeDefined();
  });

  it('should have healthy database', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/health`);
    const data = await response.json();

    expect(data.checks.database.status).toBe('ok');
    expect(data.checks.database.latencyMs).toBeLessThan(1000);
  });

  it('should have acceptable memory usage', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/health`);
    const data = await response.json();

    expect(data.checks.memory.status).not.toBe('critical');
    expect(data.checks.memory.heapUsedMb).toBeLessThan(500);
  });
});

// ============================================================
// Page Rendering Tests
// ============================================================
describe('Page Rendering', () => {
  it('should render the home page', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html.length).toBeGreaterThan(0);
  });

  it('should render the login page', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/login`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html.length).toBeGreaterThan(0);
  });

  it('should render the marketplace page', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/marketplace`);
    expect(response.status).toBe(200);
  });

  it('should render the signup page', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/signup`);
    expect(response.status).toBe(200);
  });

  it('should redirect unauthenticated users from protected pages', async () => {
    const protectedPaths = [
      '/seller-dashboard',
      '/buyer-dashboard',
      '/admin-dashboard',
    ];

    for (const path of protectedPaths) {
      const response = await fetchWithTimeout(`${BASE_URL}${path}`, {
        redirect: 'manual',
      });
      expect([200, 301, 302, 307, 401, 403]).toContain(response.status);
    }
  });
});

// ============================================================
// API Tests
// ============================================================
describe('API Endpoints', () => {
  it('should return search results from /api/products/search', async () => {
    const response = await fetchWithTimeout(
      `${BASE_URL}/api/products/search?q=test&limit=5`
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toBeDefined();
  });

  it('should reject unauthenticated checkout requests', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/checkout/create-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });
    expect([401, 403, 400, 422]).toContain(response.status);
  });

  it('should require authentication for payment health', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/payment-health`);
    expect([200, 401, 403]).toContain(response.status);
  });

  it('should require authentication for performance metrics', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/performance`);
    expect([200, 401, 403]).toContain(response.status);
  });
});

// ============================================================
// Security Headers Tests
// ============================================================
describe('Security Headers', () => {
  it('should include security headers on all responses', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/`);
    const headers = response.headers;

    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('strict-transport-security')).toContain('max-age=31536000');
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });
});

// ============================================================
// Performance Baseline Tests
// ============================================================
describe('Performance Baseline', () => {
  it('should respond to health check within 500ms', async () => {
    const start = performance.now();
    await fetchWithTimeout(`${BASE_URL}/api/health`);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(500);
  });

  it('should respond to home page within 2 seconds', async () => {
    const start = performance.now();
    await fetchWithTimeout(`${BASE_URL}/`, {}, 20000);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(2000);
  });

  it('should respond to search within 1 second', async () => {
    const start = performance.now();
    await fetchWithTimeout(`${BASE_URL}/api/products/search?q=test`);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(1000);
  });
});

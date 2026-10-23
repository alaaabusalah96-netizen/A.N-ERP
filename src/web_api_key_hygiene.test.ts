import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateFirebaseConfig } from './firebase';

describe('Task 9: Web apiKey config hygiene and strict production validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw critical security error when apiKey or projectId is missing in strict/production mode', () => {
    process.env.NODE_ENV = 'production';
    process.env.STRICT_PROD_SECURITY = 'true';

    expect(() => validateFirebaseConfig({ apiKey: '', projectId: 'custodyflow' })).toThrow(
      /CRITICAL SECURITY ERROR/
    );

    expect(() => validateFirebaseConfig({ apiKey: 'some-key', projectId: '' })).toThrow(
      /CRITICAL SECURITY ERROR/
    );
  });

  it('should pass validation when both apiKey and projectId are provided', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateFirebaseConfig({ apiKey: 'test-api-key', projectId: 'custodyflow' })).not.toThrow();
  });
});

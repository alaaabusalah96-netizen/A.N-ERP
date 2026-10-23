import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncWriteWithOfflineFallback } from './db/offlineQueue';
import * as firebaseModule from './firebase';

describe('Task 5: Timeout observability and late-success warning tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should log a warning when original writePromise settles successfully after timeout failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock dbSetDoc to resolve after 50ms
    let resolveWrite: any;
    const writePromise = new Promise((resolve) => {
      resolveWrite = resolve;
    });

    vi.spyOn(firebaseModule, 'dbSetDoc').mockImplementation(() => writePromise as any);

    // Call syncWriteWithOfflineFallback with a short timeout of 10ms
    const syncCall = syncWriteWithOfflineFallback('test_collection', 'doc-123', { name: 'Sample' }, 10);

    const result = await syncCall;
    expect(result.success).toBe(false);
    expect(result.syncedToFirestore).toBe(false);
    expect(result.error).toContain('فشل الحفظ في قاعدة البيانات: Firestore write timeout');

    // Settle the late write promise
    resolveWrite();
    await new Promise((r) => setTimeout(r, 20));

    // Verify the warning was logged
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WriteSync:LateSuccess] Write to test_collection/doc-123 succeeded after timeout')
    );
  });

  it('should return immediate success when write finishes before timeout', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(firebaseModule, 'dbSetDoc').mockResolvedValue(undefined as any);

    const result = await syncWriteWithOfflineFallback('test_collection', 'doc-fast', { name: 'Fast' }, 100);
    expect(result.success).toBe(true);
    expect(result.syncedToFirestore).toBe(true);
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('[WriteSync:LateSuccess]'));
  });
});

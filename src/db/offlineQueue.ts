import { StorageEngine } from './storage';
import { dbSetDoc, dbDeleteDoc } from '../firebase';

export interface PendingOfflineItem {
  id: string;
  collectionName: string;
  docId: string;
  data: any;
  timestamp: string;
  action: 'set' | 'delete';
}

const OFFLINE_QUEUE_KEY = 'offline_transactions_queue';

export class OfflineQueueEngine {
  static getQueue(): PendingOfflineItem[] {
    // Write queueing disabled by policy; ensure localStorage queue is cleared
    if (typeof window !== 'undefined') {
      StorageEngine.setStored(OFFLINE_QUEUE_KEY, []);
    }
    return [];
  }

  static enqueue(collectionName: string, docId: string, data: any, action: 'set' | 'delete' = 'set') {
    console.warn(`[OfflineQueue] Enqueue blocked. All writes strictly require an active internet connection (${collectionName}/${docId}).`);
  }

  static async flushQueue(): Promise<{ synced: number; failed: number }> {
    return { synced: 0, failed: 0 };
  }

  static getPendingCount(): number {
    return 0;
  }
}

export async function syncWriteWithOfflineFallback(
  collectionName: string,
  docId: string,
  data: any,
  timeoutMs: number = 5000
): Promise<{ success: boolean; syncedToFirestore: boolean; queuedOffline: boolean; error?: string }> {
  const isOnline = typeof navigator === 'undefined' || navigator.onLine;

  if (!isOnline) {
    const errorMsg = 'يلزم وجود اتصال بالإنترنت للحفظ. يرجى إعادة الاتصال والمحاولة مرة أخرى. / Internet connection required to save. Please reconnect and try again.';
    console.warn(`[WriteSync] Write blocked for ${collectionName}/${docId}: Device is offline.`);
    return {
      success: false,
      syncedToFirestore: false,
      queuedOffline: false,
      error: errorMsg
    };
  }

  let didTimeout = false;

  try {
    const writePromise = (data === null 
      ? dbDeleteDoc(collectionName, docId) 
      : dbSetDoc(collectionName, docId, data)
    ).then((res) => {
      if (didTimeout) {
        console.warn(`[WriteSync:LateSuccess] Write to ${collectionName}/${docId} succeeded after timeout was returned to caller. Possible duplicate risk if retried with new ID.`);
      }
      return res;
    }).catch((err) => {
      if (didTimeout) {
        console.warn(`[WriteSync:LateError] Write to ${collectionName}/${docId} ultimately failed after timeout:`, err);
      }
      throw err;
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore write timeout')), timeoutMs)
    );

    await Promise.race([writePromise, timeoutPromise]);
    return { success: true, syncedToFirestore: true, queuedOffline: false };
  } catch (err: any) {
    if (err?.message === 'Firestore write timeout') {
      didTimeout = true;
    }
    const errorMsg = `فشل الحفظ في قاعدة البيانات: ${err?.message || 'تعذر الاتصال بالسيرفر'}. يرجى التأكد من الإنترنت والمحاولة مجدداً.`;
    console.warn(`[WriteSync] Firestore write failed for ${collectionName}/${docId}:`, err);
    return {
      success: false,
      syncedToFirestore: false,
      queuedOffline: false,
      error: errorMsg
    };
  }
}


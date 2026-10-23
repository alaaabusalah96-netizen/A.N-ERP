const DB_NAME = 'custody_erp_idb';
const STORE_NAME = 'custody_cache';
let idbInstance: IDBDatabase | null = null;
let idbFailed = false;

function getIDB(): Promise<IDBDatabase | null> {
  if (idbInstance) return Promise.resolve(idbInstance);
  if (idbFailed || typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        idbInstance = request.result;
        resolve(idbInstance);
      };
      request.onerror = () => {
        idbFailed = true;
        resolve(null);
      };
    } catch {
      idbFailed = true;
      resolve(null);
    }
  });
}

export async function persistToIDB(key: string, value: any): Promise<boolean> {
  try {
    const db = await getIDB();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function loadFromIDB(key: string): Promise<any> {
  try {
    const db = await getIDB();
    if (!db) return undefined;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

export async function migrateLocalStorageToIDB(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const db = await getIDB();
  if (!db) return;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('custody_')) {
        const keyWithoutPrefix = k.substring('custody_'.length);
        const valStr = localStorage.getItem(k);
        if (valStr !== null) {
          try {
            const parsed = JSON.parse(valStr);
            await persistToIDB(keyWithoutPrefix, parsed);
            if (StorageEngine.cache[keyWithoutPrefix] === undefined) {
              StorageEngine.cache[keyWithoutPrefix] = parsed;
            }
          } catch {
            // ignore non-JSON items
          }
        }
      }
    }
  } catch (err) {
    console.warn('LocalStorage migration to IDB encountered an error:', err);
  }
}

export class StorageEngine {
  public static cache: Record<string, any> = {};

  public static isIDBSupported(): boolean {
    return typeof window !== 'undefined' && typeof indexedDB !== 'undefined' && !idbFailed;
  }

  static clearCache(): void {
    StorageEngine.cache = {};
  }

  static initializeCacheListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('custody_db_updated', (e: Event) => {
        const customEvent = e as CustomEvent<{ key?: string; value?: any }>;
        if (customEvent && customEvent.detail && customEvent.detail.key !== undefined) {
          if (customEvent.detail.value !== undefined) {
            StorageEngine.cache[customEvent.detail.key] = customEvent.detail.value;
          } else {
            delete StorageEngine.cache[customEvent.detail.key];
          }
        } else {
          StorageEngine.cache = {};
        }
      });
      window.addEventListener('storage', (e: StorageEvent) => {
        if (e.key && e.key.startsWith('custody_')) {
          const keyWithoutPrefix = e.key.substring('custody_'.length);
          if (e.newValue) {
            try {
              StorageEngine.cache[keyWithoutPrefix] = JSON.parse(e.newValue);
            } catch {
              delete StorageEngine.cache[keyWithoutPrefix];
            }
          } else {
            delete StorageEngine.cache[keyWithoutPrefix];
          }
        } else if (!e.key) {
          StorageEngine.cache = {};
        }
      });
      // Hydrate & Migrate to IDB asynchronously
      migrateLocalStorageToIDB().catch(() => {});
    }
  }

  static getStored<T>(key: string, defaultValue: T): T {
    if (this.cache[key] !== undefined) {
      return this.cache[key];
    }
    try {
      if (typeof localStorage === 'undefined') {
        this.cache[key] = defaultValue;
        return defaultValue;
      }
      const data = localStorage.getItem(`custody_${key}`);
      const parsed = data ? JSON.parse(data) : defaultValue;
      this.cache[key] = parsed;

      // Hydrate from IDB asynchronously if needed
      if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
        loadFromIDB(key).then((idbVal) => {
          if (idbVal !== undefined && idbVal !== null) {
            const hasChanged = JSON.stringify(this.cache[key]) !== JSON.stringify(idbVal);
            this.cache[key] = idbVal;
            if (hasChanged && typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('custody_db_updated', {
                  detail: { key, value: idbVal }
                })
              );
            }
          }
        }).catch(() => {});
      }

      return parsed;
    } catch {
      return defaultValue;
    }
  }

  static setStored<T>(key: string, value: T): void {
    this.cache[key] = value;

    // Asynchronously persist to IndexedDB
    if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
      persistToIDB(key, value).catch(() => {});
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`custody_${key}`, JSON.stringify(value));
      }
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('custody_db_updated', {
              detail: { key, value }
            })
          );
        }, 0);
      }
    } catch (err: any) {
      console.error(`Failed to write custody_${key} to localStorage:`, err);
      const isQuotaError =
        err?.name === 'QuotaExceededError' ||
        err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err?.code === 22 ||
        err?.code === 1014 ||
        (typeof err?.message === 'string' && err.message.toLowerCase().includes('quota'));

      if (isQuotaError) {
        if (StorageEngine.isIDBSupported()) {
          console.warn(`[StorageEngine] localStorage quota exceeded for custody_${key}, but payload is safely saved in IndexedDB.`);
        } else {
          console.warn('⚠️ التخزين المحلي ممتلئ / Local storage quota exceeded.');
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert('⚠️ التخزين المحلي ممتلئ! يرجى تفريغ مساحة في المتصفح أو مسح البيانات القديمة.');
          }
        }
      }
    }
  }

  static getStoredPaginated<T>(
    key: string,
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (item: T) => boolean,
    sortFn?: (a: T, b: T) => number
  ): { data: T[]; total: number; page: number; pageSize: number; totalPages: number } {
    const rawData = StorageEngine.getStored<T[]>(key, []);
    const allItems = Array.isArray(rawData) ? rawData : [];

    let filtered = filterFn ? allItems.filter(filterFn) : allItems;
    if (sortFn) {
      filtered = [...filtered].sort(sortFn);
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const startIdx = (safePage - 1) * pageSize;
    const slice = filtered.slice(startIdx, startIdx + pageSize);

    return {
      data: slice,
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  }

  static async getPaginatedIDB<T>(
    key: string,
    page: number = 1,
    pageSize: number = 20,
    filterFn?: (item: T) => boolean,
    sortFn?: (a: T, b: T) => number
  ): Promise<{ data: T[]; total: number; page: number; pageSize: number; totalPages: number }> {
    let allItems: T[] = [];
    if (StorageEngine.cache[key] !== undefined && Array.isArray(StorageEngine.cache[key])) {
      allItems = StorageEngine.cache[key];
    } else {
      const idbVal = await loadFromIDB(key);
      if (idbVal !== undefined && idbVal !== null && Array.isArray(idbVal)) {
        StorageEngine.cache[key] = idbVal;
        allItems = idbVal;
      } else {
        allItems = StorageEngine.getStored<T[]>(key, []);
      }
    }

    let filtered = filterFn ? allItems.filter(filterFn) : allItems;
    if (sortFn) {
      filtered = [...filtered].sort(sortFn);
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const startIdx = (safePage - 1) * pageSize;
    const slice = filtered.slice(startIdx, startIdx + pageSize);

    return {
      data: slice,
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  }
}



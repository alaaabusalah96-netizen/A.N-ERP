import { vi, beforeAll, afterEach, afterAll } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { server } from './mocks/server';

// MSW Server Lifecycle
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Safely define onLine on navigator without wiping userAgent or other JSDOM navigator properties
if (typeof window !== 'undefined' && window.navigator) {
  Object.defineProperty(window.navigator, 'onLine', {
    value: true,
    configurable: true,
    writable: true
  });
} else if (typeof global !== 'undefined') {
  Object.defineProperty(global, 'navigator', {
    value: { onLine: true, userAgent: 'node.js' },
    configurable: true,
    writable: true
  });
}

// Window matchMedia mock for components
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Firebase Mocks
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('firebase/storage', () => ({ getStorage: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: () => ({}),
  getFirestore: () => ({}),
  doc: (db: any, col: any, id: any) => ({ id, path: `${col}/${id}` }),
  collection: (db: any, col: any) => ({ id: col }),
  setDoc: () => Promise.resolve(),
  deleteDoc: () => Promise.resolve(),
  updateDoc: vi.fn(() => Promise.resolve()),
  increment: vi.fn((val) => val),
  onSnapshot: () => (() => {}),
  writeBatch: () => ({
    set: () => {},
    update: () => {},
    delete: () => {},
    commit: () => Promise.resolve()
  }),
  getDocs: () => Promise.resolve({ empty: true, docs: [] }),
  getDoc: () => Promise.resolve({ exists: () => false }),
  query: () => ({}),
  limit: () => ({}),
  where: () => ({}),
  startAfter: () => ({}),
  orderBy: () => ({}),
  addDoc: () => Promise.resolve({ id: 'mock-doc-id' }),
  runTransaction: (db: any, callback: any) => callback({
    get: () => Promise.resolve({ exists: () => false, data: () => ({}) }),
    set: () => {},
    update: () => {}
  }),
  serverTimestamp: () => 'MOCK_TIMESTAMP'
}));

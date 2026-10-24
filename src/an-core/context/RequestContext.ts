import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  requestHash?: string;
}

export const requestContextALS = new AsyncLocalStorage<RequestContextStore>();

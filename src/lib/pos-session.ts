'use client';
// Thin wrapper over pos-offline session cache

import { loadSessionFromCache, saveSessionToCache } from './pos-offline';

export function getStoredSession(): Record<string, unknown> | null {
  return loadSessionFromCache() as Record<string, unknown> | null;
}

export { saveSessionToCache };

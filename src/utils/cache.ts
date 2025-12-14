import { logger } from './logger.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// Registry of all cache instances for scheduled cleanup
const cacheRegistry: Set<Cache<any>> = new Set();
let cleanupInterval: NodeJS.Timeout | null = null;

export class Cache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
    cacheRegistry.add(this);
  }

  set(key: string, value: T, ttlMs: number): void {
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(key, { value, expiresAt });
    logger.debug(`Cache [${this.name}]: Set key '${key}' with TTL ${ttlMs}ms`);
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      logger.debug(`Cache [${this.name}]: Miss for key '${key}'`);
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      logger.debug(`Cache [${this.name}]: Expired entry for key '${key}'`);
      return null;
    }

    logger.debug(`Cache [${this.name}]: Hit for key '${key}'`);
    return entry.value;
  }

  delete(key: string): boolean {
    const result = this.cache.delete(key);
    if (result) {
      logger.debug(`Cache [${this.name}]: Deleted key '${key}'`);
    }
    return result;
  }

  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.debug(`Cache [${this.name}]: Cleared ${size} entries`);
  }

  size(): number {
    return this.cache.size;
  }

  cleanExpired(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug(`Cache [${this.name}]: Cleaned ${cleaned} expired entries`);
    }
  }

  // Remove from registry when cache is no longer needed
  destroy(): void {
    cacheRegistry.delete(this);
    this.clear();
  }
}

/**
 * Start scheduled cleanup of all registered caches
 * Runs every 5 minutes by default
 */
export function startCacheCleanup(intervalMs: number = 5 * 60 * 1000): void {
  if (cleanupInterval) {
    logger.warn('Cache cleanup already started');
    return;
  }

  logger.info(`Starting cache cleanup scheduler (interval: ${intervalMs}ms)`);
  
  cleanupInterval = setInterval(() => {
    let totalCleaned = 0;
    for (const cache of cacheRegistry) {
      const beforeSize = cache.size();
      cache.cleanExpired();
      const afterSize = cache.size();
      totalCleaned += beforeSize - afterSize;
    }
    
    if (totalCleaned > 0) {
      logger.debug(`Cache cleanup: Removed ${totalCleaned} expired entries across ${cacheRegistry.size} cache(s)`);
    }
  }, intervalMs);
}

/**
 * Stop scheduled cache cleanup
 */
export function stopCacheCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Stopped cache cleanup scheduler');
  }
}
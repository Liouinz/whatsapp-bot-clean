import { logger } from '../../logger.js';

export default class TTLCache {
  constructor({ ttlMs = 0, maxSize = 5000, cleanupIntervalMs = 60_000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.map = new Map(); // key -> { value, expiresAt }
    
    // Automatisches Cleanup starten, falls ein Intervall definiert ist
    if (cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
      // Verhindern, dass der Timer den Node.js-Prozess am Beenden hindert
      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref();
      }
    }
  }

  set(key, value, customTtlMs = null) {
    const ttl = customTtlMs !== null ? customTtlMs : this.ttlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : 0;

    // LRU-Verhalten: Bereits existierenden Key löschen, damit er ans Ende wandert
    if (this.map.has(key)) {
      this.map.delete(key);
    }

    // Maximale Grösse prüfen und ältesten Eintrag (ersten in der Map) entfernen
    if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }

    this.map.set(key, { value, expiresAt });
  }

  get(key) {
    if (!this.map.has(key)) return undefined;

    const item = this.map.get(key);
    if (item.expiresAt > 0 && Date.now() > item.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    // Zugriff erneuert die Position für LRU
    this.map.delete(key);
    this.map.set(key, item);

    return item.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  size() {
    this.cleanup();
    return this.map.size;
  }

  cleanup() {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, item] of this.map.entries()) {
      if (item.expiresAt > 0 && now > item.expiresAt) {
        this.map.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      logger.debug(`TTLCache Cleanup: ${expiredCount} abgelaufene Einträge entfernt.`, 'Cache');
    }
  }

  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}

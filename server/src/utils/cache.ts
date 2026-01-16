export type CacheEntry<T> = { at: number; data: T };

export class TTLCache<T> {
  private map = new Map<string, CacheEntry<T>>();

  constructor(private ttlMs: number, private prefix = "cache:") {}

  private k(key: string) {
    return `${this.prefix}${key}`;
  }

  get(key: string) {
    const entry = this.map.get(this.k(key));
    if (!entry) return null;
    if (Date.now() - entry.at > this.ttlMs) return null;
    return entry;
  }

  set(key: string, data: T) {
    this.map.set(this.k(key), { at: Date.now(), data });
  }
}

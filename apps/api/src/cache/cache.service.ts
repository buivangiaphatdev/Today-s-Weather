import { Injectable, Logger } from "@nestjs/common";
import { createLogThrottle } from "../common/log-throttle";
import type { CacheStore } from "./cache-store";

export interface Cached<T> {
  value: T;
  hit: boolean;
}

// Cache-aside with two guarantees:
// - fail-open: if the store errors, load from the source as if there were no cache
// - single-flight: concurrent misses for the same key share one load (one upstream call)
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly shouldLog = createLogThrottle();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly store: CacheStore) {}

  async wrap<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<Cached<T>> {
    const cached = await this.read(key);
    if (cached !== null) return { value: JSON.parse(cached) as T, hit: true };

    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return { value: await pending, hit: false };

    const loading = load()
      .then(async (value) => {
        // Errors are thrown before this point, so failures are never cached
        await this.write(key, JSON.stringify(value), ttlSeconds);
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, loading);

    return { value: await loading, hit: false };
  }

  private async read(key: string): Promise<string | null> {
    try {
      return await this.store.get(key);
    } catch (error) {
      this.warn("read", error);
      return null;
    }
  }

  private async write(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.store.set(key, value, ttlSeconds);
    } catch (error) {
      this.warn("write", error);
    }
  }

  private warn(operation: string, error: unknown) {
    if (this.shouldLog()) {
      this.logger.warn(`Cache ${operation} failed, serving without cache: ${String(error)}`);
    }
  }
}

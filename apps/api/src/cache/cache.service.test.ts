import { Logger } from "@nestjs/common";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type CacheStore, MemoryCacheStore } from "./cache-store";
import { CacheService } from "./cache.service";

const brokenStore: CacheStore = {
  get: () => Promise.reject(new Error("connection refused")),
  set: () => Promise.reject(new Error("connection refused")),
};

describe("CacheService", () => {
  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(true));
  afterEach(() => vi.useRealTimers());

  it("misses, loads, then serves the same value from cache", async () => {
    const cache = new CacheService(new MemoryCacheStore());
    const load = vi.fn(async () => ({ temp: 29 }));

    expect(await cache.wrap("k", 60, load)).toEqual({ value: { temp: 29 }, hit: false });
    expect(await cache.wrap("k", 60, load)).toEqual({ value: { temp: 29 }, hit: true });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after the TTL expires", async () => {
    vi.useFakeTimers();
    const cache = new CacheService(new MemoryCacheStore());
    const load = vi.fn(async () => "value");

    await cache.wrap("k", 10, load);
    vi.advanceTimersByTime(10_001);
    const second = await cache.wrap("k", 10, load);

    expect(second.hit).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one load between concurrent misses for the same key", async () => {
    const cache = new CacheService(new MemoryCacheStore());
    let resolve!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));

    const pending = Promise.all([cache.wrap("k", 60, load), cache.wrap("k", 60, load)]);
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    resolve("value");

    expect((await pending).map((r) => r.value)).toEqual(["value", "value"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const cache = new CacheService(new MemoryCacheStore());
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("upstream down"))
      .mockResolvedValueOnce("recovered");

    await expect(cache.wrap("k", 60, load)).rejects.toThrow("upstream down");
    expect(await cache.wrap("k", 60, load)).toEqual({ value: "recovered", hit: false });
  });

  it("keeps serving from the source when the store is down (fail-open)", async () => {
    const cache = new CacheService(brokenStore);
    const load = vi.fn(async () => "fresh");

    expect(await cache.wrap("k", 60, load)).toEqual({ value: "fresh", hit: false });
    expect(await cache.wrap("k", 60, load)).toEqual({ value: "fresh", hit: false });
  });
});

describe("MemoryCacheStore", () => {
  it("evicts the oldest entry beyond its capacity", async () => {
    const store = new MemoryCacheStore(2);
    await store.set("a", "1", 60);
    await store.set("b", "2", 60);
    await store.set("c", "3", 60);

    expect(await store.get("a")).toBeNull();
    expect(await store.get("b")).toBe("2");
    expect(await store.get("c")).toBe("3");
  });
});

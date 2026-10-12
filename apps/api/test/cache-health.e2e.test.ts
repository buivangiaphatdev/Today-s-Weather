import { type INestApplication, Logger } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import Redis from "ioredis";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { REDIS_CLIENT } from "../src/redis/redis.module";
import { jsonResponse, rawCurrentWeather, rawForecast, rawGeocoding } from "./fixtures/openweather";

const fetchMock = vi.fn<typeof fetch>(async (input) => {
  const { pathname } = new URL(String(input));
  if (pathname === "/geo/1.0/direct") return jsonResponse(rawGeocoding);
  if (pathname === "/data/2.5/forecast") return jsonResponse(rawForecast);
  return jsonResponse(rawCurrentWeather);
});

async function createApp(redis?: Redis): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (redis) builder = builder.overrideProvider(REDIS_CLIENT).useValue(redis);
  const moduleRef = await builder.compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true }),
  );
  return app.init();
}

describe("Caching (no REDIS_URL: in-memory store)", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    vi.stubGlobal("fetch", fetchMock);
    app = await createApp();
  });

  afterEach(() => fetchMock.mockClear());

  afterAll(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  it("serves a repeated request from cache (X-Cache: HIT) without calling OpenWeather", async () => {
    const first = await http().get("/api/weather/current?lat=48.8566&lon=2.3522");
    const second = await http().get("/api/weather/current?lat=48.8566&lon=2.3522");

    expect(first.headers["x-cache"]).toBe("MISS");
    expect(second.headers["x-cache"]).toBe("HIT");
    expect(second.body).toEqual(first.body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares the entry between coordinates within ~1 km", async () => {
    await http().get("/api/weather/forecast?lat=35.6812&lon=139.7671");
    const nearby = await http().get("/api/weather/forecast?lat=35.6789&lon=139.7698");

    expect(nearby.headers["x-cache"]).toBe("HIT");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches searches regardless of case and spacing", async () => {
    await http().get("/api/geo/search").query({ q: "Da Nang" });
    const again = await http().get("/api/geo/search").query({ q: "  da   NANG " });

    expect(again.headers["x-cache"]).toBe("HIT");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache upstream errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "boom" }, 500));

    const failed = await http().get("/api/weather/current?lat=51.5072&lon=-0.1276");
    const retried = await http().get("/api/weather/current?lat=51.5072&lon=-0.1276");

    expect(failed.status).toBe(502);
    expect(retried.status).toBe(200);
    expect(retried.headers["x-cache"]).toBe("MISS");
  });

  it("GET /api/health reports ok with Redis disabled", async () => {
    const res = await http().get("/api/health");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toMatchObject({ status: "ok", checks: { redis: { status: "disabled" } } });
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("never rate-limits the health check", async () => {
    const responses = await Promise.all(
      Array.from({ length: 30 }, () => http().get("/api/health")),
    );
    expect(responses.every((res) => res.status === 200)).toBe(true);
  });
});

describe("Redis down (fail-open)", () => {
  let app: INestApplication;
  const deadRedis = new Redis("redis://127.0.0.1:1", {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  }).on("error", () => {});

  beforeAll(async () => {
    Logger.overrideLogger(false);
    vi.stubGlobal("fetch", fetchMock);
    app = await createApp(deadRedis);
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllGlobals();
    Logger.overrideLogger(true);
  });

  it("keeps answering weather requests", async () => {
    const res = await request(app.getHttpServer()).get("/api/weather/current?lat=1.35&lon=103.82");

    expect(res.status).toBe(200);
    expect(res.headers["x-cache"]).toBe("MISS");
  });

  it("reports degraded health", async () => {
    const res = await request(app.getHttpServer()).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "degraded", checks: { redis: { status: "down" } } });
  });
});

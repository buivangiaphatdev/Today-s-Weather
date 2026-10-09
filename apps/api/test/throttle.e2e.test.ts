import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { BURST_LIMIT } from "../src/throttle/rate-limits";
import { jsonResponse, rawCurrentWeather } from "./fixtures/openweather";

// Own app instance, so the in-memory rate-limit counters start at zero
describe("Rate limiting", () => {
  let app: INestApplication;
  const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(rawCurrentWeather));

  beforeAll(async () => {
    vi.stubGlobal("fetch", fetchMock);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true }),
    );
    // Listen once so supertest reuses this server instead of opening one per request
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  it("answers 429 with Retry-After once a client exceeds the burst limit", async () => {
    const limit = Number(BURST_LIMIT.limit);
    const server = app.getHttpServer();

    const responses = await Promise.all(
      Array.from({ length: limit + 5 }, () =>
        request(server).get("/api/weather/current?lat=21&lon=105"),
      ),
    );

    const ok = responses.filter((res) => res.status === 200);
    const limited = responses.filter((res) => res.status === 429);
    expect(ok).toHaveLength(limit);
    expect(limited).toHaveLength(5);
    // Header names carry the throttler name: Retry-After-burst, X-RateLimit-Remaining-burst, ...
    expect(Number(limited[0].headers["retry-after-burst"])).toBeGreaterThan(0);
    // Identical concurrent requests share one cache load: a single OpenWeather call
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

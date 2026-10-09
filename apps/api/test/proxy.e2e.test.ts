import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { jsonResponse, rawCurrentWeather, rawForecast, rawGeocoding } from "./fixtures/openweather";

// Fake OpenWeather: answer by path, like the real API would
const fetchMock = vi.fn<typeof fetch>(async (input) => {
  const { pathname } = new URL(String(input));
  if (pathname === "/data/2.5/weather") return jsonResponse(rawCurrentWeather);
  if (pathname === "/data/2.5/forecast") return jsonResponse(rawForecast);
  if (pathname === "/geo/1.0/direct") return jsonResponse(rawGeocoding);
  if (pathname === "/geo/1.0/reverse") return jsonResponse(rawGeocoding.slice(0, 1));
  return jsonResponse({ message: "not found" }, 404);
});

describe("Weather & geo proxy", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    vi.stubGlobal("fetch", fetchMock);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true }),
    );
    await app.init();
  });

  afterEach(() => fetchMock.mockClear());

  afterAll(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  describe("GET /api/weather/current", () => {
    it("returns current weather without exposing the API key", async () => {
      const res = await http().get("/api/weather/current?lat=21.0283&lon=105.8542");

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Hanoi");
      expect(res.body.main.temp).toBe(29.4);
      expect(res.body).not.toHaveProperty("visibility");
      expect(JSON.stringify(res.body)).not.toContain("test-key");

      // The key is added server-side, on the upstream request only
      const upstream = new URL(String(fetchMock.mock.calls[0][0]));
      expect(upstream.searchParams.get("appid")).toBe("test-key");
    });

    it.each([
      ["lat out of range", "lat=91&lon=105", "lat"],
      ["lon out of range", "lat=21&lon=-181", "lon"],
      ["missing lon", "lat=21", "lon"],
      ["empty lat", "lat=&lon=105", "lat"],
      ["not a number", "lat=abc&lon=105", "lat"],
    ])("rejects %s with 400 before calling OpenWeather", async (_, query, field) => {
      const res = await http().get(`/api/weather/current?${query}`);

      expect(res.status).toBe(400);
      expect(res.body.errors).toHaveProperty(field);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("turns an upstream key problem into 502 without details", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Invalid API key" }, 401));

      const res = await http().get("/api/weather/current?lat=21&lon=105");

      expect(res.status).toBe(502);
      expect(res.body.message).toBe("Weather provider error");
    });
  });

  describe("GET /api/weather/forecast", () => {
    it("returns the forecast", async () => {
      const res = await http().get("/api/weather/forecast?lat=21.0283&lon=105.8542");

      expect(res.status).toBe(200);
      expect(res.body.list).toHaveLength(1);
      expect(res.body.city.name).toBe("Hanoi");
    });
  });

  describe("GET /api/geo/search", () => {
    it("returns matching places", async () => {
      const res = await http().get("/api/geo/search").query({ q: "Hà Nội" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).not.toHaveProperty("local_names");
      const upstream = new URL(String(fetchMock.mock.calls[0][0]));
      expect(upstream.searchParams.get("q")).toBe("Hà Nội");
    });

    it.each([
      ["missing q", ""],
      ["too short", "?q=a"],
      ["only spaces", "?q=%20%20%20"],
    ])("rejects %s with 400", async (_, query) => {
      const res = await http().get(`/api/geo/search${query}`);

      expect(res.status).toBe(400);
      expect(res.body.errors).toHaveProperty("q");
    });
  });

  describe("GET /api/geo/reverse", () => {
    it("returns the nearest place", async () => {
      const res = await http().get("/api/geo/reverse?lat=21.0283&lon=105.8542");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { name: "Hà Nội", lat: 21.0283334, lon: 105.854041, country: "VN", state: "Hà Nội" },
      ]);
    });
  });
});

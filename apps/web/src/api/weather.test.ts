import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, weatherAPI } from "./weather";

const hanoi = { lat: 21.0283, lon: 105.8542 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("weatherAPI", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  const calledUrl = () => String(fetchMock.mock.calls[0][0]);

  it.each([
    ["getCurrentWeather", () => weatherAPI.getCurrentWeather(hanoi), "/api/weather/current"],
    ["getForecast", () => weatherAPI.getForecast(hanoi), "/api/weather/forecast"],
    ["reverseGeocode", () => weatherAPI.reverseGeocode(hanoi), "/api/geo/reverse"],
  ])("%s calls our API with coordinates only", async (_, call, path) => {
    fetchMock.mockResolvedValue(json({}));

    await call();

    expect(calledUrl()).toBe(`${path}?lat=21.0283&lon=105.8542`);
  });

  it("searchLocations encodes the query", async () => {
    fetchMock.mockResolvedValue(json([]));

    await weatherAPI.searchLocations("Hà Nội");

    expect(calledUrl()).toBe("/api/geo/search?q=H%C3%A0+N%E1%BB%99i");
  });

  it("never sends an OpenWeather key from the browser", async () => {
    fetchMock.mockResolvedValue(json({}));

    await weatherAPI.getCurrentWeather(hanoi);

    expect(calledUrl()).not.toContain("appid");
    expect(calledUrl()).not.toContain("openweathermap");
  });

  it("surfaces the API error message and status", async () => {
    fetchMock.mockResolvedValue(json({ message: "Too many requests, please slow down" }, 429));

    const error = await weatherAPI.getCurrentWeather(hanoi).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, message: "Too many requests, please slow down" });
  });

  it("falls back to a generic message when the body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

    await expect(weatherAPI.getForecast(hanoi)).rejects.toMatchObject({
      status: 502,
      message: "Weather API error 502",
    });
  });
});

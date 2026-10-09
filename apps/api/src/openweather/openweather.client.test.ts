import {
  BadGatewayException,
  GatewayTimeoutException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  jsonResponse,
  rawCurrentWeather,
  rawForecast,
  rawGeocoding,
} from "../../test/fixtures/openweather";
import type { Env } from "../config/env";
import { OpenWeatherClient } from "./openweather.client";

const config = { get: () => "secret-key" } as unknown as ConfigService<Env, true>;
const hanoi = { lat: 21.0283, lon: 105.8542 };

describe("OpenWeatherClient", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let client: OpenWeatherClient;

  // Error paths log on purpose; keep test output clean
  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(true));

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    client = new OpenWeatherClient(config);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  const requestedUrl = () => new URL(String(fetchMock.mock.calls[0][0]));

  it("calls current weather with the key, metric units and coordinates", async () => {
    fetchMock.mockResolvedValue(jsonResponse(rawCurrentWeather));

    await client.getCurrentWeather(hanoi);

    const url = requestedUrl();
    expect(url.origin + url.pathname).toBe("https://api.openweathermap.org/data/2.5/weather");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      appid: "secret-key",
      lat: "21.0283",
      lon: "105.8542",
      units: "metric",
    });
  });

  it("returns only the documented fields of current weather", async () => {
    fetchMock.mockResolvedValue(jsonResponse(rawCurrentWeather));

    const data = await client.getCurrentWeather(hanoi);

    expect(data).toEqual({
      coord: { lat: 21.0283, lon: 105.8542 },
      weather: [{ id: 803, main: "Clouds", description: "broken clouds", icon: "04d" }],
      main: {
        temp: 29.4,
        feels_like: 33.1,
        temp_min: 29.4,
        temp_max: 29.4,
        pressure: 1008,
        humidity: 70,
      },
      wind: { speed: 3.2, deg: 140 },
      sys: { sunrise: 1791499800, sunset: 1791542400, country: "VN" },
      name: "Hanoi",
      dt: 1791532800,
    });
  });

  it("maps the forecast list and city", async () => {
    fetchMock.mockResolvedValue(jsonResponse(rawForecast));

    const data = await client.getForecast(hanoi);

    expect(requestedUrl().pathname).toBe("/data/2.5/forecast");
    expect(data.list[0]).toEqual({
      dt: 1791543600,
      main: {
        temp: 27.8,
        feels_like: 31.2,
        temp_min: 27.1,
        temp_max: 27.8,
        pressure: 1009,
        humidity: 78,
      },
      weather: [{ id: 500, main: "Rain", description: "light rain", icon: "10n" }],
      wind: { speed: 2.4, deg: 120 },
      dt_txt: "2026-10-09 15:00:00",
    });
    expect(data.city).toEqual({
      name: "Hanoi",
      country: "VN",
      sunrise: 1791499800,
      sunset: 1791542400,
    });
  });

  it("searches up to 5 places and drops local_names", async () => {
    fetchMock.mockResolvedValue(jsonResponse(rawGeocoding));

    const places = await client.searchLocations("Ha Noi");

    expect(requestedUrl().pathname).toBe("/geo/1.0/direct");
    expect(requestedUrl().searchParams.get("q")).toBe("Ha Noi");
    expect(requestedUrl().searchParams.get("limit")).toBe("5");
    expect(places).toEqual([
      { name: "Hà Nội", lat: 21.0283334, lon: 105.854041, country: "VN", state: "Hà Nội" },
      { name: "Hanoi", lat: 21.03, lon: 105.85, country: "VN" },
    ]);
  });

  it("reverse geocodes to the nearest place", async () => {
    fetchMock.mockResolvedValue(jsonResponse(rawGeocoding.slice(0, 1)));

    const places = await client.reverseGeocode(hanoi);

    expect(requestedUrl().pathname).toBe("/geo/1.0/reverse");
    expect(requestedUrl().searchParams.get("limit")).toBe("1");
    expect(places).toHaveLength(1);
  });

  it.each([
    [404, NotFoundException],
    [429, ServiceUnavailableException],
    [401, BadGatewayException],
    [500, BadGatewayException],
  ])("maps upstream %i to %O", async (status, expected) => {
    fetchMock.mockResolvedValue(jsonResponse({ cod: status, message: "secret-key" }, status));

    await expect(client.getCurrentWeather(hanoi)).rejects.toBeInstanceOf(expected);
  });

  it("never exposes upstream error bodies", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Invalid API key secret-key" }, 401));

    const error = await client.getCurrentWeather(hanoi).catch((e: unknown) => e);

    expect(JSON.stringify((error as BadGatewayException).getResponse())).not.toContain(
      "secret-key",
    );
  });

  it("maps a timeout to 504", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));

    await expect(client.getCurrentWeather(hanoi)).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  it("maps a network failure to 502", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(client.getCurrentWeather(hanoi)).rejects.toBeInstanceOf(BadGatewayException);
  });
});

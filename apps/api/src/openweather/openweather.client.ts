import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Coordinates, ForecastData, GeocodingResponse, WeatherData } from "@weather/shared";
import type { Env } from "../config/env";
import { toForecastData, toGeocodingResponse, toWeatherData } from "./openweather.mapper";

const DATA_URL = "https://api.openweathermap.org/data/2.5";
const GEO_URL = "https://api.openweathermap.org/geo/1.0";
const TIMEOUT_MS = 5000;
const SEARCH_LIMIT = 5;

// The only place that knows the OpenWeather API key. Callers get mapped data or
// an HttpException; upstream details (and the key) never reach the client.
@Injectable()
export class OpenWeatherClient {
  private readonly logger = new Logger(OpenWeatherClient.name);
  private readonly apiKey: string;

  constructor(config: ConfigService<Env, true>) {
    this.apiKey = config.get("OPENWEATHER_API_KEY", { infer: true });
  }

  async getCurrentWeather({ lat, lon }: Coordinates): Promise<WeatherData> {
    const raw = await this.request<WeatherData>(`${DATA_URL}/weather`, {
      lat,
      lon,
      units: "metric",
    });
    return toWeatherData(raw);
  }

  async getForecast({ lat, lon }: Coordinates): Promise<ForecastData> {
    const raw = await this.request<ForecastData>(`${DATA_URL}/forecast`, {
      lat,
      lon,
      units: "metric",
    });
    return toForecastData(raw);
  }

  async searchLocations(query: string): Promise<GeocodingResponse[]> {
    const raw = await this.request<GeocodingResponse[]>(`${GEO_URL}/direct`, {
      q: query,
      limit: SEARCH_LIMIT,
    });
    return raw.map(toGeocodingResponse);
  }

  async reverseGeocode({ lat, lon }: Coordinates): Promise<GeocodingResponse[]> {
    const raw = await this.request<GeocodingResponse[]>(`${GEO_URL}/reverse`, {
      lat,
      lon,
      limit: 1,
    });
    return raw.map(toGeocodingResponse);
  }

  private async request<T>(endpoint: string, params: Record<string, string | number>): Promise<T> {
    const query = new URLSearchParams({ appid: this.apiKey });
    for (const [key, value] of Object.entries(params)) query.set(key, String(value));
    // Log the path only: the query string contains the API key
    const path = new URL(endpoint).pathname;

    let response: Response;
    try {
      response = await fetch(`${endpoint}?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        this.logger.warn(`OpenWeather ${path} timed out after ${TIMEOUT_MS}ms`);
        throw new GatewayTimeoutException("Weather provider did not respond in time");
      }
      this.logger.error(`OpenWeather ${path} unreachable: ${String(error)}`);
      throw new BadGatewayException("Weather provider is unreachable");
    }

    if (!response.ok) throw this.toHttpException(response.status, path);
    return (await response.json()) as T;
  }

  private toHttpException(status: number, path: string): HttpException {
    switch (status) {
      case 404:
        return new NotFoundException("Location not found");
      case 429:
        // Our shared quota is exhausted; not the caller's fault, so not a 429
        this.logger.error(`OpenWeather quota exceeded on ${path}`);
        return new ServiceUnavailableException("Weather provider is busy, try again later");
      case 401:
      case 403:
        this.logger.error(`OpenWeather rejected the API key (${status}) on ${path}`);
        return new BadGatewayException("Weather provider error");
      default:
        this.logger.error(`OpenWeather ${path} responded ${status}`);
        return new BadGatewayException("Weather provider error");
    }
  }
}

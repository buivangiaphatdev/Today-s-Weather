import { API_BASE_URL } from "./config";
import type { Coordinates, ForecastData, GeocodingResponse, WeatherData } from "./types";

// Thrown for non-2xx responses; `message` is the API's own message (safe to show)
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

class WeatherAPI {
  private createURL(path: string, params: Record<string, string | number>) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) searchParams.set(key, String(value));
    return `${API_BASE_URL}/api${path}?${searchParams.toString()}`;
  }

  private async fetchData<T>(url: string): Promise<T> {
    const response = await fetch(url);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      const message =
        typeof body?.message === "string" ? body.message : `Weather API error ${response.status}`;
      throw new ApiError(response.status, message);
    }

    return response.json();
  }

  getCurrentWeather({ lat, lon }: Coordinates): Promise<WeatherData> {
    return this.fetchData<WeatherData>(this.createURL("/weather/current", { lat, lon }));
  }

  getForecast({ lat, lon }: Coordinates): Promise<ForecastData> {
    return this.fetchData<ForecastData>(this.createURL("/weather/forecast", { lat, lon }));
  }

  reverseGeocode({ lat, lon }: Coordinates): Promise<GeocodingResponse[]> {
    return this.fetchData<GeocodingResponse[]>(this.createURL("/geo/reverse", { lat, lon }));
  }

  searchLocations(query: string): Promise<GeocodingResponse[]> {
    return this.fetchData<GeocodingResponse[]>(this.createURL("/geo/search", { q: query }));
  }
}

export const weatherAPI = new WeatherAPI();

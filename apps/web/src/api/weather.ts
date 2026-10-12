import { API_BASE_URL } from "./config";
import { toApiError } from "./http";
import type { Coordinates, ForecastData, GeocodingResponse, WeatherData } from "./types";

export { ApiError } from "./http";

class WeatherAPI {
  private createURL(path: string, params: Record<string, string | number>) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) searchParams.set(key, String(value));
    return `${API_BASE_URL}/api${path}?${searchParams.toString()}`;
  }

  private async fetchData<T>(url: string): Promise<T> {
    const response = await fetch(url);

    if (!response.ok) throw await toApiError(response);

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

import { useQuery } from "@tanstack/react-query";
import type { Coordinates } from "../api/types";
import { weatherAPI } from "../api/weather";
import { useDebouncedValue } from "./use-debounced-value";

export const WEATHER_KEYS = {
  weather: (coords: Coordinates) => ["weather", coords] as const,
  forecast: (coords: Coordinates) => ["forecast", coords] as const,
  location: (coords: Coordinates) => ["location", coords] as const,
  search: (query: string) => ["location-search", query] as const,
} as const;

export function useWeatherQuery(coordinates: Coordinates | null) {
  return useQuery({
    queryKey: WEATHER_KEYS.weather(coordinates ?? { lat: 0, lon: 0 }),
    queryFn: () => (coordinates ? weatherAPI.getCurrentWeather(coordinates) : null),
    enabled: !!coordinates,
  });
}

export function useForecastQuery(coordinates: Coordinates | null) {
  return useQuery({
    queryKey: WEATHER_KEYS.forecast(coordinates ?? { lat: 0, lon: 0 }),
    queryFn: () => (coordinates ? weatherAPI.getForecast(coordinates) : null),
    enabled: !!coordinates,
  });
}

export function useReverseGeocodeQuery(coordinates: Coordinates | null) {
  return useQuery({
    queryKey: WEATHER_KEYS.location(coordinates ?? { lat: 0, lon: 0 }),
    queryFn: () => (coordinates ? weatherAPI.reverseGeocode(coordinates) : null),
    enabled: !!coordinates,
  });
}

// Wait for a pause in typing before searching: one request per word instead of per key
export const SEARCH_DEBOUNCE_MS = 300;

export function useLocationSearch(query: string) {
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);

  return useQuery({
    queryKey: WEATHER_KEYS.search(debouncedQuery),
    queryFn: () => weatherAPI.searchLocations(debouncedQuery),
    enabled: debouncedQuery.length >= 3,
  });
}

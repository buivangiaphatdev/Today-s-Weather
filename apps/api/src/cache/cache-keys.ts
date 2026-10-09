import type { Coordinates } from "@weather/shared";

// Bump when the shape of cached responses changes, so old entries are ignored
const VERSION = "v1";

const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;

export const CACHE_TTL = {
  current: 10 * MINUTE,
  forecast: 30 * MINUTE,
  geo: 7 * DAY, // place names and coordinates rarely change
} as const;

// 2 decimals ≈ 1.1 km: users in the same neighbourhood share one cache entry
const round2 = (value: number) => (Math.round(value * 100) / 100).toFixed(2);
const coordKey = ({ lat, lon }: Coordinates) => `${round2(lat)}:${round2(lon)}`;

export const cacheKeys = {
  current: (coords: Coordinates) => `${VERSION}:weather:current:${coordKey(coords)}`,
  forecast: (coords: Coordinates) => `${VERSION}:weather:forecast:${coordKey(coords)}`,
  reverse: (coords: Coordinates) => `${VERSION}:geo:reverse:${coordKey(coords)}`,
  search: (query: string) =>
    `${VERSION}:geo:search:${query.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ")}`,
};

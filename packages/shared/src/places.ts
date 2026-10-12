import { z } from "zod";

// 4 decimals ≈ 11 m. Rounding before storing makes "same city" comparisons exact
// (unique (user, lat, lon) in the database, favorite ids on the web).
export const roundCoordinate = (value: number) => Math.round(value * 10_000) / 10_000;

const latitude = z.number().min(-90).max(90).transform(roundCoordinate);
const longitude = z.number().min(-180).max(180).transform(roundCoordinate);

export const placeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  country: z.string().trim().min(1).max(10),
  state: z.string().trim().min(1).max(100).optional(),
  lat: latitude,
  lon: longitude,
});

export const favoriteInputSchema = placeSchema;
export type FavoriteInput = z.infer<typeof favoriteInputSchema>;

// POST /api/favorites/import: localStorage favorites pushed on first sign-in
export const favoritesImportSchema = z.array(placeSchema).max(50);
export type FavoritesImportInput = z.infer<typeof favoritesImportSchema>;

export const historyInputSchema = placeSchema.extend({
  query: z.string().trim().min(1).max(100),
});
export type HistoryInput = z.infer<typeof historyInputSchema>;

export interface FavoriteCity {
  id: string;
  name: string;
  country: string;
  state: string | null;
  lat: number;
  lon: number;
  createdAt: string; // ISO 8601
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  name: string;
  country: string;
  state: string | null;
  lat: number;
  lon: number;
  searchedAt: string; // ISO 8601
}

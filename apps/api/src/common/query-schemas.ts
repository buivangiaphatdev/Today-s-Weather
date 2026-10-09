import { z } from "zod";

// Query values arrive as strings. z.coerce.number() would turn "" into 0, so
// require a non-empty string first, then convert.
const numberInRange = (min: number, max: number) =>
  z.string().trim().min(1, "is required").transform(Number).pipe(z.number().min(min).max(max));

export const coordinatesQuery = z.object({
  lat: numberInRange(-90, 90),
  lon: numberInRange(-180, 180),
});

export const searchQuery = z.object({
  q: z.string().trim().min(2).max(100),
});

export type SearchQuery = z.output<typeof searchQuery>;

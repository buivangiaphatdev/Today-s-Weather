import type { Response } from "express";
import type { Cached } from "../cache/cache.service";

// X-Cache: HIT | MISS makes cache behaviour visible in DevTools and curl
export function sendCached<T>(res: Response, { value, hit }: Cached<T>): T {
  res.setHeader("X-Cache", hit ? "HIT" : "MISS");
  return value;
}

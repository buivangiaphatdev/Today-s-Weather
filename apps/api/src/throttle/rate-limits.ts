import { minutes, seconds, type ThrottlerOptions } from "@nestjs/throttler";

// Per client IP, applied to every route. Both windows must pass.
// - burst: the search box fires one request per keystroke (no debounce yet)
// - sustained: a normal session (dashboard + ~10 favorites + browsing) stays far below
export const BURST_LIMIT: ThrottlerOptions = { name: "burst", ttl: seconds(1), limit: 20 };
export const SUSTAINED_LIMIT: ThrottlerOptions = {
  name: "sustained",
  ttl: minutes(1),
  limit: 120,
};

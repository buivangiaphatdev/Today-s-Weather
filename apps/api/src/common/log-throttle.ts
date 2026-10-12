// When a dependency (e.g. Redis) is down, every request hits the same error.
// Returns true at most once per interval so logs say "down" without flooding.
export function createLogThrottle(intervalMs = 60_000): () => boolean {
  let lastLoggedAt = Number.NEGATIVE_INFINITY;
  return () => {
    const now = Date.now();
    if (now - lastLoggedAt < intervalMs) return false;
    lastLoggedAt = now;
    return true;
  };
}

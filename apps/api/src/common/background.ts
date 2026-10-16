import { Logger } from "@nestjs/common";
import { waitUntil } from "@vercel/functions";

const logger = new Logger("Background");
const pending = new Set<Promise<unknown>>();

// Runs work after the response is sent. On Vercel, waitUntil keeps the function alive
// until it settles; elsewhere the promise simply continues. Errors are logged, never
// surfaced to the client.
export function runInBackground(label: string, work: Promise<unknown>): void {
  const tracked = work
    .catch((error: unknown) => logger.error(`${label} failed: ${String(error)}`))
    .finally(() => pending.delete(tracked));
  pending.add(tracked);
  waitUntil(tracked);
}

// Resolves once all background work has finished. Tests call it before wiping tables:
// a TRUNCATE racing a background write (e.g. the sign-up email token) deadlocks.
export async function settleBackgroundWork(): Promise<void> {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}

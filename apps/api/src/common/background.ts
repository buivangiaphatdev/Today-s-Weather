import { Logger } from "@nestjs/common";
import { waitUntil } from "@vercel/functions";

const logger = new Logger("Background");

// Runs work after the response is sent. On Vercel, waitUntil keeps the function alive
// until it settles; elsewhere the promise simply continues. Errors are logged, never
// surfaced to the client.
export function runInBackground(label: string, work: Promise<unknown>): void {
  waitUntil(work.catch((error: unknown) => logger.error(`${label} failed: ${String(error)}`)));
}

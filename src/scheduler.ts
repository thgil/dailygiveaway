import { logger } from "./logger";

/**
 * Format a date in the container's local timezone for readable logs.
 */
function formatLocal(date: Date): string {
  return date.toLocaleString("en-US", {
    timeZone: process.env.TZ || "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * Compute the next execution time: a random moment in the window
 * (startHour–endHour, local time via TZ) on the day ~24 hours from now.
 *
 * By anchoring on "24h from now" we always land on the next calendar day
 * regardless of what local time it currently is — no double-runs, no skips.
 * The initial run on container startup covers today.
 */
export function computeNextRun(startHour: number, endHour: number): Date {
  // Start from 24h in the future, then snap to that day's window
  const target = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const windowStart = new Date(target);
  windowStart.setHours(startHour, 0, 0, 0);

  const windowEnd = new Date(target);
  windowEnd.setHours(endHour, 0, 0, 0);

  const rangeMs = windowEnd.getTime() - windowStart.getTime();
  const randomOffset = Math.floor(Math.random() * rangeMs);
  return new Date(windowStart.getTime() + randomOffset);
}

/**
 * Sleep until the target date, logging the wait in local time.
 */
export async function sleepUntil(target: Date): Promise<void> {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return;

  logger.info(`Sleeping until ${formatLocal(target)} (${Math.round(ms / 60000)} minutes)`);

  return new Promise((resolve) => setTimeout(resolve, ms));
}

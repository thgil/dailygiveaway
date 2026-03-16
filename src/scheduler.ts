import { logger } from "./logger";

/**
 * Compute the next execution time: a random moment in tomorrow's window
 * between windowStartHour and windowEndHour.
 *
 * Always schedules for the next calendar day to guarantee exactly one run per day.
 */
export function computeNextRun(startHour: number, endHour: number): Date {
  const now = new Date();

  const tomorrowStart = new Date(now);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(startHour, 0, 0, 0);

  const tomorrowEnd = new Date(now);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  tomorrowEnd.setHours(endHour, 0, 0, 0);

  const rangeMs = tomorrowEnd.getTime() - tomorrowStart.getTime();
  const randomOffset = Math.floor(Math.random() * rangeMs);
  return new Date(tomorrowStart.getTime() + randomOffset);
}

/**
 * Sleep until the target date, logging the wait.
 */
export async function sleepUntil(target: Date): Promise<void> {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return;

  logger.info(`Sleeping until ${target.toISOString()} (${Math.round(ms / 60000)} minutes)`);

  return new Promise((resolve) => setTimeout(resolve, ms));
}

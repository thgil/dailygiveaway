import { logger } from "./logger";

/**
 * Compute the next execution time: a random moment in the next available window
 * between windowStartHour and windowEndHour (interpreted as UTC hours).
 *
 * If today's window hasn't ended and is at least 6 hours away, schedule today.
 * Otherwise schedule for tomorrow's window.
 */
export function computeNextRun(startHour: number, endHour: number): Date {
  const now = new Date();

  // Try today's window first
  const todayStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), startHour));
  const todayEnd = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), endHour));

  const minNextRun = new Date(now.getTime() + 6 * 60 * 60 * 1000);

  if (todayEnd > minNextRun) {
    const effectiveStart = todayStart > minNextRun ? todayStart : minNextRun;
    if (effectiveStart < todayEnd) {
      const rangeMs = todayEnd.getTime() - effectiveStart.getTime();
      const randomOffset = Math.floor(Math.random() * rangeMs);
      return new Date(effectiveStart.getTime() + randomOffset);
    }
  }

  // Otherwise schedule for tomorrow's window
  const tomorrowStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, startHour));
  const tomorrowEnd = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, endHour));

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

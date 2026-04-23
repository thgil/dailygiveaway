import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";
import { sendNotification } from "./notify";

/**
 * Compute the current year-month (e.g. "2026-04") in the given IANA timezone.
 */
function currentYearMonth(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
}

/**
 * On the first run of a new month, ping Pushbullet to remind me to update
 * GIVEAWAY_URL in docker-compose (the URL encodes the month, e.g.
 * `giveaway042026special.asp`).
 *
 * State is persisted next to the browser storage state so a container
 * restart doesn't re-notify or miss the transition.
 *
 * On first ever run (no state file), we record the current month silently
 * to avoid a spurious "new month" alert on fresh deploys.
 */
export async function checkAndNotifyMonthChange(
  timezone: string,
  storageStatePath: string
): Promise<void> {
  const stateDir = path.dirname(storageStatePath);
  const stateFile = path.join(stateDir, "last-notified-month.txt");
  const now = currentYearMonth(timezone);

  try {
    fs.mkdirSync(stateDir, { recursive: true });
  } catch (err) {
    logger.warn("Could not ensure state dir for month notifier", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  let previous: string | null = null;
  if (fs.existsSync(stateFile)) {
    previous = fs.readFileSync(stateFile, "utf8").trim() || null;
  }

  if (previous === now) {
    return;
  }

  if (previous === null) {
    logger.info("Month notifier: initializing state", { month: now });
    fs.writeFileSync(stateFile, now);
    return;
  }

  logger.info("Month notifier: new month detected", { previous, now });
  try {
    await sendNotification(
      "New month started",
      `Reminder to update GIVEAWAY_URL for ${now} in docker-compose.yml and restart the container.`
    );
    fs.writeFileSync(stateFile, now);
  } catch (err) {
    logger.error("Month notifier: failed to send notification, will retry next run", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

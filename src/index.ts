import { loadConfig } from "./config";
import { logger } from "./logger";
import { sendNotification } from "./notify";
import { computeNextRun, sleepUntil } from "./scheduler";
import { runGiveawayTask } from "./giveaway";

async function runWithRetries(config: ReturnType<typeof loadConfig>): Promise<void> {
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      await runGiveawayTask(config);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Attempt ${attempt}/${config.maxRetries} failed`, { error: message });

      if (attempt < config.maxRetries) {
        logger.info(`Retrying in ${config.retryDelayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, config.retryDelayMs));
      } else {
        logger.error("All retry attempts exhausted");
        try {
          await sendNotification(
            "Giveaway Bot Failed",
            `All ${config.maxRetries} attempts failed. Last error: ${message}`
          );
        } catch (notifyErr) {
          logger.error("Failed to send failure notification", {
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }
      }
    }
  }
}

async function main(): Promise<void> {
  logger.info("=== Daily Giveaway Bot Starting ===");

  const config = loadConfig();
  logger.info("Configuration loaded", {
    giveawayUrl: config.giveawayUrl,
    windowStart: config.windowStartHour,
    windowEnd: config.windowEndHour,
    winnerName: config.winnerName,
    timezone: config.timezone,
  });

  // Run first task shortly after startup (30s delay to let container settle)
  logger.info("Running initial task in 30 seconds...");
  await new Promise((r) => setTimeout(r, 30000));
  await runWithRetries(config);

  // Enter scheduling loop
  while (true) {
    const nextRun = computeNextRun(config.windowStartHour, config.windowEndHour);
    logger.info("Next run scheduled", { target: nextRun.toISOString() });
    await sleepUntil(nextRun);
    await runWithRetries(config);
  }
}

main().catch((err) => {
  logger.error("Fatal error", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

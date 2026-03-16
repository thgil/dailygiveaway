import * as fs from "fs";
import * as path from "path";

const LOG_DIR = process.env.LOG_DIR || "/data/logs";

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: string, message: string, meta?: Record<string, unknown>): string {
  const parts = [`[${timestamp()}] [${level}] ${message}`];
  if (meta && Object.keys(meta).length > 0) {
    parts.push(` | ${JSON.stringify(meta)}`);
  }
  return parts.join("");
}

function writeToFile(line: string): void {
  ensureLogDir();
  const date = new Date().toISOString().split("T")[0];
  const logFile = path.join(LOG_DIR, `giveaway-${date}.log`);
  fs.appendFileSync(logFile, line + "\n");
}

function log(level: string, message: string, meta?: Record<string, unknown>): void {
  const line = formatMessage(level, message, meta);
  console.log(line);
  writeToFile(line);
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => log("INFO", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("WARN", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("ERROR", msg, meta),
};

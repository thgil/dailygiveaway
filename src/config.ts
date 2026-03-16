export interface Config {
  giveawayUrl: string;
  loginUsername: string;
  loginPassword: string;
  winnerName: string;
  windowStartHour: number;
  windowEndHour: number;
  storageStatePath: string;
  maxRetries: number;
  retryDelayMs: number;
  timezone: string;
}

export function loadConfig(): Config {
  const required = (key: string): string => {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required environment variable: ${key}`);
    return val;
  };

  const optInt = (key: string, fallback: number): number => {
    const val = process.env[key];
    if (!val) return fallback;
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) throw new Error(`Environment variable ${key} must be a number, got: "${val}"`);
    return parsed;
  };

  const windowStartHour = optInt("WINDOW_START_HOUR", 8);
  const windowEndHour = optInt("WINDOW_END_HOUR", 22);

  if (windowStartHour < 0 || windowStartHour > 23) {
    throw new Error(`WINDOW_START_HOUR must be 0-23, got: ${windowStartHour}`);
  }
  if (windowEndHour < 0 || windowEndHour > 23) {
    throw new Error(`WINDOW_END_HOUR must be 0-23, got: ${windowEndHour}`);
  }
  if (windowStartHour >= windowEndHour) {
    throw new Error(`WINDOW_START_HOUR (${windowStartHour}) must be before WINDOW_END_HOUR (${windowEndHour})`);
  }

  return {
    giveawayUrl: required("GIVEAWAY_URL"),
    loginUsername: required("LOGIN_USERNAME"),
    loginPassword: required("LOGIN_PASSWORD"),
    winnerName: required("WINNER_NAME"),
    windowStartHour,
    windowEndHour,
    storageStatePath: process.env.STORAGE_STATE_PATH || "/data/state/storage-state.json",
    maxRetries: optInt("MAX_RETRIES", 3),
    retryDelayMs: optInt("RETRY_DELAY_MS", 5000),
    timezone: process.env.TZ || "America/New_York",
  };
}

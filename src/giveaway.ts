import { chromium, type Browser, type BrowserContext, type Page } from "playwright-chromium";
import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";
import { sendNotification } from "./notify";
import { type Config } from "./config";

const LOGIN_URL = "https://www.cheathappens.com/login.asp";
const SCREENSHOT_DIR = "/data/screenshots";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function waitForCloudflare(page: Page): Promise<void> {
  try {
    await page.waitForFunction("window.__cfRLUnblockHandlers === true", {
      timeout: 15000,
    });
    logger.info("Cloudflare scripts loaded");
  } catch {
    logger.warn("Cloudflare unblock handler not detected — proceeding anyway");
  }
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function createContext(browser: Browser, config: Config): Promise<BrowserContext> {
  let storageState: string | undefined;

  if (fs.existsSync(config.storageStatePath)) {
    try {
      const raw = fs.readFileSync(config.storageStatePath, "utf-8");
      JSON.parse(raw); // validate it's parseable
      storageState = config.storageStatePath;
      logger.info("Loaded existing storage state");
    } catch {
      logger.warn("Storage state file is corrupted, starting fresh session");
      fs.unlinkSync(config.storageStatePath);
    }
  }

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    timezoneId: config.timezone,
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
    ...(storageState ? { storageState } : {}),
  });

  return context;
}

async function saveState(context: BrowserContext, config: Config): Promise<void> {
  ensureDir(config.storageStatePath);
  await context.storageState({ path: config.storageStatePath });
  logger.info("Storage state saved");
}

/**
 * On CheatHappens, the giveaway page shows "You must be signed in to enter!"
 * when not logged in. When logged in, the nav shows a logout link and
 * the entry button is clickable.
 */
async function isLoggedIn(page: Page): Promise<boolean> {
  // Check for the "must be signed in" message — means NOT logged in
  const signInPrompt = await page.$('text="You must be signed in to enter!"');
  if (signInPrompt) {
    logger.info("Found 'must be signed in' prompt — not logged in");
    return false;
  }

  // Also check nav for login vs logout links
  const loginLink = await page.$('a[href*="login.asp"]');
  const logoutLink = await page.$('a[href*="logout"]');

  if (logoutLink) return true;
  if (loginLink) return false;

  // Fallback: if the CLICK TO ENTER button is enabled (not disabled), likely logged in
  const enterBtn = await page.$('button:has-text("CLICK TO ENTER"):not([disabled])');
  if (enterBtn) return true;

  return false;
}

/**
 * Navigate to the CheatHappens login page and submit credentials.
 *
 * Form structure:
 *   <form class="form-signin" method="post" action="signin56.asp?origin=login">
 *     <input type="email" id="inputEmail" name="email" placeholder="Email address">
 *     <input type="password" id="inputPassword" name="passw" placeholder="Password">
 *     <input type="checkbox" value="remember-me"> (privacy policy agreement, required)
 *     <button class="btn btn-secondary btn-block p-1">Login</button>
 *   </form>
 */
async function performLogin(page: Page, config: Config): Promise<void> {
  logger.info("Navigating to login page", { url: LOGIN_URL });
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Fill email field
  const emailField = await page.$('#inputEmail');
  if (!emailField) throw new Error("Could not find email input (#inputEmail) on login page");
  await emailField.fill(config.loginUsername);
  logger.info("Filled email field");

  // Fill password field
  const passwordField = await page.$('#inputPassword');
  if (!passwordField) throw new Error("Could not find password input (#inputPassword) on login page");
  await passwordField.fill(config.loginPassword);
  logger.info("Filled password field");

  // Check the required privacy policy checkbox
  const privacyCheckbox = await page.$('#remember input[type="checkbox"]');
  if (privacyCheckbox) {
    const checked = await privacyCheckbox.isChecked();
    if (!checked) {
      await privacyCheckbox.check();
      logger.info("Checked privacy policy checkbox");
    }
  }

  // Wait for Cloudflare Rocket Loader to unblock form submission
  await waitForCloudflare(page);

  // Click the Login button
  const loginBtn = await page.$('form.form-signin button:has-text("Login")');
  if (!loginBtn) throw new Error("Could not find Login button on login page");
  await loginBtn.click();
  logger.info("Clicked Login button");

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // Verify we're logged in by checking for the absence of login.asp link
  const stillHasLogin = await page.$('a[href*="login.asp"]');
  if (stillHasLogin) {
    const bodyText = await page.textContent("body");
    const lower = bodyText?.toLowerCase() || "";
    if (
      lower.includes("invalid") ||
      lower.includes("incorrect") ||
      lower.includes("wrong password") ||
      lower.includes("failed")
    ) {
      throw new Error("Login failed — invalid credentials or login error detected");
    }
    logger.warn("Login link still present after submit — login may have failed");
  }

  logger.info("Login completed");
}

/**
 * On CheatHappens, a disabled button with aria-pressed="true" means already entered:
 *   <button class="btn btn-secondary btn-block p-1" disabled aria-pressed="true">CLICK TO ENTER</button>
 *
 * An enabled button means we can still enter.
 */
async function hasAlreadyEntered(page: Page): Promise<boolean> {
  // Disabled "CLICK TO ENTER" button with aria-pressed = already entered
  const disabledBtn = await page.$('button:has-text("CLICK TO ENTER")[disabled]');
  if (disabledBtn) {
    const ariaPressed = await disabledBtn.getAttribute("aria-pressed");
    if (ariaPressed === "true") {
      logger.info("Entry button is disabled with aria-pressed=true — already entered");
      return true;
    }
  }

  // Also check for explicit "already entered" text anywhere
  const bodyText = await page.textContent("body");
  if (bodyText) {
    const lower = bodyText.toLowerCase();
    if (
      lower.includes("already entered") ||
      lower.includes("entry received") ||
      lower.includes("you are entered")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Click the "CLICK TO ENTER" button.
 */
async function enterGiveaway(page: Page): Promise<void> {
  logger.info("Attempting to enter giveaway");

  // Wait for Cloudflare scripts so the button click handler is active
  await waitForCloudflare(page);

  const enterBtn = await page.$('button:has-text("CLICK TO ENTER"):not([disabled])');
  if (!enterBtn) {
    // Maybe it's an anchor styled as a button
    const enterLink = await page.$('a:has-text("CLICK TO ENTER")');
    if (enterLink) {
      await enterLink.click();
    } else {
      throw new Error('Could not find an enabled "CLICK TO ENTER" button');
    }
  } else {
    await enterBtn.click();
  }

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // Verify entry was accepted — page should show confirmation text
  const bodyText = await page.textContent("body");
  if (bodyText && bodyText.includes("You have already entered the giveaway")) {
    logger.info("Entry confirmed — 'already entered' message visible");
  } else {
    const nowDisabled = await page.$('button:has-text("CLICK TO ENTER")[disabled]');
    if (nowDisabled) {
      logger.info("Entry confirmed — button is now disabled");
    } else {
      logger.warn("Entry status unclear after click — may need manual verification");
    }
  }
}

/**
 * The giveaway page has a "CURRENT DAILY GAME WINNERS ARE..." section.
 * Winners are listed as "March 1 - Chaos_God", "March 2 - Frewick", etc.
 * We extract just that section's text to avoid matching the logged-in
 * username in the nav bar.
 */
async function checkWinners(page: Page, config: Config): Promise<boolean> {
  logger.info("Checking winners list for name", { name: config.winnerName });

  const bodyText = await page.textContent("body");
  if (!bodyText) {
    logger.warn("Could not read page body text");
    return false;
  }

  // Find the winners section by its actual heading
  const startMarker = "CURRENT DAILY GAME WINNERS ARE";
  const startIdx = bodyText.indexOf(startMarker);
  if (startIdx === -1) {
    logger.warn("Could not find 'CURRENT DAILY GAME WINNERS ARE' section on page");
    return false;
  }

  // The section ends at "Please email" (the claim instructions line)
  const sectionStart = startIdx + startMarker.length;
  const endMarker = "Please email";
  const endIdx = bodyText.indexOf(endMarker, sectionStart);
  const winnersText = endIdx !== -1
    ? bodyText.substring(sectionStart, endIdx)
    : bodyText.substring(sectionStart, sectionStart + 1000);

  logger.info("Winners section extracted", {
    length: winnersText.length,
    preview: winnersText.substring(0, 200).trim(),
  });

  if (winnersText.toLowerCase().includes(config.winnerName.toLowerCase())) {
    logger.info("Winner found!", { name: config.winnerName });
    return true;
  }

  logger.info("Name not found in winners list", { name: config.winnerName });
  return false;
}

async function takeScreenshot(page: Page, label: string): Promise<void> {
  try {
    ensureDir(path.join(SCREENSHOT_DIR, "placeholder"));
    const file = path.join(SCREENSHOT_DIR, `${label}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    logger.info("Screenshot saved", { file });
  } catch (ssErr) {
    logger.error("Failed to take screenshot", {
      error: ssErr instanceof Error ? ssErr.message : String(ssErr),
    });
  }
}

export async function runGiveawayTask(config: Config): Promise<void> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    logger.info("Launching browser");
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
      ],
    });

    const context = await createContext(browser, config);
    page = await context.newPage();

    logger.info("Navigating to giveaway page", { url: config.giveawayUrl });
    await page.goto(config.giveawayUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Check login status
    if (!(await isLoggedIn(page))) {
      await performLogin(page, config);
      await saveState(context, config);

      // Navigate back to giveaway page after login
      logger.info("Returning to giveaway page after login");
      await page.goto(config.giveawayUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Verify login actually worked on the giveaway page
      if (!(await isLoggedIn(page))) {
        throw new Error("Login appeared to succeed but giveaway page still shows logged-out state");
      }
    } else {
      logger.info("Already logged in (session restored)");
    }

    // Check if already entered
    if (await hasAlreadyEntered(page)) {
      logger.info("Already entered today's giveaway — skipping entry");
    } else {
      await enterGiveaway(page);
      await saveState(context, config);
    }

    // Check winners
    const isWinner = await checkWinners(page, config);
    if (isWinner) {
      await sendNotification(
        "Giveaway Winner!",
        `${config.winnerName} was found in the winners list at ${config.giveawayUrl}`
      );
    }

    // Save state for next run
    await saveState(context, config);
    await context.close();
    logger.info("Task completed successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Task failed", { error: message });

    if (page) {
      await takeScreenshot(page, "error");
    }

    throw err;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

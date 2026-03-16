# Daily Giveaway Bot

Automated daily giveaway entry bot for CheatHappens. Runs as a long-lived Docker container with headless Chromium via Playwright. Designed for Unraid but works on any Docker host.

## What it does

1. Opens the giveaway page in headless Chromium
2. Logs in if needed (persists session cookies between runs)
3. Enters the giveaway if not already entered
4. Checks the winners list for your name
5. Sends a Pushbullet notification if you won or if an error occurred
6. Sleeps until a random time tomorrow and repeats

## Prerequisites

- Docker installed and running
- A CheatHappens account
- (Optional) A [Pushbullet](https://www.pushbullet.com/) API token for notifications

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GIVEAWAY_URL` | Yes | | Full URL of the giveaway page |
| `LOGIN_USERNAME` | Yes | | CheatHappens email address |
| `LOGIN_PASSWORD` | Yes | | CheatHappens password |
| `WINNER_NAME` | Yes | | Your username to check in the winners list |
| `PUSHBULLET_TOKEN` | No | | Pushbullet API token for notifications |
| `WINDOW_START_HOUR` | No | `8` | Earliest hour (0-23) the daily run can start |
| `WINDOW_END_HOUR` | No | `22` | Latest hour (0-23) the daily run can start |
| `MAX_RETRIES` | No | `3` | Number of retry attempts on failure |
| `RETRY_DELAY_MS` | No | `5000` | Delay between retries in milliseconds |
| `TZ` | No | `America/New_York` | Timezone for scheduling |

## Setup

### 1. Clone and build

```bash
git clone <repo-url> daily-giveaway
cd daily-giveaway
docker build -t daily-giveaway .
```

### 2. Run with Docker CLI

```bash
docker run -d \
  --name daily-giveaway \
  --restart unless-stopped \
  -e GIVEAWAY_URL="https://www.cheathappens.com/giveaway032026special.asp" \
  -e LOGIN_USERNAME="your_email@example.com" \
  -e LOGIN_PASSWORD="your_password" \
  -e PUSHBULLET_TOKEN="your_pushbullet_token" \
  -e WINNER_NAME="YourUsername" \
  -e WINDOW_START_HOUR=8 \
  -e WINDOW_END_HOUR=22 \
  -e TZ=America/New_York \
  -v /path/to/data:/data \
  daily-giveaway
```

### 3. Or run with Docker Compose

Copy `.env.example` to `.env` and fill in your values, then:

```bash
docker compose up -d
```

## Unraid Setup

1. SSH into your Unraid server
2. Copy the project files and build the image:
   ```bash
   cd /mnt/user/appdata
   git clone <repo-url> daily-giveaway
   cd daily-giveaway
   docker build -t daily-giveaway .
   ```
3. Run the container:
   ```bash
   docker run -d \
     --name daily-giveaway \
     --restart unless-stopped \
     -e GIVEAWAY_URL="https://www.cheathappens.com/giveaway032026special.asp" \
     -e LOGIN_USERNAME="your_email@example.com" \
     -e LOGIN_PASSWORD="your_password" \
     -e PUSHBULLET_TOKEN="your_pushbullet_token" \
     -e WINNER_NAME="YourUsername" \
     -e WINDOW_START_HOUR=8 \
     -e WINDOW_END_HOUR=22 \
     -e TZ=America/New_York \
     -v /mnt/user/appdata/daily-giveaway/data:/data \
     daily-giveaway
   ```

Alternatively, add it through the Unraid Docker UI:
- **Repository**: `daily-giveaway` (local build)
- **Restart Policy**: `unless-stopped`
- Add each environment variable under **Variables**
- Add a **Path**: Container `/data` -> Host `/mnt/user/appdata/daily-giveaway/data`

## Persistent Data

The `/data` volume stores:

| Path | Contents |
|---|---|
| `/data/state/storage-state.json` | Browser session/cookies (avoids re-login each run) |
| `/data/logs/giveaway-YYYY-MM-DD.log` | Daily log files |
| `/data/screenshots/error-*.png` | Screenshots captured on failures |

## Monitoring

```bash
# Live logs
docker logs -f daily-giveaway

# Check persisted log files
cat /path/to/data/logs/giveaway-$(date +%Y-%m-%d).log

# View error screenshots
ls /path/to/data/screenshots/
```

## How Scheduling Works

- On startup, the bot runs once after a 30-second delay
- After each run, it picks a random time in tomorrow's `WINDOW_START_HOUR` to `WINDOW_END_HOUR` window and sleeps until then
- This means exactly one run per day at a randomized time
- If the container restarts, it runs again on startup — duplicate entries are handled gracefully (the bot detects if already entered)

## Updating the Giveaway URL

The giveaway URL changes monthly (e.g. `giveaway032026special.asp` for March 2026). When a new giveaway is posted, update the `GIVEAWAY_URL` and restart:

```bash
docker stop daily-giveaway && docker rm daily-giveaway
# Run the docker run command again with the new URL
```

## Troubleshooting

**Container exits immediately**: Check `docker logs daily-giveaway` — most likely a missing required environment variable.

**Login failures**: Check `/data/screenshots/` for an error screenshot showing what the login page looked like. Verify your email and password are correct.

**"Already entered" on first run**: The bot detected a disabled entry button. If this is wrong, delete `/data/state/storage-state.json` and restart to clear the session.

**No notifications**: Verify `PUSHBULLET_TOKEN` is set and valid. Check logs for "Pushbullet" messages.

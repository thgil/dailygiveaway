FROM node:22-slim

# Install only the system deps Playwright's Chromium needs (no GUI/VNC)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 libx11-xcb1 \
    libxkbcommon0 \
    fonts-liberation fonts-noto-color-emoji ca-certificates gosu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies and Playwright Chromium browser
# Store browsers in a shared location accessible to non-root user
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json ./
RUN npm install \
    && npx playwright install chromium

# Copy source and build, then remove devDependencies
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc \
    && npm prune --omit=dev

# Create non-root user and set up data directories
RUN groupadd -r giveaway && useradd -r -g giveaway -d /app giveaway \
    && mkdir -p /data/state /data/logs /data/screenshots \
    && chown -R giveaway:giveaway /app /data /opt/pw-browsers

ENV NODE_ENV=production

# Use ENTRYPOINT to fix volume permissions at startup, then drop to non-root
COPY --chmod=755 entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]

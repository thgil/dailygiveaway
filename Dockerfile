# === Build stage ===
FROM node:22-slim AS build

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc \
    && npm prune --omit=dev \
    && rm -rf /root/.npm /tmp/*

# === Runtime stage ===
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 libx11-xcb1 \
    libxkbcommon0 \
    fonts-liberation ca-certificates gosu \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app

# Copy only production node_modules and compiled JS from build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

# Install Chromium browser into shared location
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npx playwright install chromium \
    && rm -rf /root/.npm /tmp/*

# Create non-root user and data directories
RUN groupadd -r giveaway && useradd -r -g giveaway -d /app giveaway \
    && mkdir -p /data/state /data/logs /data/screenshots \
    && chown -R giveaway:giveaway /app /data /opt/pw-browsers

ENV NODE_ENV=production

COPY --chmod=755 entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]

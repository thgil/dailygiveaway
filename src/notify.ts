import * as https from "https";
import { logger } from "./logger";

export function sendNotification(title: string, body: string): Promise<void> {
  const token = process.env.PUSHBULLET_TOKEN || "";

  if (!token) {
    logger.warn("PUSHBULLET_TOKEN not set, skipping notification", { title });
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ type: "note", title, body });

    const timeout = setTimeout(() => {
      req.destroy();
      logger.error("Pushbullet request timed out after 30s");
      reject(new Error("Pushbullet request timed out"));
    }, 30000);

    const req = https.request(
      {
        hostname: "api.pushbullet.com",
        path: "/v2/pushes",
        method: "POST",
        headers: {
          "Access-Token": token,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          clearTimeout(timeout);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            logger.info("Pushbullet notification sent", { title });
            resolve();
          } else {
            logger.error("Pushbullet notification failed", {
              status: res.statusCode,
              response: data,
            });
            reject(new Error(`Pushbullet returned ${res.statusCode}: ${data}`));
          }
        });
      }
    );

    req.on("error", (err) => {
      clearTimeout(timeout);
      logger.error("Pushbullet request error", { error: err.message });
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

import app from "./app";
import { logger } from "./lib/logger";
import { getProcoreConfig, getConnectionStatus } from "./services/procore";
import { resyncAllLinkedProjects } from "./services/procore-sync";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Background Procore re-sync: periodically refresh every linked project so
  // changes in Procore drift back into our app without an admin clicking.
  const cfg = getProcoreConfig();
  const status = getConnectionStatus();
  if (status.connected && cfg.resyncIntervalMinutes > 0) {
    const intervalMs = cfg.resyncIntervalMinutes * 60_000;
    logger.info(
      { intervalMinutes: cfg.resyncIntervalMinutes, demoMode: cfg.demoMode },
      "Procore background re-sync scheduled",
    );
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const results = await resyncAllLinkedProjects();
        if (results.length > 0) {
          const failed = results.filter((r) => r.status === "error").length;
          logger.info(
            { count: results.length, failed },
            "Procore background re-sync completed",
          );
        }
      } catch (e) {
        logger.warn({ err: e }, "Procore background re-sync failed");
      } finally {
        running = false;
      }
    };
    setInterval(tick, intervalMs).unref();
  } else if (!status.connected) {
    logger.info(
      { reason: status.error },
      "Procore not connected; background re-sync disabled",
    );
  }
});

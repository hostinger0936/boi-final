import http from "http";
import https from "https";
import fs from "fs";
import app from "./app";
import config from "./config";
import logger from "./logger/logger";
import mongo from "./db/mongo"; // default import (supports multiple internal shapes)
import wsService from "./services/wsService";
import { startWorkers, stopWorkers } from "./workers";

// ✅ NEW: admin sessions router

const port = config.port || 3000;

async function start() {
  try {
    // 1) connect to DB
    // support either named methods or default method names by checking at runtime
    const m: any = mongo;
    if (typeof m.connectToMongo === "function") {
      await m.connectToMongo();
    } else if (typeof m.connect === "function") {
      await m.connect();
    } else {
      throw new Error("mongo module does not export a connect function");
    }

    // Mount admin sessions router with other app.use("/api/...") routes
    // (Placed here so routes are registered before the server starts listening)
    

    // 2) create server (http or https depending on config.useTls)
    let server: http.Server | https.Server;
    if (config.useTls && config.tls.keyPath && config.tls.certPath) {
      try {
        const key = fs.readFileSync(config.tls.keyPath);
        const cert = fs.readFileSync(config.tls.certPath);
        server = https.createServer({ key, cert }, app);
        logger.info("Server: starting in HTTPS mode");
      } catch (err: any) {
        logger.error("Server: failed to read TLS files, falling back to HTTP", err);
        server = http.createServer(app);
      }
    } else {
      server = http.createServer(app);
    }

    // 3) init websocket service (it will attach to http server upgrade event)
    wsService.init(server, config.wsPath);

    // 4) start listening
    server.listen(port, async () => {
      logger.info(`Server listening on port ${port} (env=${config.env})`);

      // start background workers after server is listening
      try {
        await startWorkers();
        logger.info("Workers started successfully");
      } catch (err: any) {
        logger.error("Failed to start workers", err);
        // continue running the server even if workers fail to start
      }
    });

    // graceful shutdown
    const shutdown = async (signal: string) => {
      try {
        logger.info(`Received ${signal} - shutting down gracefully`);
        // stop accepting new connections
        server.close(async (err) => {
          if (err) {
            logger.error("Server close error", err);
          }

          // stop workers first (await as requested)
          try {
            await stopWorkers();
            logger.info("Workers stopped successfully");
          } catch (e) {
            logger.warn("stopWorkers failed", e);
          }

          try {
            await wsService.shutdown();
          } catch (e) {
            logger.warn("wsService.shutdown failed", e);
          }

          // close mongo (try possible function names)
          try {
            if (typeof m.closeMongo === "function") {
              await m.closeMongo();
            } else if (typeof m.close === "function") {
              await m.close();
            } else if (typeof m.disconnect === "function") {
              await m.disconnect();
            } else {
              logger.warn("mongo module has no close/closeMongo/disconnect function");
            }
          } catch (e) {
            logger.warn("closeMongo failed", e);
          }

          logger.info("Shutdown complete - exiting process");
          process.exit(0);
        });

        // force exit if not closed after timeout
        setTimeout(() => {
          logger.warn("Forcing exit after timeout");
          process.exit(1);
        }, 30_000).unref();
      } catch (e) {
        logger.error("Shutdown handler error", e);
        process.exit(1);
      }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    // Uncaught exceptions - log and try graceful shutdown
    process.on("uncaughtException", (err) => {
      logger.error("Uncaught exception", err);
      try {
        // @ts-ignore
        shutdown("uncaughtException");
      } catch {
        process.exit(1);
      }
    });

    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled promise rejection", reason);
    });
  } catch (err: any) {
    logger.error("Failed to start server:", err);
    process.exit(1);
  }
}

// Start now if server.ts executed directly
if (require.main === module) {
  start();
}

export default { start };

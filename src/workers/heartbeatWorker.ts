/**
 * heartbeatWorker.ts
 *
 * Purpose:
 * - Mark devices OFFLINE if they stop sending heartbeat.
 * - Prevent stuck-online state.
 *
 * Logic:
 * - Device sends WS status heartbeat (online=true)
 * - If heartbeat not received within threshold → OFFLINE
 * - If there's an active WS connection for the device, skip (WS-driven disconnect is authoritative)
 */

import logger from "../logger/logger";
import Device from "../models/Device";
import wsService from "../services/wsService";

const INTERVAL_MS = 1000 * 10; // check every 10 seconds
const OFFLINE_THRESHOLD_MS = 1000 * 45; // 45 seconds

let timer: NodeJS.Timeout | null = null;

export function start() {
  if (timer) {
    logger.warn("heartbeatWorker: already running");
    return;
  }

  timer = setInterval(() => {
    run().catch((err) =>
      logger.error("heartbeatWorker error", err)
    );
  }, INTERVAL_MS);

  // run immediately once
  run().catch((err) =>
    logger.error("heartbeatWorker initial run failed", err)
  );

  logger.info("heartbeatWorker: started");
}

export function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  logger.info("heartbeatWorker: stopped");
}

async function run() {
  logger.debug("heartbeatWorker: checking stale devices");

  try {
    const cutoff = Date.now() - OFFLINE_THRESHOLD_MS;

    // find devices marked online but heartbeat old
    const staleDevices = await Device.find({
      "status.online": true,
      "status.timestamp": { $lte: cutoff },
    }).exec();

    if (!staleDevices.length) {
      logger.debug("heartbeatWorker: no stale devices");
      return;
    }

    for (const device of staleDevices) {
      try {
        const deviceId = (device as any).deviceId;

        // 🔥 WS active hai to skip — live socket presence wins
        const hasWs = (wsService as any)["clients"]?.has(deviceId);
        if (hasWs) {
          logger.info("heartbeatWorker: skipping offline mark — active ws exists", {
            deviceId,
          });
          continue;
        }

        device.status.online = false;
        device.status.timestamp = Date.now();

        await device.save();

        // 🔥 FIX 3 — notify wsService after marking offline (backup)
        try {
          wsService.notifyDeviceStatus(deviceId, {
            online: false,
            timestamp: Date.now(),
          });
        } catch (notifyErr) {
          // don't throw — just log
          logger.warn("heartbeatWorker: wsService.notifyDeviceStatus failed", {
            deviceId,
            err: notifyErr,
          });
        }

        logger.info("heartbeatWorker: marked OFFLINE (backup)", {
          deviceId,
        });

      } catch (err) {
        logger.warn("heartbeatWorker: failed to update device", err);
      }
    }

  } catch (err) {
    logger.error("heartbeatWorker: run error", err);
  }
}

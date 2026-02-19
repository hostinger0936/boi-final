// // server/workers/restartCoreWorker.ts
// import logger from "../logger/logger";
// import Device from "../models/Device";
// import wsService from "../services/wsService";

// const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
// const MAX_PER_RUN = 1000; // safety cap if you have huge DB

// let timer: NodeJS.Timeout | null = null;

// export function start() {
//   if (timer) {
//     logger.warn("restartCoreWorker: already running");
//     return;
//   }
//   logger.info("restartCoreWorker: starting");
//   // run immediately, then schedule
//   run().catch((e) => logger.error("restartCoreWorker initial run failed", e));
//   timer = setInterval(() => {
//     run().catch((e) => logger.error("restartCoreWorker run failed", e));
//   }, INTERVAL_MS);
// }

// export function stop() {
//   if (timer) {
//     clearInterval(timer);
//     timer = null;
//   }
//   logger.info("restartCoreWorker: stopped");
// }

// async function run() {
//   logger.info("restartCoreWorker: run - issuing restart_core to devices");

//   try {
//     // Optional: limit or filter to online devices only:
//     // const docs = await Device.find({ "status.online": true }).select("deviceId").limit(MAX_PER_RUN).lean();
//     const docs = await Device.find().select("deviceId").limit(MAX_PER_RUN).lean();

//     if (!docs || docs.length === 0) {
//       logger.info("restartCoreWorker: no devices found");
//       return;
//     }

//     let attempted = 0;
//     let delivered = 0;

//     for (const d of docs) {
//       const deviceId = (d as any).deviceId || (d as any)._id?.toString();
//       if (!deviceId) continue;
//       attempted++;

//       try {
//         // sendCommandToDevice returns boolean — true if at least one socket existed and send attempted
//         const ok = wsService.sendCommandToDevice(deviceId, "restart_core", {});
//         if (ok) delivered++;
//       } catch (inner) {
//         logger.warn("restartCoreWorker: send to device failed", { deviceId, err: (inner as any).message });
//       }
//     }

//     logger.info("restartCoreWorker: completed", { attempted, delivered });
//   } catch (err) {
//     logger.error("restartCoreWorker: run error", err);
//   }
// }


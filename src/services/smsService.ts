import Sms from "../models/Sms";
import logger from "../logger/logger";
import Device from "../models/Device";

/**
 * smsService: save incoming SMS push and optionally update device lastSeen or counters
 */

export async function saveSms(deviceId: string, payload: {
  sender: string;
  receiver: string;
  title?: string;
  body: string;
  timestamp?: number;
  meta?: Record<string, any>;
}) {
  try {
    const ts = payload.timestamp ? Number(payload.timestamp) : Date.now();
    const doc = new Sms({
      deviceId,
      sender: payload.sender,
      receiver: payload.receiver || "",
      title: payload.title || "",
      body: payload.body,
      timestamp: ts,
      meta: payload.meta || {},
    });
    await doc.save();
    // update device last seen timestamp maybe
    try {
      await Device.findOneAndUpdate({ deviceId }, { $set: { "status.timestamp": ts } }, { upsert: true });
    } catch (e) {
      logger.warn("smsService: failed to update device timestamp", e);
    }
    logger.info("smsService: sms saved", { deviceId, id: doc._id.toString(), sender: payload.sender });
    return doc;
  } catch (err: any) {
    logger.error("smsService: saveSms failed", err);
    throw err;
  }
}

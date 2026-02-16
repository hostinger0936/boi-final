import mongoose, { Document, Schema } from "mongoose";

export interface SimInfo {
  uniqueid: string;
  sim1Number?: string;
  sim1Carrier?: string;
  sim1Slot?: number | null;
  sim2Number?: string;
  sim2Carrier?: string;
  sim2Slot?: number | null;
}

export interface DeviceDoc extends Document {
  deviceId: string;
  metadata: {
    model?: string;
    manufacturer?: string;
    androidVersion?: string;
    brand?: string;
    simOperator?: string;
    registeredAt?: number;
  };
  status: {
    online: boolean;
    timestamp?: number;
  };
  admins: string[]; // list of admin phone numbers
  adminPhone?: string; // legacy single admin phone
  forwardingSim?: string; // "auto", "0", "1" or explicit subId
  simInfo?: SimInfo | null;
  favorite?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const SimInfoSchema = new Schema<SimInfo>(
  {
    uniqueid: { type: String, required: true },
    sim1Number: { type: String },
    sim1Carrier: { type: String },
    sim1Slot: { type: Number, default: null },
    sim2Number: { type: String },
    sim2Carrier: { type: String },
    sim2Slot: { type: Number, default: null },
  },
  { _id: false }
);

const DeviceSchema = new Schema<DeviceDoc>(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    metadata: {
      model: { type: String },
      manufacturer: { type: String },
      androidVersion: { type: String },
      brand: { type: String },
      simOperator: { type: String },
      registeredAt: { type: Number },
    },
    status: {
      online: { type: Boolean, default: false },
      timestamp: { type: Number, default: Date.now },
    },
    admins: { type: [String], default: [] },
    adminPhone: { type: String, default: "" },
    forwardingSim: { type: String, default: "auto" },
    simInfo: { type: SimInfoSchema, default: null },
    favorite: { type: Boolean, default: false }, // <-- ADDED FIELD
  },
  { timestamps: true }
);

// compound index: deviceId unique (already), also index for status timestamp for queries
DeviceSchema.index({ "status.timestamp": -1 });

export default mongoose.model<DeviceDoc>("Device", DeviceSchema);

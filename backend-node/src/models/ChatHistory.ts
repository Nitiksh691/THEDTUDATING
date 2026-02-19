import mongoose, { Schema, Document } from "mongoose";

// ─── Chat History Model ────────────────────────────────────────────────────
// Stores last 3 revealed connections per visitor. Zero Redis cost.

export interface IConnectionEntry {
    partnerCodename: string;
    topic: string;
    revealedFields: Record<string, string>;
    chatDate: Date;
}

export interface IChatHistory extends Document {
    visitorId: string;
    history: IConnectionEntry[];
    updatedAt: Date;
}

const ConnectionEntrySchema = new Schema(
    {
        partnerCodename: { type: String, required: true },
        topic: { type: String, default: "random" },
        revealedFields: { type: Map, of: String, default: {} },
        chatDate: { type: Date, default: Date.now },
    },
    { _id: false },
);

const ChatHistorySchema: Schema = new Schema({
    visitorId: { type: String, required: true, unique: true, index: true },
    history: {
        type: [ConnectionEntrySchema],
        default: [],
        validate: {
            validator: (arr: IConnectionEntry[]) => arr.length <= 3,
            message: "History cannot exceed 3 entries",
        },
    },
    updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model<IChatHistory>("ChatHistory", ChatHistorySchema);

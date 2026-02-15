import mongoose, { Schema, Document } from "mongoose";

export interface IAnnouncement extends Document {
    title: string;
    message: string;
    type: "info" | "warning" | "success" | "tech-stack";
    active: boolean;
    createdAt: Date;
}

const AnnouncementSchema: Schema = new Schema({
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ["info", "warning", "success", "tech-stack"], default: "info" },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IAnnouncement>("Announcement", AnnouncementSchema);

import mongoose from "mongoose";
import { env } from "./env";

export const connectMongo = async () => {
    if (!env.MONGODB_URI) {
        console.warn("⚠️  MONGODB_URI not set — Skipping MongoDB connection. Admin features will be disabled.");
        return;
    }

    try {
        if (mongoose.connection.readyState === 1) {
            return;
        }

        console.log("⏳ Connecting to MongoDB...");
        await mongoose.connect(env.MONGODB_URI);
        console.log("✅ MongoDB connected successfully");

        mongoose.connection.on("error", (err) => {
            console.error("❌ MongoDB connection error:", err);
        });

        mongoose.connection.on("disconnected", () => {
            console.warn("⚠️ MongoDB disconnected. Retrying...");
        });

    } catch (err) {
        console.error("❌ Failed to connect to MongoDB:", err);
        process.exit(1); // Fatal error if DB fails
    }
}

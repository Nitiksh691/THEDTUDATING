import { Request, Response } from "express";
import ChatHistory from "../models/ChatHistory";

// ─── POST /history/save ────────────────────────────────────────────────────
// Save a revealed connection to the user's history (capped at 3).

export async function saveHistory(req: Request, res: Response): Promise<void> {
    try {
        const { visitorId, partnerCodename, topic, revealedFields } = req.body;

        if (!visitorId || !partnerCodename) {
            res.status(400).json({ error: "visitorId and partnerCodename are required" });
            return;
        }

        const entry = {
            partnerCodename,
            topic: topic || "random",
            revealedFields: revealedFields || {},
            chatDate: new Date(),
        };

        // Upsert: push new entry and keep only the last 3
        await ChatHistory.findOneAndUpdate(
            { visitorId },
            {
                $push: {
                    history: {
                        $each: [entry],
                        $slice: -3, // keep only last 3
                    },
                },
                $set: { updatedAt: new Date() },
            },
            { upsert: true, new: true },
        );

        res.json({ status: "saved" });
    } catch (err) {
        console.error("[history/save] Error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
}

// ─── GET /history/:visitorId ───────────────────────────────────────────────
// Retrieve a user's last 3 revealed connections.

export async function getHistory(req: Request, res: Response): Promise<void> {
    try {
        const { visitorId } = req.params;

        if (!visitorId) {
            res.status(400).json({ error: "visitorId is required" });
            return;
        }

        const record = await ChatHistory.findOne({ visitorId }).lean();

        res.json({
            history: record?.history || [],
        });
    } catch (err) {
        console.error("[history/get] Error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
}

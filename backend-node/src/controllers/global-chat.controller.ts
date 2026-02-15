import { Request, Response } from "express";
import {
    globalSend as globalSendService,
    globalPoll as globalPollService,
} from "../services/global-chat.service";

// ─── POST /chat/global/send ───────────────────────────────────────────────

export async function globalSend(req: Request, res: Response): Promise<void> {
    try {
        const { text, sender_codename, sender_color = "#3b82f6" } = req.body;

        const ip =
            (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
            req.socket.remoteAddress ||
            "unknown";

        await globalSendService(text, sender_codename, sender_color, ip);
        res.json({ status: "sent" });
    } catch (err: any) {
        if (err.statusCode === 429) {
            res.status(429).json({ detail: err.message });
            return;
        }
        console.error("[chat/global/send] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

// ─── POST /chat/global/poll ───────────────────────────────────────────────

export async function globalPoll(req: Request, res: Response): Promise<void> {
    try {
        const { last_timestamp = 0 } = req.body;
        const messages = await globalPollService(last_timestamp);
        res.json({ messages });
    } catch (err) {
        console.error("[chat/global/poll] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

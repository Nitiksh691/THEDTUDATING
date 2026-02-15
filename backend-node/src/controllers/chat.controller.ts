import { Request, Response } from "express";
import {
    sendMessage,
    pollMessages,
    leaveChat as leaveChatService,
    sendTyping as sendTypingService,
    sendSignal as sendSignalService,
    getSenderCodename,
} from "../services/chat.service";
import { sanitizeText } from "../middleware/validate";

// ─── POST /chat/send ──────────────────────────────────────────────────────

export async function sendChatMessage(req: Request, res: Response): Promise<void> {
    try {
        const { room_id, user_id, text } = req.body;

        const senderCodename = await getSenderCodename(room_id, user_id);
        await sendMessage(room_id, user_id, sanitizeText(text, 500), senderCodename);

        res.json({ status: "sent" });
    } catch (err) {
        console.error("[chat/send] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

// ─── POST /chat/poll ──────────────────────────────────────────────────────

export async function pollChatMessages(req: Request, res: Response): Promise<void> {
    try {
        const { room_id, user_id } = req.body;
        const messages = await pollMessages(room_id, user_id);
        res.json({ messages });
    } catch (err) {
        console.error("[chat/poll] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

// ─── POST /chat/leave ─────────────────────────────────────────────────────

export async function leaveChatRoom(req: Request, res: Response): Promise<void> {
    try {
        const { room_id, user_id } = req.body;
        await leaveChatService(room_id, user_id);
        res.json({ status: "left" });
    } catch (err) {
        console.error("[chat/leave] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

// ─── POST /chat/typing ───────────────────────────────────────────────────

export async function sendTypingIndicator(req: Request, res: Response): Promise<void> {
    try {
        const { room_id, user_id } = req.body;
        await sendTypingService(room_id, user_id);
        res.json({ status: "ok" });
    } catch (err) {
        console.error("[chat/typing] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

// ─── POST /chat/signal ────────────────────────────────────────────────────

export async function sendChatSignal(req: Request, res: Response): Promise<void> {
    try {
        const { room_id, user_id, type, payload } = req.body;
        await sendSignalService(room_id, user_id, type, payload);
        res.json({ status: "ok" });
    } catch (err) {
        console.error("[chat/signal] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

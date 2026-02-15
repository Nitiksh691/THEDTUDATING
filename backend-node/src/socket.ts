import { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import { env } from "./config/env";
import {
    sendMessage,
    pollMessages,
    leaveChat,
    sendTyping,
    sendSignal,
    getSenderCodename,
} from "./services/chat.service";
import { sanitizeText } from "./middleware/validate";

// ─── Socket.io Setup ───────────────────────────────────────────────────────
// Handles real-time 1-on-1 anonymous chat via WebSocket rooms.
// Each chat room maps to a Socket.io room by roomId.

let io: Server;

export function initSocket(httpServer: HTTPServer): Server {
    io = new Server(httpServer, {
        cors: {
            origin: env.CORS_ORIGINS === "*" ? true : env.CORS_ORIGINS.split(","),
            methods: ["GET", "POST"],
        },
        pingInterval: 10000,
        pingTimeout: 5000,
    });

    io.on("connection", (socket: Socket) => {
        console.log(`[Socket.io] 🔌 Connected: ${socket.id}`);

        // ─── Join Chat Room ────────────────────────────────────────────
        socket.on("join_room", async (data: { room_id: string; user_id: string }) => {
            const { room_id, user_id } = data;
            if (!room_id || !user_id) return;

            socket.join(room_id);
            socket.data.roomId = room_id;
            socket.data.userId = user_id;

            console.log(`[Socket.io] 📥 ${socket.id} joined room ${room_id}`);
        });

        // ─── Send Message ──────────────────────────────────────────────
        socket.on("send_message", async (data: { room_id: string; user_id: string; text: string }) => {
            const { room_id, user_id, text } = data;
            if (!room_id || !user_id || !text) return;

            try {
                const senderCodename = await getSenderCodename(room_id, user_id);
                const cleanText = sanitizeText(text, 500);

                // Store in Redis (mailbox for offline/fallback)
                await sendMessage(room_id, user_id, cleanText, senderCodename);

                // Broadcast to everyone else in the room
                socket.to(room_id).emit("new_message", {
                    type: "chat",
                    text: cleanText,
                    sender_codename: senderCodename,
                    timestamp: Date.now(),
                });
            } catch (err) {
                console.error("[Socket.io] Send error:", err);
            }
        });

        // ─── Typing Indicator ──────────────────────────────────────────
        socket.on("typing", (data: { room_id: string; user_id: string }) => {
            const { room_id, user_id } = data;
            if (!room_id || !user_id) return;

            // Also persist to Redis mailbox for HTTP fallback
            sendTyping(room_id, user_id).catch(() => { });

            socket.to(room_id).emit("new_message", {
                type: "typing",
                user_id,
            });
        });

        // ─── Signal (reaction, reveal, etc.) ───────────────────────────
        socket.on("signal", async (data: { room_id: string; user_id: string; type: string; payload?: any }) => {
            const { room_id, user_id, type, payload } = data;
            if (!room_id || !user_id || !type) return;

            try {
                // Persist to Redis mailbox
                await sendSignal(room_id, user_id, type, payload);

                // Broadcast to room
                socket.to(room_id).emit("new_message", {
                    type,
                    ...(payload || {}),
                });
            } catch (err) {
                console.error("[Socket.io] Signal error:", err);
            }
        });

        // ─── Leave Room ────────────────────────────────────────────────
        socket.on("leave_room", async (data: { room_id: string; user_id: string }) => {
            const { room_id, user_id } = data;
            if (!room_id || !user_id) return;

            try {
                await leaveChat(room_id, user_id);
                socket.to(room_id).emit("new_message", {
                    type: "partner_disconnected",
                });
                socket.leave(room_id);
                console.log(`[Socket.io] 📤 ${socket.id} left room ${room_id}`);
            } catch (err) {
                console.error("[Socket.io] Leave error:", err);
            }
        });

        // ─── Disconnect ────────────────────────────────────────────────
        socket.on("disconnect", async (reason) => {
            console.log(`[Socket.io] ❌ Disconnected: ${socket.id} (${reason})`);
            const { roomId, userId } = socket.data;
            if (roomId && userId) {
                try {
                    await leaveChat(roomId, userId);
                    socket.to(roomId).emit("new_message", {
                        type: "partner_disconnected",
                    });
                } catch (err) {
                    // Room may already be cleaned up
                }
            }
        });
    });

    console.log("[Socket.io] ✅ Initialized");
    return io;
}

export function getIO(): Server {
    return io;
}

// ─── Socket.io Client Singleton ────────────────────────────────────────────
// Shared socket instance for the frontend. Auto-connects on import.

import { io, Socket } from "socket.io-client";
import { API_URL } from "./config";

let socket: Socket | null = null;

export function getSocket(): Socket {
    if (!socket) {
        socket = io(API_URL, {
            transports: ["websocket", "polling"],
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socket.on("connect", () => {
            console.log("[Socket.io] ✅ Connected:", socket?.id);
        });

        socket.on("disconnect", (reason) => {
            console.log("[Socket.io] ❌ Disconnected:", reason);
        });

        socket.on("connect_error", (err) => {
            console.warn("[Socket.io] ⚠️ Connection error:", err.message);
        });
    }

    return socket;
}

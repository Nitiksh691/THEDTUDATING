import { redis } from "../lib/redis";
import { RoomData } from "../types";
import { getHeartbeatCache } from "./queue.service";

// ─── Constants ─────────────────────────────────────────────────────────────

const MAILBOX_TTL = 300;
const ROOM_TTL = 3600;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Send a chat message to all participants in a room except the sender.
 */
export async function sendMessage(
    roomId: string,
    senderId: string,
    text: string,
    senderCodename: string,
): Promise<void> {
    const participants = await redis.smembers(`room:${roomId}:p`);

    const payload = JSON.stringify({
        type: "chat",
        text,
        sender: "partner",
        sender_codename: senderCodename,
        sender_id: senderId,
        timestamp: Date.now(),
    });

    for (const pid of participants) {
        if (pid !== senderId) {
            await redis.rpush(`mailbox:${pid}`, payload);
            await redis.expire(`mailbox:${pid}`, MAILBOX_TTL);
        }
    }
}

/**
 * Poll messages from a user's mailbox.
 * Uses short-hold polling: checks up to 6 times with 500ms intervals (3s total).
 */
export async function pollMessages(
    roomId: string,
    userId: string,
): Promise<Record<string, unknown>[]> {
    // Throttled presence heartbeat
    const heartbeatCache = getHeartbeatCache();
    const now = Date.now() / 1000;
    const lastUpdate = heartbeatCache.get(userId) || 0;

    if (now - lastUpdate > 10) {
        await redis.sadd(`room:${roomId}:p`, userId);
        await redis.expire(`room:${roomId}:p`, ROOM_TTL);
        heartbeatCache.set(userId, now);
    }

    // Short-hold poll: try up to 6 times (3s total)
    for (let i = 0; i < 6; i++) {
        const msg = await redis.lpop(`mailbox:${userId}`);
        if (msg) {
            // Found a message! Drain remaining
            // @upstash/redis auto-deserializes JSON
            const messages: Record<string, unknown>[] = [msg as Record<string, unknown>];
            while (true) {
                const m = await redis.lpop(`mailbox:${userId}`);
                if (!m) break;
                messages.push(m as Record<string, unknown>);
            }
            return messages;
        }
        await sleep(500);
    }

    return [];
}

/**
 * Handle a user leaving a chat room. Notifies other participants.
 */
export async function leaveChat(
    roomId: string,
    userId: string,
): Promise<void> {
    // Look up codename
    let leaverCodename = "Someone";
    let roomType = "pair";
    const roomDataStr = await redis.get(`room:${roomId}`);

    if (roomDataStr) {
        // @upstash/redis auto-deserializes JSON
        const roomData = roomDataStr as unknown as RoomData;
        roomType = roomData.type || "pair";

        for (const u of roomData.users) {
            if (u.id === userId) {
                leaverCodename = u.codename;
                break;
            }
        }

        // Remove user from room data
        roomData.users = roomData.users.filter((u) => u.id !== userId);
        await redis.set(`room:${roomId}`, JSON.stringify(roomData));
    }

    // Remove from participants set
    await redis.srem(`room:${roomId}:p`, userId);
    await redis.del(`mailbox:${userId}`);
    getHeartbeatCache().delete(userId);

    // Notify remaining participants
    const participants = await redis.smembers(`room:${roomId}:p`);

    const disconnectMsg =
        roomType === "group"
            ? JSON.stringify({
                type: "user_left",
                codename: leaverCodename,
                participant_count: participants.length,
            })
            : JSON.stringify({ type: "partner_disconnected" });

    for (const pid of participants) {
        await redis.rpush(`mailbox:${pid}`, disconnectMsg);
    }

    // If room is empty, clean up
    const remaining = await redis.scard(`room:${roomId}:p`);
    if (remaining === 0) {
        await redis.del(`room:${roomId}`);
        await redis.del(`room:${roomId}:p`);

        if (roomDataStr) {
            const topic = (roomDataStr as unknown as RoomData).topic || "";
            const groupKey = `group:${topic}`;
            const currentGroupRoom = await redis.get(groupKey);
            if (currentGroupRoom === roomId) {
                await redis.del(groupKey);
            }
        }
    }
}

/**
 * Send a typing indicator to all other participants.
 */
export async function sendTyping(roomId: string, userId: string): Promise<void> {
    const participants = await redis.smembers(`room:${roomId}:p`);
    const payload = JSON.stringify({ type: "typing" });

    for (const pid of participants) {
        if (pid !== userId) {
            await redis.rpush(`mailbox:${pid}`, payload);
            await redis.expire(`mailbox:${pid}`, MAILBOX_TTL);
        }
    }
}

/**
 * Send a generic signal (reveal_request, reveal_accept, reveal_data, reaction).
 */
export async function sendSignal(
    roomId: string,
    userId: string,
    signalType: string,
    payload?: Record<string, unknown>,
): Promise<void> {
    const participants = await redis.smembers(`room:${roomId}:p`);

    const data: Record<string, unknown> = { type: signalType };
    if (payload) {
        if (signalType === "reaction") {
            Object.assign(data, payload);
        } else {
            data.fields = payload;
        }
    }

    const msgStr = JSON.stringify(data);

    for (const pid of participants) {
        if (pid !== userId) {
            await redis.rpush(`mailbox:${pid}`, msgStr);
            await redis.expire(`mailbox:${pid}`, MAILBOX_TTL);
        }
    }
}

/**
 * Look up a user's codename from room data.
 */
export async function getSenderCodename(
    roomId: string,
    userId: string,
): Promise<string> {
    const roomDataStr = await redis.get(`room:${roomId}`);
    if (roomDataStr) {
        // @upstash/redis auto-deserializes JSON
        const roomData = roomDataStr as unknown as RoomData;
        for (const u of roomData.users) {
            if (u.id === userId) {
                return u.codename;
            }
        }
    }
    return "partner";
}

// ─── Private Helpers ───────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

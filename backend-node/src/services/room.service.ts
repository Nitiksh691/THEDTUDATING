import { redis } from "../lib/redis";
import { RoomData, RoomUser } from "../types";

// ─── Constants ─────────────────────────────────────────────────────────────

const ROOM_TTL = 3600;
const MATCH_TTL = 300;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Create a room and notify all participants via match keys.
 */
export async function createRoom(
    roomId: string,
    topic: string,
    users: RoomUser[],
    roomType: "pair" | "group" = "pair",
    maxSize: number = 2,
): Promise<void> {
    const roomData: RoomData = {
        topic,
        type: roomType,
        max_size: maxSize,
        users,
        active: true,
        open: roomType === "group",
        created_at: Math.floor(Date.now() / 1000),
    };

    await redis.set(`room:${roomId}`, JSON.stringify(roomData));
    await redis.expire(`room:${roomId}`, ROOM_TTL);

    // Initialize participants set
    const participantIds = users.map((u) => u.id);
    for (const pid of participantIds) {
        await redis.sadd(`room:${roomId}:p`, pid);
    }
    if (participantIds.length > 0) {
        await redis.expire(`room:${roomId}:p`, ROOM_TTL);
    }

    // Set match notifications for each user
    for (const u of users) {
        await redis.setex(`match:${u.id}`, MATCH_TTL, roomId);
    }
}

/**
 * Get room data by room ID.
 */
export async function getRoomData(roomId: string): Promise<RoomData | null> {
    const raw = await redis.get(`room:${roomId}`);
    if (!raw) return null;
    // @upstash/redis auto-deserializes JSON
    return raw as RoomData;
}

/**
 * Update room data in Redis.
 */
export async function updateRoomData(roomId: string, data: RoomData): Promise<void> {
    await redis.set(`room:${roomId}`, JSON.stringify(data));
    await redis.expire(`room:${roomId}`, ROOM_TTL);
}

/**
 * Get participant IDs for a room.
 */
export async function getRoomParticipants(roomId: string): Promise<string[]> {
    const members = await redis.smembers(`room:${roomId}:p`);
    return members as string[];
}

/**
 * Check if a user has been matched (returns room ID or null).
 */
export async function getMatchResult(userId: string): Promise<string | null> {
    const roomId = await redis.get(`match:${userId}`);
    return roomId as string | null;
}

import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { normalizeTopic } from "../utils/normalize";
import { generateCodename } from "../utils/codename";
import { createRoom, getRoomData, updateRoomData, getRoomParticipants } from "../services/room.service";
import { redis } from "../lib/redis";

// ─── Constants ─────────────────────────────────────────────────────────────

const GROUP_MAX_SIZE = 8;
const ROOM_TTL = 3600;
const MATCH_TTL = 300;
const MAILBOX_TTL = 300;

// ─── POST /match-group ────────────────────────────────────────────────────

export async function matchGroup(req: Request, res: Response): Promise<void> {
    try {
        const { interest = "", gender = "any", preference = "any", max_size = 5 } = req.body;

        let topic = normalizeTopic(interest.trim() || "random");
        if (!topic) topic = "random";

        const maxSize = Math.min(max_size, GROUP_MAX_SIZE);
        const myId = uuidv4();
        const myCodename = generateCodename();

        // Look for existing open group room for this topic
        const groupKey = `group:${topic}`;
        const existingRoomId = await redis.get(groupKey);

        if (existingRoomId) {
            const roomData = await getRoomData(existingRoomId as string);

            if (roomData && roomData.open && roomData.users.length < (roomData.max_size || 5)) {
                // Join existing room
                roomData.users.push({ id: myId, codename: myCodename });
                await updateRoomData(existingRoomId as string, roomData);
                await redis.setex(`match:${myId}`, MATCH_TTL, existingRoomId as string);

                // Add new user to participants set
                await redis.sadd(`room:${existingRoomId}:p`, myId);

                // Notify existing participants
                const participants = await getRoomParticipants(existingRoomId as string);
                const joinMsg = JSON.stringify({
                    type: "user_joined",
                    codename: myCodename,
                    participant_count: roomData.users.length,
                });

                for (const pid of participants) {
                    await redis.rpush(`mailbox:${pid}`, joinMsg);
                    await redis.expire(`mailbox:${pid}`, MAILBOX_TTL);
                }

                res.json({
                    status: "joined",
                    room_id: existingRoomId,
                    user_id: myId,
                    codename: myCodename,
                    room_type: "group",
                    participants: roomData.users.map((u) => u.codename),
                    matched_topic: topic,
                });
                return;
            }
        }

        // Create new group room
        const roomId = uuidv4();
        await createRoom(
            roomId,
            topic,
            [{ id: myId, codename: myCodename }],
            "group",
            maxSize,
        );

        // Track this as the open group for the topic
        await redis.setex(groupKey, ROOM_TTL, roomId);

        res.json({
            status: "created",
            room_id: roomId,
            user_id: myId,
            codename: myCodename,
            room_type: "group",
            participants: [myCodename],
            matched_topic: topic,
        });
    } catch (err) {
        console.error("[match-group] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

// ─── POST /group/close ────────────────────────────────────────────────────

export async function closeGroup(req: Request, res: Response): Promise<void> {
    try {
        const { room_id, user_id } = req.body;

        const roomData = await getRoomData(room_id);
        if (!roomData) {
            res.json({ status: "not_found" });
            return;
        }

        roomData.open = false;
        await updateRoomData(room_id, roomData);

        // Remove from group index
        const topic = roomData.topic || "";
        await redis.del(`group:${topic}`);

        res.json({ status: "closed" });
    } catch (err) {
        console.error("[group/close] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

// ─── GET /room/:id/info ───────────────────────────────────────────────────

export async function getRoomInfo(req: Request, res: Response): Promise<void> {
    try {
        const roomId = req.params.id as string;
        const roomData = await getRoomData(roomId);

        if (!roomData) {
            res.json({ status: "not_found" });
            return;
        }

        res.json({
            status: "ok",
            topic: roomData.topic,
            type: roomData.type || "pair",
            participants: roomData.users.map((u) => u.codename),
            open: roomData.open || false,
            max_size: roomData.max_size || 2,
        });
    } catch (err) {
        console.error("[room/info] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

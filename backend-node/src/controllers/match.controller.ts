import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { normalizeTopic } from "../utils/normalize";
import { generateCodename } from "../utils/codename";
import { addToQueue, findMatchInQueue, refreshHeartbeat } from "../services/queue.service";
import { createRoom, getRoomData, getMatchResult } from "../services/room.service";
import { removeFromQueue } from "../services/queue.service";
import { redis } from "../lib/redis";
import { QueueUser } from "../types";

// ─── POST /match ───────────────────────────────────────────────────────────

export async function findMatch(req: Request, res: Response): Promise<void> {
    try {
        const { interest = "", gender = "any", preference = "any", nickname = "Anonymous" } = req.body;

        let topic = normalizeTopic(interest.trim() || "random");
        if (!topic) topic = "random";

        const myGender = gender.toLowerCase();
        const myPref = preference.toLowerCase();
        const myId = uuidv4();
        const myCodename = generateCodename();

        // Try to find a match
        const partner = await findMatchInQueue(topic, myGender, myPref);

        if (partner) {
            const roomId = uuidv4();
            await createRoom(roomId, topic, [
                { id: myId, codename: myCodename },
                { id: partner.id, codename: partner.codename },
            ]);

            res.json({
                status: "matched",
                room_id: roomId,
                user_id: myId,
                codename: myCodename,
                partner_codename: partner.codename,
                matched_topic: topic,
            });
        } else {
            const userData: QueueUser = {
                id: myId,
                codename: myCodename,
                gender: myGender,
                preference: myPref,
                nickname: (nickname || "Anonymous").slice(0, 20),
                topic,
                joined_at: Math.floor(Date.now() / 1000),
            };

            await addToQueue(topic, myId, userData, myGender, myPref);

            res.json({
                status: "waiting",
                user_id: myId,
                codename: myCodename,
                queue_id: myId,
            });
        }
    } catch (err) {
        console.error("[match] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

// ─── POST /check-match ────────────────────────────────────────────────────

export async function checkMatch(req: Request, res: Response): Promise<void> {
    try {
        const { queue_id } = req.body;

        const roomId = await getMatchResult(queue_id);

        if (roomId) {
            const roomData = await getRoomData(roomId);
            if (!roomData) {
                res.json({ status: "expired" });
                return;
            }

            const users = roomData.users;
            if (!users || users.length < 2 || !users[0] || !users[1]) {
                res.json({ status: "expired" });
                return;
            }
            const myUser = users[0].id === queue_id ? users[0] : users[1];
            const partnerUser = users[0].id === queue_id ? users[1] : users[0];

            res.json({
                status: "matched",
                room_id: roomId,
                codename: myUser.codename,
                partner_codename: partnerUser.codename,
            });
            return;
        }

        // Still waiting — refresh heartbeat
        await refreshHeartbeat(queue_id);
        res.json({ status: "waiting" });
    } catch (err) {
        console.error("[check-match] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

// ─── POST /match/direct ───────────────────────────────────────────────────

export async function directMatch(req: Request, res: Response): Promise<void> {
    try {
        const { codename, my_gender = "any", my_preference = "any" } = req.body;

        const mappingStr = await redis.get(`codename:${codename}`);
        if (!mappingStr) {
            res.json({ status: "not_found", message: "User no longer available" });
            return;
        }

        // @upstash/redis auto-deserializes JSON
        const mapping = mappingStr as unknown as { user_id: string; topic: string; gender: string; preference: string };
        const partnerId = mapping.user_id;
        const partnerTopic = mapping.topic;
        const partnerGender = mapping.gender;
        const partnerPref = mapping.preference;

        // Verify partner is alive
        const alive = await redis.exists(`user:${partnerId}:heartbeat`);
        if (!alive) {
            await redis.del(`codename:${codename}`);
            res.json({ status: "not_found", message: "User no longer available" });
            return;
        }

        const partnerDataStr = await redis.get(`user:${partnerId}:data`);
        if (!partnerDataStr) {
            res.json({ status: "not_found", message: "User no longer available" });
            return;
        }

        // @upstash/redis auto-deserializes JSON
        const partnerData = partnerDataStr as unknown as QueueUser;

        // Remove partner from queue
        await removeFromQueue(partnerTopic, partnerId, partnerGender, partnerPref);
        await redis.del(`codename:${codename}`);

        // Create room
        const myId = uuidv4();
        const myCodename = generateCodename();
        const roomId = uuidv4();

        await createRoom(roomId, partnerTopic, [
            { id: myId, codename: myCodename },
            { id: partnerId, codename: partnerData.codename },
        ]);

        res.json({
            status: "matched",
            room_id: roomId,
            user_id: myId,
            codename: myCodename,
            partner_codename: partnerData.codename,
            matched_topic: partnerTopic,
        });
    } catch (err) {
        console.error("[direct-match] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

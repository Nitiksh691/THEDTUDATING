import { Request, Response } from "express";
import { normalizeTopic } from "../utils/normalize";
import { removeFromQueue } from "../services/queue.service";
import { redis } from "../lib/redis";
import { QueueUser } from "../types";

// ─── POST /queue/leave ────────────────────────────────────────────────────

export async function leaveQueue(req: Request, res: Response): Promise<void> {
    try {
        const { queue_id, interest, gender = "any", preference = "any" } = req.body;

        let topic = normalizeTopic(interest);
        if (!topic) topic = "random";

        await removeFromQueue(topic, queue_id, gender.toLowerCase(), preference.toLowerCase());
        res.json({ status: "removed" });
    } catch (err) {
        console.error("[queue/leave] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

// ─── GET /queue/browse ────────────────────────────────────────────────────

export async function browseQueue(_req: Request, res: Response): Promise<void> {
    try {
        const keys = (await redis.keys("queue:*")) as string[];
        const people: Record<string, unknown>[] = [];
        const seenIds = new Set<string>();
        const now = Math.floor(Date.now() / 1000);

        for (const k of keys) {
            if (k.includes(":p")) continue;

            const members = (await redis.zrange(k, 0, -1)) as string[];
            for (const userId of members) {
                if (seenIds.has(userId)) continue;
                seenIds.add(userId);

                const alive = await redis.exists(`user:${userId}:heartbeat`);
                if (!alive) continue;

                const dataStr = await redis.get(`user:${userId}:data`);
                if (!dataStr) continue;

                // @upstash/redis auto-deserializes JSON
                const data = dataStr as unknown as QueueUser;
                const joined = data.joined_at || now;

                people.push({
                    codename: data.codename,
                    topic: (data.topic || "random").charAt(0).toUpperCase() + (data.topic || "random").slice(1),
                    gender: data.gender || "any",
                    nickname: data.nickname || "Anonymous",
                    waiting_seconds: now - joined,
                });
            }
        }

        // Sort by longest waiting first
        people.sort((a, b) => (b.waiting_seconds as number) - (a.waiting_seconds as number));
        res.json({ people: people.slice(0, 50) });
    } catch (err) {
        console.error("[queue/browse] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

// ─── GET /queue-stats ─────────────────────────────────────────────────────

// In-memory stats cache (refreshed every 10s)
let statsCache: { data: Record<string, unknown> | null; time: number } = {
    data: null,
    time: 0,
};

export async function getStats(_req: Request, res: Response): Promise<void> {
    try {
        const now = Date.now() / 1000;

        // Return cached if fresh
        if (statsCache.data && now - statsCache.time < 10) {
            res.json(statsCache.data);
            return;
        }

        const keys = (await redis.keys("queue:*")) as string[];
        let waitingCount = 0;
        const topicCounts: Record<string, number> = {};

        for (const k of keys) {
            if (k.includes(":p")) continue;

            const count = await redis.zcard(k);
            if (count > 0) {
                const parts = k.split(":");
                if (parts.length >= 4) {
                    const topicName = parts.slice(1, -2).join(":").charAt(0).toUpperCase() +
                        parts.slice(1, -2).join(":").slice(1);
                    topicCounts[topicName] = (topicCounts[topicName] || 0) + count;
                }
                waitingCount += count;
            }
        }

        const topTopics = Object.entries(topicCounts)
            .map(([topic, count]) => ({ topic, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Count active rooms
        const participantKeys = (await redis.keys("room:*:p")) as string[];
        let activeRooms = 0;
        for (const pk of participantKeys) {
            const memberCount = await redis.scard(pk);
            if (memberCount > 0) activeRooms++;
        }

        const result = {
            total_online: waitingCount + activeRooms * 2,
            waiting_count: waitingCount,
            active_chat_users: activeRooms * 2,
            top_topics: topTopics,
        };

        statsCache = { data: result, time: now };
        res.json(result);
    } catch (err) {
        console.error("[queue-stats] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

/** Clear stats cache (called by admin flush) */
export function clearStatsCache(): void {
    statsCache = { data: null, time: 0 };
}

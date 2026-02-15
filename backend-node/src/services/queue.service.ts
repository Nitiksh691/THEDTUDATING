import { redis } from "../lib/redis";
import { QueueUser } from "../types";

// ─── Constants ─────────────────────────────────────────────────────────────

const QUEUE_TTL = 30;           // Queue entry heartbeat TTL (seconds)
const ROOM_TTL = 3600;          // Room TTL (1 hour)
const MATCH_TTL = 300;          // Match notification TTL (5 minutes)

// In-memory heartbeat cache to reduce Redis calls (single-instance only)
const heartbeatCache: Map<string, number> = new Map();

// ─── Key Builders ──────────────────────────────────────────────────────────

function queueKey(topic: string, gender: string, preference: string): string {
    return `queue:${topic}:${gender}:${preference}`;
}

function globalKey(gender: string, preference: string): string {
    return `queue:global:${gender}:${preference}`;
}

// ─── Public API ────────────────────────────────────────────────────────────

export function getHeartbeatCache(): Map<string, number> {
    return heartbeatCache;
}

/**
 * Add a user to both topic-specific and global fallback queues.
 */
export async function addToQueue(
    topic: string,
    userId: string,
    userData: QueueUser,
    gender: string,
    preference: string,
): Promise<void> {
    const now = Date.now() / 1000;

    // Topic-specific queue (ZSET scored by timestamp)
    const specificKey = queueKey(topic, gender, preference);
    await redis.zadd(specificKey, { score: now, member: userId });
    await redis.expire(specificKey, ROOM_TTL);

    // Global fallback queue
    const gKey = globalKey(gender, preference);
    await redis.zadd(gKey, { score: now, member: userId });
    await redis.expire(gKey, ROOM_TTL);

    // User data + heartbeat
    await redis.setex(`user:${userId}:data`, QUEUE_TTL, JSON.stringify(userData));
    await redis.setex(`user:${userId}:heartbeat`, QUEUE_TTL, "1");

    // Codename → user mapping
    await redis.setex(
        `codename:${userData.codename}`,
        QUEUE_TTL,
        JSON.stringify({ user_id: userId, topic, gender, preference }),
    );

    heartbeatCache.set(userId, Date.now() / 1000);
}

/**
 * Remove a user from all their queue sets and clean up data.
 */
export async function removeFromQueue(
    topic: string,
    userId: string,
    gender: string,
    preference: string,
): Promise<void> {
    await redis.zrem(queueKey(topic, gender, preference), userId);
    await redis.zrem(globalKey(gender, preference), userId);
    await redis.del(`user:${userId}:data`);
    await redis.del(`user:${userId}:heartbeat`);
    heartbeatCache.delete(userId);
}

/**
 * Refresh a user's heartbeat (called by check-match polling).
 * Throttled to every 10s via in-memory cache.
 */
export async function refreshHeartbeat(userId: string): Promise<void> {
    const now = Date.now() / 1000;
    const lastUpdate = heartbeatCache.get(userId) || 0;

    if (now - lastUpdate > 10) {
        await redis.expire(`user:${userId}:heartbeat`, QUEUE_TTL);
        await redis.expire(`user:${userId}:data`, QUEUE_TTL);
        heartbeatCache.set(userId, now);
    }
}

/**
 * Find a compatible match using ZSET FIFO lookups.
 * Phase 1: Compatible search (same topic, then global fallback).
 * Phase 2: Desperate search (anyone waiting > 10s across ALL queues).
 */
export async function findMatchInQueue(
    topic: string,
    myGender: string,
    myPref: string,
): Promise<QueueUser | null> {
    const allGenders = ["male", "female", "other"];

    // ─── Build compatible queue keys ─────────────────────────────────────
    let keysToCheck: string[] = [];

    if (myPref === "any") {
        for (const g of allGenders) {
            keysToCheck.push(queueKey(topic, g, myGender));
            keysToCheck.push(queueKey(topic, g, "any"));
        }
    } else {
        keysToCheck.push(queueKey(topic, myPref, myGender));
        keysToCheck.push(queueKey(topic, myPref, "any"));
    }

    // Dedupe
    keysToCheck = [...new Set(keysToCheck)];

    // Add global fallback keys
    let fallbackKeys: string[] = [];
    if (myPref === "any") {
        for (const g of allGenders) {
            fallbackKeys.push(globalKey(g, myGender));
            fallbackKeys.push(globalKey(g, "any"));
        }
    } else {
        fallbackKeys.push(globalKey(myPref, myGender));
        fallbackKeys.push(globalKey(myPref, "any"));
    }
    fallbackKeys = [...new Set(fallbackKeys)];
    keysToCheck.push(...fallbackKeys);

    // ─── PHASE 1: Compatible Search (FIFO) ──────────────────────────────
    const match = await claimFromKeys(keysToCheck);
    if (match) return match;

    // ─── PHASE 2: Desperate Search (anyone waiting > 10s) ───────────────
    const cutoffTime = Date.now() / 1000 - 10;
    const prefs = ["male", "female", "other", "any"];

    const allGlobalKeys: string[] = [];
    for (const g of allGenders) {
        for (const p of prefs) {
            allGlobalKeys.push(globalKey(g, p));
        }
    }

    // Only check keys not already checked in Phase 1
    const keysCheckedSet = new Set(keysToCheck);
    const phase2Keys = allGlobalKeys.filter((k) => !keysCheckedSet.has(k));

    // Collect desperate users
    const desperatePool: { userId: string; key: string }[] = [];

    for (const key of phase2Keys) {
        const users = (await redis.zrange(key, "-inf", cutoffTime, {
            byScore: true,
            offset: 0,
            count: 2,
        })) as string[];
        for (const uid of users) {
            desperatePool.push({ userId: uid, key });
        }
    }

    if (desperatePool.length > 0) {
        // Shuffle for randomness
        shuffleArray(desperatePool);

        for (const { userId, key } of desperatePool) {
            const partner = await tryClaimUser(userId, key);
            if (partner) {
                console.log(`[MATCH] Found desperate user via ${key}`);
                return partner;
            }
        }
    }

    return null;
}

// ─── Private Helpers ───────────────────────────────────────────────────────

async function claimFromKeys(keys: string[]): Promise<QueueUser | null> {
    for (const key of keys) {
        const candidates = (await redis.zrange(key, 0, 4)) as string[];

        for (const userId of candidates) {
            const partner = await tryClaimUser(userId, key);
            if (partner) return partner;
        }
    }
    return null;
}

async function tryClaimUser(userId: string, key: string): Promise<QueueUser | null> {
    // Heartbeat check
    const alive = await redis.exists(`user:${userId}:heartbeat`);
    if (!alive) {
        await redis.zrem(key, userId);
        await redis.del(`user:${userId}:data`);
        return null;
    }

    const data = await redis.get(`user:${userId}:data`);
    if (!data) {
        await redis.zrem(key, userId);
        return null;
    }

    // Atomic claim: ZREM returns the count of removed elements
    const removed = await redis.zrem(key, userId);
    if (removed === 0) return null;

    // Claimed! Clean up
    await redis.del(`user:${userId}:heartbeat`);
    heartbeatCache.delete(userId);

    // @upstash/redis auto-deserializes JSON, so data is already an object
    const partner = data as QueueUser;

    // Remove from other queues (user is in both specific and global)
    const pTopic = partner.topic || "random";
    const pGender = partner.gender || "any";
    const pPref = partner.preference || "any";

    await redis.zrem(queueKey(pTopic, pGender, pPref), userId);
    await redis.zrem(globalKey(pGender, pPref), userId);

    return partner;
}

function shuffleArray<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

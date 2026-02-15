import { v4 as uuidv4 } from "uuid";
import { redis } from "../lib/redis";

// ─── Constants ─────────────────────────────────────────────────────────────

const GLOBAL_CHAT_KEY = "chat:global";
const GLOBAL_CHAT_LIMIT = 50;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Send a message to the global chat. Rate-limited per IP.
 * Returns true if sent, throws if rate limited.
 */
export async function globalSend(
    text: string,
    senderCodename: string,
    senderColor: string,
    ip: string,
): Promise<void> {
    // Rate limiting: 1 message per 5 seconds per IP
    const rateKey = `rate:global:${ip}`;
    const count = await redis.incr(rateKey);

    if (count === 1) {
        await redis.expire(rateKey, 5);
    }

    if (count > 1) {
        const error = new Error("Slow down! 1 msg / 2s.");
        (error as any).statusCode = 429;
        throw error;
    }

    // Build message
    const payload = JSON.stringify({
        id: uuidv4(),
        text: text.slice(0, 200), // Max 200 chars
        sender: senderCodename,
        color: senderColor,
        timestamp: Date.now(),
    });

    // Score = timestamp in MS
    const tsMs = Date.now();
    await redis.zadd(GLOBAL_CHAT_KEY, { score: tsMs, member: payload });

    // Trim to last 50 messages
    await redis.zremrangebyrank(GLOBAL_CHAT_KEY, 0, -(GLOBAL_CHAT_LIMIT + 1));
}

/**
 * Poll global chat messages newer than a given timestamp.
 */
export async function globalPoll(
    lastTimestamp: number,
): Promise<Record<string, unknown>[]> {
    let raw: unknown[];
    if (lastTimestamp > 0) {
        raw = (await redis.zrange(GLOBAL_CHAT_KEY, `(${lastTimestamp}` as const, "+inf", { byScore: true })) as unknown[];
    } else {
        raw = (await redis.zrange(GLOBAL_CHAT_KEY, "-inf", "+inf", { byScore: true })) as unknown[];
    }

    const messages: Record<string, unknown>[] = [];
    for (const m of raw) {
        try {
            // @upstash/redis may auto-deserialize JSON ZSET members
            if (typeof m === "object" && m !== null) {
                messages.push(m as Record<string, unknown>);
            } else if (typeof m === "string") {
                messages.push(JSON.parse(m));
            }
        } catch {
            // Skip malformed entries
        }
    }

    return messages;
}

/**
 * Clear all global chat messages.
 */
export async function clearGlobalChat(): Promise<void> {
    await redis.del(GLOBAL_CHAT_KEY);
}

import { Redis } from "@upstash/redis";
import { env } from "../config/env";

// ─── Redis Client ──────────────────────────────────────────────────────────
// Single Upstash Redis instance shared across all services.

export const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
});

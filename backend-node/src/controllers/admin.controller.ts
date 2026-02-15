import { Request, Response } from "express";
import { redis } from "../lib/redis";
import { getHeartbeatCache } from "../services/queue.service";
import { clearStatsCache } from "./queue.controller";

// ─── POST /admin/flush ────────────────────────────────────────────────────

export async function flushAll(_req: Request, res: Response): Promise<void> {
    try {
        await redis.flushdb();

        // Clear local caches
        clearStatsCache();
        getHeartbeatCache().clear();

        res.json({ status: "flushed all" });
    } catch (err) {
        console.error("[admin/flush] Error:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
}

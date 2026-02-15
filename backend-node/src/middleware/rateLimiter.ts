import { Request, Response, NextFunction } from "express";
import { redis } from "../lib/redis";

// ─── Rate Limiter Middleware ───────────────────────────────────────────────
// IP-based rate limiting using Redis INCR + EXPIRE.
// Factory function: accepts window (seconds) and max requests.

export function rateLimiter(windowSec: number, maxRequests: number) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const ip =
            (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
            req.socket.remoteAddress ||
            "unknown";

        const key = `rate:${req.path}:${ip}`;

        try {
            const count = await redis.incr(key);
            if (count === 1) {
                await redis.expire(key, windowSec);
            }

            if (count > maxRequests) {
                res.status(429).json({ detail: `Rate limited. Max ${maxRequests} req / ${windowSec}s.` });
                return;
            }

            next();
        } catch (err) {
            // If Redis fails, allow the request through
            next();
        }
    };
}

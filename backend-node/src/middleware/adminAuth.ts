import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

// ─── Admin Auth Middleware ─────────────────────────────────────────────────
// Validates the x-admin-key header against the ADMIN_KEY env var.

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
    const key = req.headers["x-admin-key"] as string | undefined;

    if (!key) {
        res.status(401).json({ detail: "Missing x-admin-key header" });
        return;
    }

    if (key !== env.ADMIN_KEY) {
        res.status(403).json({ detail: "Invalid admin key" });
        return;
    }

    next();
}

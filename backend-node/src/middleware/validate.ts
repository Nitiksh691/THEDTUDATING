import { Request, Response, NextFunction } from "express";

// ─── Input Validation Middleware ───────────────────────────────────────────
// Factory: validates that required body fields exist and are non-empty strings.

export function validateBody(...requiredFields: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.body || typeof req.body !== "object") {
            res.status(400).json({ detail: "Request body is required" });
            return;
        }

        for (const field of requiredFields) {
            const value = req.body[field];
            if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
                res.status(400).json({ detail: `Missing required field: ${field}` });
                return;
            }
        }

        next();
    };
}

// ─── Sanitize Text ────────────────────────────────────────────────────────
// Strips leading/trailing whitespace and caps length.

export function sanitizeText(text: string, maxLength: number = 500): string {
    return text.trim().slice(0, maxLength);
}

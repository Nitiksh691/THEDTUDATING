import { Router, Request, Response } from "express";
import Announcement from "../models/Announcement";
import { adminAuth } from "../middleware/adminAuth";
import { validateBody } from "../middleware/validate";

const router = Router();

// ─── Public Routes ─────────────────────────────────────────────────────────

// GET /notifications/active
// Returns list of active announcements for the frontend banner
router.get("/active", async (req: Request, res: Response) => {
    try {
        const active = await Announcement.find({ active: true }).sort({ createdAt: -1 });
        res.json({ announcements: active });
    } catch (err) {
        console.error("Error fetching announcements:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
});

// ─── Admin Routes ──────────────────────────────────────────────────────────

// POST /admin/notifications
// Create a new announcement (Admin only)
router.post(
    "/",
    adminAuth,
    validateBody("title", "message"),
    async (req: Request, res: Response) => {
        try {
            const { title, message, type } = req.body;
            const newAnnouncement = await Announcement.create({
                title,
                message,
                type: type || "info",
                active: true,
            });
            res.status(201).json({ announcement: newAnnouncement });
        } catch (err) {
            console.error("Error creating announcement:", err);
            res.status(500).json({ detail: "Internal server error" });
        }
    }
);

// DELETE /admin/notifications/:id
// Deactivate an announcement (Admin only)
router.delete("/:id", adminAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await Announcement.findByIdAndUpdate(id, { active: false });
        res.json({ status: "deactivated" });
    } catch (err) {
        console.error("Error deactivating announcement:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
});

export default router;

import { Router } from "express";
import { adminAuth } from "../middleware/adminAuth";
import { flushAll } from "../controllers/admin.controller";

const router = Router();

router.get("/verify", adminAuth, (req, res) => {
    res.json({ status: "ok" });
});

router.post("/flush", adminAuth, flushAll);

export default router;

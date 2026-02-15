import { Router } from "express";
import { adminAuth } from "../middleware/adminAuth";
import { flushAll } from "../controllers/admin.controller";

const router = Router();

router.post("/admin/flush", adminAuth, flushAll);

export default router;

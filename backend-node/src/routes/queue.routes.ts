import { Router } from "express";
import { leaveQueue, browseQueue, getStats } from "../controllers/queue.controller";

const router = Router();

router.post("/queue/leave", leaveQueue);
router.get("/queue/browse", browseQueue);
router.get("/queue-stats", getStats);

export default router;

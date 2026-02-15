import { Router } from "express";
import { findMatch, checkMatch, directMatch } from "../controllers/match.controller";
import { validateBody } from "../middleware/validate";

const router = Router();

router.post("/match", findMatch);
router.post("/check-match", validateBody("queue_id"), checkMatch);
router.post("/match/direct", validateBody("codename"), directMatch);

export default router;

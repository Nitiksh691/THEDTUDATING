import { Router } from "express";
import { matchGroup, closeGroup, getRoomInfo } from "../controllers/group.controller";

const router = Router();

router.post("/match-group", matchGroup);
router.post("/group/close", closeGroup);
router.get("/room/:id/info", getRoomInfo);

export default router;

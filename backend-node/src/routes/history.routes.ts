import { Router } from "express";
import { saveHistory, getHistory } from "../controllers/history.controller";

const router = Router();

router.post("/save", saveHistory);
router.get("/:visitorId", getHistory);

export default router;

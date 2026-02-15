import { Router } from "express";
import { globalSend, globalPoll } from "../controllers/global-chat.controller";
import { validateBody } from "../middleware/validate";

const router = Router();

router.post("/chat/global/send", validateBody("text", "sender_codename"), globalSend);
router.post("/chat/global/poll", globalPoll);

export default router;

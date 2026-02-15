import { Router } from "express";
import { sendChatMessage, pollChatMessages, leaveChatRoom, sendTypingIndicator, sendChatSignal } from "../controllers/chat.controller";
import { validateBody } from "../middleware/validate";

const router = Router();

router.post("/chat/send", validateBody("room_id", "user_id", "text"), sendChatMessage);
router.post("/chat/poll", validateBody("room_id", "user_id"), pollChatMessages);
router.post("/chat/leave", validateBody("room_id", "user_id"), leaveChatRoom);
router.post("/chat/typing", validateBody("room_id", "user_id"), sendTypingIndicator);
router.post("/chat/signal", validateBody("room_id", "user_id", "type"), sendChatSignal);

export default router;

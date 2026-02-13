from __future__ import annotations

import asyncio
import random
import string
import uuid
import re
from typing import Dict, List, Optional, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="DD")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── In-Memory State ─────────────────────────────────────────────────────────

# Common stop words to ignore when matching topics
STOP_WORDS: Set[str] = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "is", "it", "as", "be", "this", "that", "i",
    "me", "my", "we", "our", "about", "like", "want", "lets", "let",
    "talk", "discuss", "chat", "conversation", "just", "some", "do",
    "does", "doing", "would", "could", "should", "have", "has", "had",
}


def _codename() -> str:
    return f"Subject #{random.randint(100, 999)}"


def _tokenize(text: str) -> Set[str]:
    """Convert a topic string into a set of meaningful keywords."""
    # Lowercase, remove special characters, split on whitespace
    words = re.findall(r'[a-z0-9]+', text.lower())
    # Remove stop words and very short words
    return {w for w in words if w not in STOP_WORDS and len(w) > 1}


def _similarity(topic_a: str, topic_b: str) -> float:
    """
    Compute similarity between two topic strings.
    Uses Jaccard similarity on keyword tokens.
    Returns a float between 0.0 and 1.0.
    """
    tokens_a = _tokenize(topic_a)
    tokens_b = _tokenize(topic_b)

    if not tokens_a or not tokens_b:
        # If either topic has no meaningful words, fallback to exact match
        return 1.0 if topic_a.strip().lower() == topic_b.strip().lower() else 0.0

    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b

    if not union:
        return 0.0

    return len(intersection) / len(union)


# Minimum similarity score for a match (0.0 to 1.0)
# 0.25 means at least ~25% keyword overlap
MATCH_THRESHOLD = 0.25

# Optimized queue: topic -> List[Request]
waiting_queues: Dict[str, List[dict]] = {}

# active_rooms[room_id] = { "topic": str, "users": { ws_id: WebSocket } }
active_rooms: Dict[str, dict] = {}

# Maps a room_id → { ws_id: codename }
room_codenames: Dict[str, Dict[str, str]] = {}


# ─── REST Endpoints ──────────────────────────────────────────────────────────


class MatchRequest(BaseModel):
    interest: str  # Free-text topic
    gender: str = "any"      # male, female, binary, any
    preference: str = "any"  # male, female, binary, any


class MatchResponse(BaseModel):
    status: str  # "matched" | "waiting"
    room_id: Optional[str] = None
    codename: Optional[str] = None
    partner_codename: Optional[str] = None
    queue_id: Optional[str] = None
    matched_topic: Optional[str] = None


@app.post("/match", response_model=MatchResponse)
async def match(req: MatchRequest):
    raw_topic = req.interest.strip()
    if not raw_topic:
        return MatchResponse(status="error")

    # Normalize topic for dictionary key (lowercase, simple spaces)
    topic = " ".join(raw_topic.lower().split())
    
    gender = req.gender.lower()
    pref = req.preference.lower()

    print(f"DEBUG: Match Req: '{topic}' ({gender} looking for {pref})")

    # Ensure list exists
    if topic not in waiting_queues:
        waiting_queues[topic] = []

    # Search for a partner in this specific topic queue (O(N) of waiters in this topic)
    queue = waiting_queues[topic]
    match_idx = -1

    for i, entry in enumerate(queue):
        # Check compatibility
        # 1. My gender matches their preference? (or they don't care)
        # 2. Their gender matches my preference? (or I don't care)
        
        partner_gender = entry["gender"]
        partner_pref = entry["preference"]

        match_me = (partner_pref == "any") or (partner_pref == gender)
        match_them = (pref == "any") or (pref == partner_gender)

        if match_me and match_them:
            match_idx = i
            break
    
    if match_idx >= 0:
        # Match found!
        partner = queue.pop(match_idx)
        # Cleanup empty topic key
        if not queue:
            del waiting_queues[topic]

        room_id = str(uuid.uuid4())
        my_codename = _codename()

        print(f"DEBUG: MATCH FOUND! Room: {room_id}")
        
        active_rooms[room_id] = {"topic": topic, "users": {}}
        room_codenames[room_id] = {
            partner["id"]: partner["codename"],
            "pending": my_codename,
        }

        return MatchResponse(
            status="matched",
            room_id=room_id,
            codename=my_codename,
            partner_codename=partner["codename"],
            matched_topic=topic,
        )
    else:
        # No match, join queue
        my_id = str(uuid.uuid4())
        my_codename = _codename()
        
        entry = {
            "id": my_id,
            "codename": my_codename,
            "topic": topic,
            "gender": gender,
            "preference": pref
        }
        waiting_queues[topic].append(entry)
        
        print(f"DEBUG: Added to queue '{topic}'. Size: {len(waiting_queues[topic])}")
        
        return MatchResponse(
            status="waiting",
            codename=my_codename,
            queue_id=my_id,
        )


class CheckMatchRequest(BaseModel):
    interest: str
    queue_id: str


class CheckMatchResponse(BaseModel):
    status: str  # "waiting" | "matched" | "expired"
    room_id: Optional[str] = None
    codename: Optional[str] = None
    partner_codename: Optional[str] = None


@app.post("/check-match", response_model=CheckMatchResponse)
async def check_match(req: CheckMatchRequest):
    """
    Called by a waiting user to see if they have been matched yet.
    """
    # Optimized check: We don't know the topic easily here unless passed, 
    # but we can scan values (O(T*N) where T is topics). 
    # Since we need to know if they are still *in* value lists.
    
    # Ideally frontend sends topic so we can look up O(1).
    # But for now, iterate values. High traffic optimization: User should send topic in CheckMatchRequest.
    # The request ALREADY has `interest`. Use it!
    
    topic = " ".join(req.interest.strip().lower().split())
    
    # scan specific queue
    if topic in waiting_queues:
        for entry in waiting_queues[topic]:
            if entry["id"] == req.queue_id:
                 return CheckMatchResponse(status="waiting")
    
    # If not in that queue, maybe moved to room?
    for room_id, codenames in room_codenames.items():
        if req.queue_id in codenames:
            my_codename = codenames[req.queue_id]
            partner_codename = None
            for uid, cn in codenames.items():
                if uid != req.queue_id and uid != "pending":
                    partner_codename = cn
                elif uid == "pending":
                    partner_codename = cn

            return CheckMatchResponse(
                status="matched",
                room_id=room_id,
                codename=my_codename,
                partner_codename=partner_codename,
            )

    return CheckMatchResponse(status="expired")


@app.get("/queue-stats")
async def queue_stats():
    # Count waiting users
    waiting_count = sum(len(q) for q in waiting_queues.values())

    # Count active users in chat
    chat_users_count = sum(len(room["users"]) for room in active_rooms.values())

    # Aggregate topics
    top_topics = []
    for topic, queue in waiting_queues.items():
        if queue:
            top_topics.append({"topic": topic.title(), "count": len(queue)})
    
    # Sort
    top_topics.sort(key=lambda x: x["count"], reverse=True)

    return {
        "total_online": waiting_count + chat_users_count,
        "waiting_count": waiting_count,
        "active_chat_users": chat_users_count,
        "top_topics": top_topics[:10]
    }


# ─── WebSocket Chat Relay ─────────────────────────────────────────────────────


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()

    ws_id = str(uuid.uuid4())
    print(f"DEBUG: WS Connect {ws_id} → Room {room_id}")

    if room_id not in active_rooms:
        active_rooms[room_id] = {"users": {}}
    if room_id not in room_codenames:
        room_codenames[room_id] = {}

    room = active_rooms[room_id]
    room["users"][ws_id] = websocket
    print(f"DEBUG: Room {room_id} has {len(room['users'])} users: {list(room['users'].keys())}")

    try:
        while True:
            data = await websocket.receive_json()
            # Relay to partner(s) — never store
            print(f"DEBUG: WS Recv from {ws_id}: {str(data)[:50]}...")
            for uid, ws in room["users"].items():
                if uid != ws_id:
                    try:
                        await ws.send_json(data)
                        print(f"DEBUG:   → Relayed to {uid}")
                    except Exception as e:
                        print(f"DEBUG:   FAILED RELAY to {uid}: {e}")
                        pass
    except WebSocketDisconnect:
        print(f"DEBUG: WS Disconnect {ws_id} from Room {room_id}")
        # Clean up
        room["users"].pop(ws_id, None)
        # Notify remaining users
        for uid, ws in list(room["users"].items()):
            try:
                await ws.send_json({"type": "partner_disconnected"})
            except Exception:
                pass
        # If room is empty, delete it
        if not room["users"]:
            active_rooms.pop(room_id, None)
            room_codenames.pop(room_id, None)
    except Exception as e:
        print(f"DEBUG: WS Error {ws_id}: {e}")
        room["users"].pop(ws_id, None)
        if not room["users"]:
            active_rooms.pop(room_id, None)
            room_codenames.pop(room_id, None)

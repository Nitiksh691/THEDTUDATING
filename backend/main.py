from __future__ import annotations

import asyncio
import json
import os
import random
import re
import uuid
import time
from typing import Dict, List, Optional, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from upstash_redis import Redis

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="DD")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Blind Connection Backend is Running!", "docs": "/docs"}


# ─── Redis & State ───────────────────────────────────────────────────────────

# Configuration
# We check the Environment Variable first (Best Practice).
# If not found, we use the hardcoded value (Zero-Config for you).
UPSTASH_URL = os.getenv("UPSTASH_REDIS_REST_URL", "https://exact-tiger-55861.upstash.io")
UPSTASH_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN", "Ado1AAIncDI4MTQ3ZDNmNWE2ODY0YjRjYjlmMzE1OGU2ZWZlNzI3MXAyNTU4NjE")

# Initialize Upstash Redis (HTTP based, Vercel safe)
redis = Redis(url=UPSTASH_URL, token=UPSTASH_TOKEN)

# Common stop words
STOP_WORDS: Set[str] = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "is", "it", "as", "be", "this", "that", "i",
    "me", "my", "we", "our", "about", "like", "want", "lets", "let",
    "talk", "discuss", "chat", "conversation", "just", "some", "do",
    "does", "doing", "would", "could", "should", "have", "has", "had",
}


def _codename() -> str:
    return f"Subject #{random.randint(100, 999)}"


# ─── Redis Helpers ───────────────────────────────────────────────────────────

def add_to_queue(topic: str, user_data: dict):
    # Store user data as JSON in a list
    # Use lpush to add to wait list
    redis.rpush(f"queue:{topic}", json.dumps(user_data))

def find_match_in_queue(topic: str, my_gender: str, my_pref: str) -> Optional[dict]:
    # Check length
    key = f"queue:{topic}"
    length = redis.llen(key)
    if length == 0:
        return None
    
    # Iterate (Upstash REST doesn't support complex Lua easily, so we mimic logic)
    # We pop head. If match, return. If not, push back.
    # Limit to checking 10 people to avoid slow requests
    for _ in range(min(length, 10)):
        data_str = redis.lpop(key)
        if not data_str:
            break
            
        partner = json.loads(data_str)
        
        # Check compatibility
        partner_gender = partner["gender"]
        partner_pref = partner["preference"]

        match_me = (partner_pref == "any") or (partner_pref == my_gender)
        match_them = (my_pref == "any") or (my_pref == partner_gender)

        if match_me and match_them:
            return partner
        else:
            # Not a match, push back
            redis.rpush(key, data_str)
            
    return None

def create_room(room_id: str, topic: str, user1: dict, user2: dict):
    # Store room metadata
    redis.set(f"room:{room_id}", json.dumps({
        "topic": topic,
        "users": [user1, user2],
        "active": True
    }))
    # Set expire for safety (1 hour)
    redis.expire(f"room:{room_id}", 3600)

    # Notify users (Poller will check this)
    # "match:{user_queue_id}" -> "room_id"
    redis.setex(f"match:{user1['id']}", 300, room_id)
    redis.setex(f"match:{user2['id']}", 300, room_id)


# ─── REST Endpoints ──────────────────────────────────────────────────────────


class MatchRequest(BaseModel):
    interest: str
    gender: str = "any"
    preference: str = "any"


class MatchResponse(BaseModel):
    status: str
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

    topic = " ".join(raw_topic.lower().split())
    gender = req.gender.lower()
    pref = req.preference.lower()
    
    my_id = str(uuid.uuid4())
    my_codename = _codename()

    # Try to find match
    partner = find_match_in_queue(topic, gender, pref)
    
    if partner:
        # Match found!
        room_id = str(uuid.uuid4())
        
        create_room(room_id, topic, 
                   {"id": my_id, "codename": my_codename}, 
                   partner)

        return MatchResponse(
            status="matched",
            room_id=room_id,
            codename=my_codename,
            partner_codename=partner["codename"],
            matched_topic=topic,
        )
    else:
        # No match, list myself
        add_to_queue(topic, {
            "id": my_id,
            "codename": my_codename,
            "gender": gender,
            "preference": pref,
            "topic": topic
        })
        
        return MatchResponse(
            status="waiting",
            codename=my_codename,
            queue_id=my_id,
        )


class CheckMatchRequest(BaseModel):
    interest: str
    queue_id: str


class CheckMatchResponse(BaseModel):
    status: str
    room_id: Optional[str] = None
    codename: Optional[str] = None
    partner_codename: Optional[str] = None


@app.post("/check-match", response_model=CheckMatchResponse)
async def check_match(req: CheckMatchRequest):
    # Check if I have been matched
    room_id = redis.get(f"match:{req.queue_id}")
    
    if room_id:
        room_data_str = redis.get(f"room:{room_id}")
        if not room_data_str:
             return CheckMatchResponse(status="expired")
        
        room_data = json.loads(room_data_str)
        users = room_data["users"]
        
        # Identify me vs partner
        if users[0]["id"] == req.queue_id:
            my_user = users[0]
            partner_user = users[1]
        else:
            my_user = users[1]
            partner_user = users[0]

        return CheckMatchResponse(
            status="matched",
            room_id=room_id,
            codename=my_user["codename"],
            partner_codename=partner_user["codename"],
        )
    
    return CheckMatchResponse(status="waiting")


@app.get("/queue-stats")
async def queue_stats():
    # Helper to get keys with pattern (expensive but ok for mvp)
    # Upstash REST: 'keys' command
    keys = redis.keys("queue:*")
    waiting_count = 0
    top_topics = []
    
    for k in keys:
        length = redis.llen(k)
        waiting_count += length
        topic_name = k.replace("queue:", "").title()
        if length > 0:
            top_topics.append({"topic": topic_name, "count": length})
            
    top_topics.sort(key=lambda x: x["count"], reverse=True)
    
    room_keys = redis.keys("room:*")
    active_rooms = len(room_keys)
    
    return {
        "total_online": waiting_count + (active_rooms * 2),
        "waiting_count": waiting_count,
        "active_chat_users": active_rooms * 2,
        "top_topics": top_topics[:10]
    }


# ─── WebSocket Chat with "Mailbox" ──────────────────────────────────────────

# ─── HTTP Chat (Polling) ─────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    room_id: str
    user_id: str
    text: str

@app.post("/chat/send")
async def send_message(msg: ChatMessage):
    # Broadcast to others
    participants = redis.smembers(f"room:{msg.room_id}:p")
    
    # Message payload
    payload = json.dumps({
        "type": "chat",
        "text": msg.text,
        "sender": "partner",
        "timestamp": int(time.time() * 1000)
    })
    
    for pid in participants:
        if pid != msg.user_id:
            # Push to their mailbox
            redis.rpush(f"mailbox:{pid}", payload)
            redis.expire(f"mailbox:{pid}", 300)
            
    return {"status": "sent"}

class PollRequest(BaseModel):
    room_id: str
    user_id: str

@app.post("/chat/poll")
async def poll_messages(req: PollRequest):
    # 1. Register presence (heartbeat)
    redis.sadd(f"room:{req.room_id}:p", req.user_id)
    redis.expire(f"room:{req.room_id}:p", 3600)
    
    # 2. Check mailbox
    # Fetch all messages at once to reduce calls
    messages = []
    while True:
        msg = redis.lpop(f"mailbox:{req.user_id}")
        if not msg:
            break
        messages.append(json.loads(msg))
        
    return {"messages": messages} # Empty list if nothing

class LeaveRequest(BaseModel):
    room_id: str
    user_id: str

@app.post("/chat/leave")
async def leave_chat(req: LeaveRequest):
    # Remove myself
    redis.srem(f"room:{req.room_id}:p", req.user_id)
    redis.delete(f"mailbox:{req.user_id}")
    
    # Notify others
    participants = redis.smembers(f"room:{req.room_id}:p")
    disconnect_msg = json.dumps({"type": "partner_disconnected"})
    
    for pid in participants:
        redis.rpush(f"mailbox:{pid}", disconnect_msg)
        
    # If room empty, delete room
    if redis.scard(f"room:{req.room_id}:p") == 0:
        redis.delete(f"room:{req.room_id}")
        redis.delete(f"room:{req.room_id}:p")
        
    return {"status": "left"}

# Typing indicator
@app.post("/chat/typing")
async def send_typing(req: PollRequest): # Reuse PollRequest since it has room_id & user_id
    participants = redis.smembers(f"room:{req.room_id}:p")
    payload = json.dumps({"type": "typing"})
    
    for pid in participants:
        if pid != req.user_id:
            redis.rpush(f"mailbox:{pid}", payload)
            redis.expire(f"mailbox:{pid}", 300)
            
    return {"status": "ok"}
    
# Reveal logic (generic signal)
class SignalRequest(BaseModel):
    room_id: str
    user_id: str
    type: str # "reveal_request", "reveal_accept", "reveal_data"
    payload: Optional[dict] = None

@app.post("/chat/signal")
async def send_signal(req: SignalRequest):
    participants = redis.smembers(f"room:{req.room_id}:p")
    
    data = {"type": req.type}
    if req.payload:
        data["fields"] = req.payload # flatten for frontend compat
        
    msg_str = json.dumps(data)
    
    for pid in participants:
        if pid != req.user_id:
            redis.rpush(f"mailbox:{pid}", msg_str)
            redis.expire(f"mailbox:{pid}", 300)
            
    return {"status": "ok"}

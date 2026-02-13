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

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()
    
    # 1. Identify User
    # We assign a temp WebSocket ID
    ws_id = str(uuid.uuid4())
    
    # 2. Add to room "participants" set for cleanup
    # We use a set: `room:{id}:p`
    redis.sadd(f"room:{room_id}:p", ws_id)
    redis.expire(f"room:{room_id}:p", 3600)
    
    # Mailbox Keys
    # We broadcast to ALL other participants in the room
    # For a 2-person chat, it's just "the other person"
    # But since we don't know the other person's WS_ID easily without tracking,
    # we will use a global room list or just shared polling.
    
    # Better approach for Vercel:
    # Use a shared list `room:{id}:messages`. 
    # Clients track "last_read_index".
    # BUT `ws` protocol doesn't support "ack" easily in this loop without custom protocol.
    
    # Alternative:
    # Use `pubsub` equivalent via list.
    # We maintain 2 lists: `mailbox:{room_id}:1` and `mailbox:{room_id}:2`? No too complex.
    
    # SHARED LIST approach:
    # All messages go to `room:{id}:msgs`.
    # Each consumer reads everything and filters out their own?
    # Or just `lpop`? No, `lpop` deletes it for the other.
    
    # Let's use the explicit "Participant List" approach.
    # 1. Get all participants: `smembers room:{room_id}:p`
    # 2. Deliver to `mailbox:{ws_id}`
    
    active = True
    
    async def poller():
        """Polls my specific mailbox"""
        nonlocal active
        while active:
            # Check my mailbox
            # lpop returns None if empty
            try:
                msg_str = redis.lpop(f"mailbox:{ws_id}")
                if msg_str:
                    await websocket.send_text(msg_str)
                else:
                    await asyncio.sleep(0.1) # polling delay
            except Exception:
                break

    poll_task = asyncio.create_task(poller())

    try:
        while True:
            data = await websocket.receive_text()
            # Broadcast to others
            participants = redis.smembers(f"room:{room_id}:p")
            
            for pid in participants:
                if pid != ws_id:
                    # Push to their mailbox
                    redis.rpush(f"mailbox:{pid}", data)
                    # Set expire on mailbox so it cleans up if they disconnect unexpectedly
                    redis.expire(f"mailbox:{pid}", 300)

    except WebSocketDisconnect:
        active = False
        # Remove myself
        redis.srem(f"room:{room_id}:p", ws_id)
        # Notify others
        participants = redis.smembers(f"room:{room_id}:p")
        disconnect_msg = json.dumps({"type": "partner_disconnected"})
        for pid in participants:
            if pid != ws_id:
                redis.rpush(f"mailbox:{pid}", disconnect_msg)
        
        # Cleanup my mailbox
        redis.delete(f"mailbox:{ws_id}")
        
        # If room empty, delete room metadata (save memory!)
        if redis.scard(f"room:{room_id}:p") == 0:
            redis.delete(f"room:{room_id}")
            redis.delete(f"room:{room_id}:p")
            # Also clean queues if any left
            
    finally:
        active = False
        poll_task.cancel()

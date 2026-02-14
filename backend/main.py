from __future__ import annotations

import asyncio
import json
import os
import random
import re
import uuid
import time
from typing import Dict, List, Optional, Set

from fastapi import FastAPI, Header, HTTPException
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

# Configured for Render & Upstash
UPSTASH_URL = os.getenv("UPSTASH_REDIS_REST_URL", "https://flying-cardinal-56580.upstash.io")
UPSTASH_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN", "Ad0EAAIncDI3ODE0YjU1MmNlZDI0NDIzOWVlNGRhM2ZmYTdiYTNlZXAyNTY1ODA")
ADMIN_KEY = os.getenv("ADMIN_KEY", "default-dev-key")

redis = Redis(url=UPSTASH_URL, token=UPSTASH_TOKEN)

# Common stop words for topic normalization
STOP_WORDS: Set[str] = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "is", "it", "as", "be", "this", "that", "i",
    "me", "my", "we", "our", "about", "like", "want", "lets", "let",
    "talk", "discuss", "chat", "conversation", "just", "some", "do",
    "does", "doing", "would", "could", "should", "have", "has", "had",
}

# Queue entry TTL (30 seconds — must be refreshed by check-match heartbeat)
QUEUE_TTL = 30
# Room TTL (1 hour)
ROOM_TTL = 3600
# Match notification TTL (5 minutes)
MATCH_TTL = 300
# Mailbox TTL (5 minutes)
MAILBOX_TTL = 300

# In-memory caches to reduce Redis load
# (Valid for single-instance deployments like Render Free Tier)
stats_cache = {
    "data": None,
    "time": 0
}
heartbeat_cache: Dict[str, float] = {}

def _codename() -> str:
    return f"Subject #{random.randint(100, 999)}"


# ─── Topic Normalization ────────────────────────────────────────────────────

def normalize_topic(raw: str) -> str:
    """Normalize topic by lowercasing, stripping stop words.
    'I want to talk about Football' → 'football'
    """
    words = raw.lower().split()
    filtered = [w for w in words if w not in STOP_WORDS]
    return " ".join(filtered).strip() if filtered else " ".join(words).strip()


# ─── Redis Helpers (Set-Based Queue) ─────────────────────────────────────────

def _queue_key(topic: str, gender: str, preference: str) -> str:
    """Build the Redis Set key for a specific queue bucket."""
    return f"queue:{topic}:{gender}:{preference}"


def add_to_queue(topic: str, user_id: str, user_data: dict, gender: str, preference: str):
    """Add a user to the appropriate queue Set."""
    key = _queue_key(topic, gender, preference)
    # Add to the Set
    redis.sadd(key, user_id)
    redis.expire(key, ROOM_TTL)  # Keep the set alive for a while
    # Store user data separately with TTL
    redis.setex(f"user:{user_id}:data", QUEUE_TTL, json.dumps(user_data))
    # Set heartbeat
    redis.setex(f"user:{user_id}:heartbeat", QUEUE_TTL, "1")
    # Cache heartbeat initially
    heartbeat_cache[user_id] = time.time()


def remove_from_queue(topic: str, user_id: str, gender: str, preference: str):
    """Remove a user from their queue Set."""
    key = _queue_key(topic, gender, preference)
    redis.srem(key, user_id)
    redis.delete(f"user:{user_id}:data")
    redis.delete(f"user:{user_id}:heartbeat")
    # Clean up local cache
    heartbeat_cache.pop(user_id, None)


def find_match_in_queue(topic: str, my_gender: str, my_pref: str) -> Optional[dict]:
    """Find a compatible match using Set-based O(1) lookups."""
    all_genders = ["male", "female", "other"]

    # Build list of compatible queue keys to check
    keys_to_check = []

    if my_pref == "any":
        # I accept anyone → check all genders who want me OR want anyone
        for g in all_genders:
            keys_to_check.append(_queue_key(topic, g, my_gender))  # they specifically want my gender
            keys_to_check.append(_queue_key(topic, g, "any"))       # they want anyone
    else:
        # I want a specific gender → check that gender who wants me OR wants anyone
        keys_to_check.append(_queue_key(topic, my_pref, my_gender))  # they want my gender
        keys_to_check.append(_queue_key(topic, my_pref, "any"))       # they want anyone

    # De-duplicate keys
    keys_to_check = list(dict.fromkeys(keys_to_check))

    for key in keys_to_check:
        # Try up to 5 candidates per key (in case some are zombies)
        for _ in range(5):
            user_id = redis.spop(key)
            if not user_id:
                break  # Empty set, move to next key

            # Check heartbeat — is this user still alive?
            if not redis.exists(f"user:{user_id}:heartbeat"):
                # Zombie! Clean up their data and continue
                redis.delete(f"user:{user_id}:data")
                continue

            # Get user data
            data_str = redis.get(f"user:{user_id}:data")
            if not data_str:
                # Data expired but heartbeat somehow alive — skip
                continue

            partner = json.loads(data_str)
            # Clean up their queue data (they're matched now)
            redis.delete(f"user:{user_id}:data")
            redis.delete(f"user:{user_id}:heartbeat")
            heartbeat_cache.pop(user_id, None)
            return partner

    return None


def create_room(room_id: str, topic: str, user1: dict, user2: dict):
    """Create a room atomically using pipeline."""
    room_data = json.dumps({
        "topic": topic,
        "users": [user1, user2],
        "active": True
    })

    # Pipeline ensures all operations go in one round-trip
    pipe = redis.pipeline()
    pipe.set(f"room:{room_id}", room_data)
    pipe.expire(f"room:{room_id}", ROOM_TTL)
    pipe.setex(f"match:{user1['id']}", MATCH_TTL, room_id)
    pipe.setex(f"match:{user2['id']}", MATCH_TTL, room_id)
    pipe.exec()


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

    topic = normalize_topic(raw_topic)
    gender = req.gender.lower()
    pref = req.preference.lower()

    my_id = str(uuid.uuid4())
    my_codename = _codename()

    # Try to find a compatible match
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
        # No match — add myself to the queue
        user_data = {
            "id": my_id,
            "codename": my_codename,
            "gender": gender,
            "preference": pref,
            "topic": topic,
        }
        add_to_queue(topic, my_id, user_data, gender, pref)

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

    # Refresh heartbeat + user data TTL (they're still alive and waiting)
    # OPTIMIZATION: Only update Redis every 10 seconds to save commands
    now = time.time()
    last_update = heartbeat_cache.get(req.queue_id, 0)
    
    if now - last_update > 10:
        redis.expire(f"user:{req.queue_id}:heartbeat", QUEUE_TTL)
        redis.expire(f"user:{req.queue_id}:data", QUEUE_TTL)
        heartbeat_cache[req.queue_id] = now

    return CheckMatchResponse(status="waiting")


# ─── Queue Leave (active cleanup when user cancels) ─────────────────────────

class QueueLeaveRequest(BaseModel):
    queue_id: str
    interest: str
    gender: str = "any"
    preference: str = "any"


@app.post("/queue/leave")
async def leave_queue(req: QueueLeaveRequest):
    """Actively remove a user from the queue when they cancel."""
    topic = normalize_topic(req.interest)
    remove_from_queue(topic, req.queue_id, req.gender.lower(), req.preference.lower())
    return {"status": "removed"}


# ─── Queue Stats (efficient Set-based + cached) ─────────────────────────────

@app.get("/queue-stats")
async def queue_stats():
    # OPTIMIZATION: Cache stats for 10 seconds to reduce Redis load
    now = time.time()
    if stats_cache["data"] and (now - stats_cache["time"] < 10):
        return stats_cache["data"]

    keys = redis.keys("queue:*")
    waiting_count = 0
    topic_counts: Dict[str, int] = {}

    for k in keys:
        # Skip non-Set keys (e.g., room participant sets)
        if ":p" in k:
            continue

        # SCARD is O(1) — no scanning needed!
        count = redis.scard(k)
        if count > 0:
            # Extract topic from key: "queue:{topic}:{gender}:{pref}"
            parts = k.split(":")
            if len(parts) >= 4:
                topic_name = ":".join(parts[1:-2]).title()  # Handle topics with colons
                topic_counts[topic_name] = topic_counts.get(topic_name, 0) + count
            waiting_count += count

    top_topics = [
        {"topic": t, "count": c}
        for t, c in sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    # Count active chat rooms
    participant_keys = redis.keys("room:*:p")
    active_rooms = 0
    for pk in participant_keys:
        member_count = redis.scard(pk)
        if member_count > 0:
            active_rooms += 1

    result = {
        "total_online": waiting_count + (active_rooms * 2),
        "waiting_count": waiting_count,
        "active_chat_users": active_rooms * 2,
        "top_topics": top_topics[:10],
    }
    
    # Update cache
    stats_cache["data"] = result
    stats_cache["time"] = now
    
    return result


# ─── Admin (Protected) ──────────────────────────────────────────────────────

@app.post("/admin/flush")
async def flush_all(x_admin_key: str = Header(None)):
    """Flush ALL data from Redis. Protected by ADMIN_KEY."""
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Forbidden: invalid admin key")

    # Clear Redis
    redis.flushdb()
    
    # Clear local caches
    stats_cache["data"] = None
    heartbeat_cache.clear()

    return {"status": "flushed all"}


# ─── HTTP Chat (Polling with Short-Hold) ─────────────────────────────────────

class ChatMessage(BaseModel):
    room_id: str
    user_id: str
    text: str


@app.post("/chat/send")
async def send_message(msg: ChatMessage):
    participants = redis.smembers(f"room:{msg.room_id}:p")

    payload = json.dumps({
        "type": "chat",
        "text": msg.text,
        "sender": "partner",
        "timestamp": int(time.time() * 1000),
    })

    for pid in participants:
        if pid != msg.user_id:
            redis.rpush(f"mailbox:{pid}", payload)
            redis.expire(f"mailbox:{pid}", MAILBOX_TTL)

    return {"status": "sent"}


class PollRequest(BaseModel):
    room_id: str
    user_id: str


@app.post("/chat/poll")
async def poll_messages(req: PollRequest):
    # 1. Register presence (heartbeat for room)
    # OPTIMIZATION: Throttle updates to every 10s
    now = time.time()
    last_update = heartbeat_cache.get(req.user_id, 0)
    
    if now - last_update > 10:
        redis.sadd(f"room:{req.room_id}:p", req.user_id)
        redis.expire(f"room:{req.room_id}:p", ROOM_TTL)
        heartbeat_cache[req.user_id] = now

    # 2. Short-hold polling: wait up to 3 seconds for a message
    #    Check every 500ms — reduces Redis hits by ~3x while keeping latency low
    for _ in range(6):
        msg = redis.lpop(f"mailbox:{req.user_id}")
        if msg:
            # Found a message! Drain remaining messages too
            messages = [json.loads(msg)]
            while True:
                m = redis.lpop(f"mailbox:{req.user_id}")
                if not m:
                    break
                messages.append(json.loads(m))
            return {"messages": messages}
        await asyncio.sleep(0.5)

    # 3. Nothing after 3 seconds — return empty
    return {"messages": []}


class LeaveRequest(BaseModel):
    room_id: str
    user_id: str


@app.post("/chat/leave")
async def leave_chat(req: LeaveRequest):
    # Remove myself
    redis.srem(f"room:{req.room_id}:p", req.user_id)
    redis.delete(f"mailbox:{req.user_id}")
    heartbeat_cache.pop(req.user_id, None)

    # Notify others
    participants = redis.smembers(f"room:{req.room_id}:p")
    disconnect_msg = json.dumps({"type": "partner_disconnected"})

    for pid in participants:
        redis.rpush(f"mailbox:{pid}", disconnect_msg)

    # If room empty, clean up
    if redis.scard(f"room:{req.room_id}:p") == 0:
        redis.delete(f"room:{req.room_id}")
        redis.delete(f"room:{req.room_id}:p")

    return {"status": "left"}


# Typing indicator
@app.post("/chat/typing")
async def send_typing(req: PollRequest):
    participants = redis.smembers(f"room:{req.room_id}:p")
    payload = json.dumps({"type": "typing"})

    for pid in participants:
        if pid != req.user_id:
            redis.rpush(f"mailbox:{pid}", payload)
            redis.expire(f"mailbox:{pid}", MAILBOX_TTL)

    return {"status": "ok"}


# Reveal logic (generic signal)
class SignalRequest(BaseModel):
    room_id: str
    user_id: str
    type: str  # "reveal_request", "reveal_accept", "reveal_data"
    payload: Optional[dict] = None


@app.post("/chat/signal")
async def send_signal(req: SignalRequest):
    participants = redis.smembers(f"room:{req.room_id}:p")

    data = {"type": req.type}
    if req.payload:
        data["fields"] = req.payload

    msg_str = json.dumps(data)

    for pid in participants:
        if pid != req.user_id:
            redis.rpush(f"mailbox:{pid}", msg_str)
            redis.expire(f"mailbox:{pid}", MAILBOX_TTL)

    return {"status": "ok"}

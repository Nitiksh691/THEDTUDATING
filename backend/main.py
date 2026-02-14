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


from fastapi.responses import HTMLResponse

@app.get("/", response_class=HTMLResponse)
def read_root():
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>DD Dating server Status</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');
            body { font-family: 'Inter', sans-serif; background-color: #050505; color: #e5e5e5; }
            .glass { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.05); }
            .pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        </style>
    </head>
    <body class="min-h-screen p-6 flex flex-col items-center justify-center relative overflow-hidden">
        <!-- Background Orbs -->
        <div class="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-900/20 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-900/20 rounded-full blur-3xl pointer-events-none"></div>

        <div class="max-w-4xl w-full space-y-8 z-10">
            <!-- Header -->
            <div class="text-center space-y-2">
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full glass border-green-500/30 text-green-400 text-xs font-semibold tracking-wider uppercase mb-2">
                    <span class="w-2 h-2 rounded-full bg-green-500 pulse"></span>
                    System Operational
                </div>
                <h1 class="text-5xl font-black tracking-tight text-white">
                    DD Server <span class="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">Live Monitor</span>
                </h1>
                <p class="text-white/40">Real-time metrics from the matching engine</p>
            </div>

            <!-- Main Stats Grid -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="glass p-6 rounded-2xl">
                    <h3 class="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Total Online</h3>
                    <div class="flex items-end gap-2">
                        <span id="total-online" class="text-4xl font-bold text-white">--</span>
                        <span class="text-green-500 text-sm mb-1">● active</span>
                    </div>
                </div>
                <div class="glass p-6 rounded-2xl">
                    <h3 class="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Waiting in Queue</h3>
                    <div class="flex items-end gap-2">
                        <span id="waiting-count" class="text-4xl font-bold text-blue-400">--</span>
                        <span class="text-blue-500/50 text-sm mb-1">users</span>
                    </div>
                </div>
                <div class="glass p-6 rounded-2xl">
                    <h3 class="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Active Chats</h3>
                    <div class="flex items-end gap-2">
                        <span id="active-chats" class="text-4xl font-bold text-pink-400">--</span>
                        <span class="text-pink-500/50 text-sm mb-1">pairs</span>
                    </div>
                </div>
            </div>

            <!-- Charts & Topics -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Live Topics -->
                <div class="glass p-6 rounded-2xl h-80 overflow-hidden flex flex-col">
                    <h3 class="text-white/90 font-bold mb-4 flex items-center gap-2">
                        🔥 Trending Topics
                    </h3>
                    <div id="topics-list" class="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
                        <!-- Populated by JS -->
                        <div class="text-white/20 text-sm italic">Loading topics...</div>
                    </div>
                </div>

                <!-- Activity Log -->
                <div class="glass p-6 rounded-2xl h-80 relative overflow-hidden">
                    <h3 class="text-white/90 font-bold mb-4">
                        📊 Live Activity
                    </h3>
                     <canvas id="activityChart"></canvas>
                </div>
            </div>

            <div class="text-center">
                 <a href="/docs" class="text-white/20 hover:text-white/50 text-xs transition-colors underline decoration-white/10 underline-offset-4">API Documentation</a>
            </div>
        </div>

        <script>
            // Chart Setup
            const ctx = document.getElementById('activityChart').getContext('2d');
            const activityChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Total Users',
                        data: [],
                        borderColor: '#a78bfa',
                        backgroundColor: 'rgba(167, 139, 250, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                        x: { display: false }
                    },
                    animation: { duration: 0 }
                }
            });

            async function fetchStats() {
                try {
                    const res = await fetch('/queue-stats');
                    const data = await res.json();

                    // Update Counters
                    document.getElementById('total-online').innerText = data.total_online;
                    document.getElementById('waiting-count').innerText = data.waiting_count;
                    document.getElementById('active-chats').innerText = Math.floor(data.active_chat_users / 2);

                    // Update Topics
                    const topicsContainer = document.getElementById('topics-list');
                    if (data.top_topics.length > 0) {
                        topicsContainer.innerHTML = data.top_topics.map(t => `
                            <div class="flex items-center justify-between group">
                                <span class="text-white/70 text-sm group-hover:text-white transition-colors">${t.topic}</span>
                                <span class="bg-white/10 px-2 py-0.5 rounded text-xs text-white/50 font-mono group-hover:bg-white/20 transition-colors">${t.count}</span>
                            </div>
                        `).join('');
                    } else {
                        topicsContainer.innerHTML = '<div class="text-white/20 text-sm italic">No active topics yet</div>';
                    }

                    // Update Chart
                    const now = new Date().toLocaleTimeString();
                    if (activityChart.data.labels.length > 20) {
                        activityChart.data.labels.shift();
                        activityChart.data.datasets[0].data.shift();
                    }
                    activityChart.data.labels.push(now);
                    activityChart.data.datasets[0].data.push(data.total_online);
                    activityChart.update();

                } catch (err) {
                    console.error("Failed to fetch stats");
                }
            }

            // Poll every 3 seconds
            fetchStats();
            setInterval(fetchStats, 3000);
        </script>
    </body>
    </html>
    """


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
    """Add a user to both specific and global queue sets."""
    # Specific Topic Queue (ZSET: score=timestamp)
    key_specific = _queue_key(topic, gender, preference)
    redis.zadd(key_specific, {user_id: time.time()})
    redis.expire(key_specific, ROOM_TTL)
    
    # Global Fallback Queue (ZSET: score=timestamp)
    key_global = f"queue:global:{gender}:{preference}"
    redis.zadd(key_global, {user_id: time.time()})
    redis.expire(key_global, ROOM_TTL)

    # Store user data separately with TTL
    redis.setex(f"user:{user_id}:data", QUEUE_TTL, json.dumps(user_data))
    # Set heartbeat
    redis.setex(f"user:{user_id}:heartbeat", QUEUE_TTL, "1")
    # Codename → user mapping for direct match lookups
    redis.setex(f"codename:{user_data['codename']}", QUEUE_TTL, json.dumps({
        "user_id": user_id, "topic": topic, "gender": gender, "preference": preference
    }))
    # Cache heartbeat initially
    heartbeat_cache[user_id] = time.time()


def remove_from_queue(topic: str, user_id: str, gender: str, preference: str):
    """Remove a user from their queue Sets."""
    # Remove from specific
    redis.zrem(_queue_key(topic, gender, preference), user_id)
    # Remove from global
    redis.zrem(f"queue:global:{gender}:{preference}", user_id)
    
    redis.delete(f"user:{user_id}:data")
    redis.delete(f"user:{user_id}:heartbeat")
    # Clean up local cache
    heartbeat_cache.pop(user_id, None)


def find_match_in_queue(topic: str, my_gender: str, my_pref: str) -> Optional[dict]:
    """Find a compatible match using Sorted Set FIFO lookups."""
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

    # Dedupe keys
    keys_to_check = list(dict.fromkeys(keys_to_check))

    # Add global fallback keys for EVERYONE (including "random" topic)
    # This ensures that if no specific match is found, we match with ANYONE available.
    fallback_keys = []
    if my_pref == "any":
        for g in all_genders:
            fallback_keys.append(f"queue:global:{g}:{my_gender}")
            fallback_keys.append(f"queue:global:{g}:any")
    else:
        fallback_keys.append(f"queue:global:{my_pref}:{my_gender}")
        fallback_keys.append(f"queue:global:{my_pref}:any")
    
    # Dedupe fallback keys and extend
    fallback_keys = list(dict.fromkeys(fallback_keys))
    keys_to_check.extend(fallback_keys)

    # ─── PHASE 1: Compatible Search (FIFO) ───
    for key in keys_to_check:
        # PEEK at the oldest user (lowest score) -> zrange(key, 0, 0)
        # We try to claim the first valid user we see.
        candidates = redis.zrange(key, 0, 4) # Get top 5 oldest to avoid zombie lock issues
        
        for user_id in candidates:
            # Heartbeat check
            if not redis.exists(f"user:{user_id}:heartbeat"):
                redis.zrem(key, user_id)
                redis.delete(f"user:{user_id}:data")
                continue

            data_str = redis.get(f"user:{user_id}:data")
            if not data_str:
                redis.zrem(key, user_id)
                continue

            # Atomic claim: Try to remove from ZSET. 
            # If we remove it, we own it. (ZREM returns number of removed elements)
            if redis.zrem(key, user_id) == 0:
                continue
            
            # Winner
            redis.delete(f"user:{user_id}:heartbeat")
            heartbeat_cache.pop(user_id, None)
            partner = json.loads(data_str)
            
            # Remove from other queues (since user is in both specific and global)
            p_topic = partner.get("topic", "random")
            p_gender = partner.get("gender", "any")
            p_pref = partner.get("preference", "any")
            
            # Cleanup global/specific dual entry
            # If we matched via specific, remove global. If via global, remove specific.
            redis.zrem(_queue_key(p_topic, p_gender, p_pref), user_id)
            redis.zrem(f"queue:global:{p_gender}:{p_pref}", user_id)
            
            return partner

    # ─── PHASE 2: Desperate Search (The "Super Good" Algorithm) ───
    # Find ANYONE waiting > 10s.
    # Score is timestamp. We want score < (now - 10).
    cutoff_time = time.time() - 10
    
    all_global_keys = []
    genders = ["male", "female", "other"]
    prefs = ["male", "female", "other", "any"]
    
    for g in genders:
        for p in prefs:
            all_global_keys.append(f"queue:global:{g}:{p}")
    
    # Filter out keys we already checked in Phase 1 (optimization)
    phase2_keys = [k for k in all_global_keys if k not in keys_to_check]

    # Collect all eligible desperate users from these keys
    # To be "super good" and random, we collect candidates then pick one.
    # But for efficiency, we can just iterate and pick the first valid one, 
    # OR picking randomly from the FIRST key that has candidates might be enough randomness due to key order?
    # Actually user wants "random person", not just the oldest.
    
    # Let's try to find a pool of desperate users.
    desperate_pool = []
    
    for key in phase2_keys:
        # Get users with score -inf to cutoff_time
        # We limit to 2 per key to keep pool manageable but diverse
        # Use offset/count for Upstash Redis client pagination
        users = redis.zrangebyscore(key, "-inf", cutoff_time, offset=0, count=2)
        for uid in users:
            desperate_pool.append((uid, key))
            
    if desperate_pool:
        # Pick one randomly!
        import random
        random.shuffle(desperate_pool)
        
        for user_id, key in desperate_pool:
             # Heartbeat check
            if not redis.exists(f"user:{user_id}:heartbeat"):
                redis.zrem(key, user_id)
                redis.delete(f"user:{user_id}:data")
                continue

            data_str = redis.get(f"user:{user_id}:data")
            if not data_str:
                redis.zrem(key, user_id)
                continue
                
            # Atomic claim via ZREM
            if redis.zrem(key, user_id) == 0:
                continue

            # We won!
            redis.delete(f"user:{user_id}:heartbeat")
            heartbeat_cache.pop(user_id, None)
            partner = json.loads(data_str)
            
            # Cleanup queues
            p_topic = partner.get("topic", "random")
            p_gender = partner.get("gender", "any")
            p_pref = partner.get("preference", "any")
            redis.zrem(_queue_key(p_topic, p_gender, p_pref), user_id)
            redis.zrem(f"queue:global:{p_gender}:{p_pref}", user_id)
            
            print(f"[MATCH] Found desperate user via {key}")
            return partner

    return None


def create_room(room_id: str, topic: str, users: list, room_type: str = "pair", max_size: int = 2):
    """Create a room atomically using pipeline."""
    room_data = json.dumps({
        "topic": topic,
        "type": room_type,
        "max_size": max_size,
        "users": users,
        "active": True,
        "open": room_type == "group",
        "created_at": int(time.time())
    })

    # Pipeline ensures all operations go in one round-trip
    # Pipeline removed as Upstash HTTP client does not support it
    # Execute sequentially (safe for small batch)
    redis.set(f"room:{room_id}", room_data)
    redis.expire(f"room:{room_id}", ROOM_TTL)
    
    # Initialize participants set
    participant_ids = [u["id"] for u in users]
    if participant_ids:
        redis.sadd(f"room:{room_id}:p", *participant_ids)
        redis.expire(f"room:{room_id}:p", ROOM_TTL)

    for u in users:
        redis.setex(f"match:{u['id']}", MATCH_TTL, room_id)


# ─── REST Endpoints ──────────────────────────────────────────────────────────


class MatchRequest(BaseModel):
    interest: str
    gender: str = "any"
    preference: str = "any"
    nickname: str = "Anonymous"


class MatchResponse(BaseModel):
    status: str
    room_id: Optional[str] = None
    user_id: Optional[str] = None
    codename: Optional[str] = None
    partner_codename: Optional[str] = None
    queue_id: Optional[str] = None
    matched_topic: Optional[str] = None


@app.post("/match", response_model=MatchResponse)
async def match(req: MatchRequest):
    raw_topic = req.interest.strip()
    # If empty topic ("Surprise Me"), use a default bucket
    if not raw_topic:
        raw_topic = "random"

    topic = normalize_topic(raw_topic)
    if not topic:
        topic = "random"

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
                     [{"id": my_id, "codename": my_codename},
                      partner])

        return MatchResponse(
            status="matched",
            room_id=room_id,
            user_id=my_id,
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
            "nickname": req.nickname[:20] if req.nickname else "Anonymous",
            "topic": topic,
            "joined_at": int(time.time()),
        }
        add_to_queue(topic, my_id, user_data, gender, pref)

        return MatchResponse(
            status="waiting",
            user_id=my_id,
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
    if not topic:
        topic = "random"
    remove_from_queue(topic, req.queue_id, req.gender.lower(), req.preference.lower())
    return {"status": "removed"}


# ─── Browse & Direct Match ───────────────────────────────────────────────────

@app.get("/queue/browse")
async def browse_queue():
    """Return a list of waiting users (codename, topic, wait time) for browsing."""
    keys = redis.keys("queue:*")
    people: List[dict] = []
    seen_ids: set = set()
    now = int(time.time())

    for k in keys:
        if ":p" in k:
            continue

        members = redis.smembers(k)
        for user_id in members:
            if user_id in seen_ids:
                continue
            seen_ids.add(user_id)

            # Check heartbeat
            if not redis.exists(f"user:{user_id}:heartbeat"):
                continue

            data_str = redis.get(f"user:{user_id}:data")
            if not data_str:
                continue

            data = json.loads(data_str)
            joined = data.get("joined_at", now)
            people.append({
                "codename": data["codename"],
                "topic": data.get("topic", "random").title(),
                "gender": data.get("gender", "any"),
                "nickname": data.get("nickname", "Anonymous"),
                "waiting_seconds": now - joined,
            })

    # Sort by longest waiting first
    people.sort(key=lambda p: p["waiting_seconds"], reverse=True)
    return {"people": people[:50]}


class DirectMatchRequest(BaseModel):
    codename: str
    my_gender: str = "any"
    my_preference: str = "any"


@app.post("/match/direct")
async def direct_match(req: DirectMatchRequest):
    """Match with a specific user by their codename."""
    mapping_str = redis.get(f"codename:{req.codename}")
    if not mapping_str:
        return {"status": "not_found", "message": "User no longer available"}

    mapping = json.loads(mapping_str)
    partner_id = mapping["user_id"]
    partner_topic = mapping["topic"]
    partner_gender = mapping["gender"]
    partner_pref = mapping["preference"]

    # Verify partner is still alive
    if not redis.exists(f"user:{partner_id}:heartbeat"):
        redis.delete(f"codename:{req.codename}")
        return {"status": "not_found", "message": "User no longer available"}

    partner_data_str = redis.get(f"user:{partner_id}:data")
    if not partner_data_str:
        return {"status": "not_found", "message": "User no longer available"}

    partner_data = json.loads(partner_data_str)

    # Remove partner from their queue
    remove_from_queue(partner_topic, partner_id, partner_gender, partner_pref)
    redis.delete(f"codename:{req.codename}")

    # Create room
    my_id = str(uuid.uuid4())
    my_codename = _codename()
    room_id = str(uuid.uuid4())

    create_room(room_id, partner_topic,
                [{"id": my_id, "codename": my_codename},
                 {"id": partner_id, "codename": partner_data["codename"]}])

    return {
        "status": "matched",
        "room_id": room_id,
        "user_id": my_id,
        "codename": my_codename,
        "partner_codename": partner_data["codename"],
        "matched_topic": partner_topic,
    }


# ─── Group Chat ──────────────────────────────────────────────────────────────

GROUP_MAX_SIZE = 8

class GroupMatchRequest(BaseModel):
    interest: str
    gender: str = "any"
    preference: str = "any"
    max_size: int = 5


@app.post("/match-group")
async def match_group(req: GroupMatchRequest):
    """Join or create a group chat room for a topic."""
    raw_topic = req.interest.strip()
    if not raw_topic:
        raw_topic = "random"
    topic = normalize_topic(raw_topic)
    if not topic:
        topic = "random"

    max_size = min(req.max_size, GROUP_MAX_SIZE)
    my_id = str(uuid.uuid4())
    my_codename = _codename()

    # Look for existing open group rooms with this topic
    group_key = f"group:{topic}"
    existing_room_id = redis.get(group_key)

    if existing_room_id:
        # Try to join existing room
        room_data_str = redis.get(f"room:{existing_room_id}")
        if room_data_str:
            room_data = json.loads(room_data_str)
            if room_data.get("open") and len(room_data["users"]) < room_data.get("max_size", 5):
                # Join this room
                room_data["users"].append({"id": my_id, "codename": my_codename})
                redis.set(f"room:{existing_room_id}", json.dumps(room_data))
                redis.expire(f"room:{existing_room_id}", ROOM_TTL)
                redis.setex(f"match:{my_id}", MATCH_TTL, existing_room_id)

                # Notify existing participants
                participants = redis.smembers(f"room:{existing_room_id}:p")
                join_msg = json.dumps({
                    "type": "user_joined",
                    "codename": my_codename,
                    "participant_count": len(room_data["users"])
                })
                for pid in participants:
                    redis.rpush(f"mailbox:{pid}", join_msg)
                    redis.expire(f"mailbox:{pid}", MAILBOX_TTL)

                return {
                    "status": "joined",
                    "room_id": existing_room_id,
                    "user_id": my_id,
                    "codename": my_codename,
                    "room_type": "group",
                    "participants": [u["codename"] for u in room_data["users"]],
                    "matched_topic": topic,
                }

    # Create new group room
    room_id = str(uuid.uuid4())
    create_room(room_id, topic,
                [{"id": my_id, "codename": my_codename}],
                room_type="group", max_size=max_size)

    # Track this as the open group for the topic
    redis.setex(group_key, ROOM_TTL, room_id)

    return {
        "status": "created",
        "room_id": room_id,
        "user_id": my_id,
        "codename": my_codename,
        "room_type": "group",
        "participants": [my_codename],
        "matched_topic": topic,
    }


@app.post("/group/close")
async def close_group(room_id: str, user_id: str):
    """Close a group room so no new members can join."""
    room_data_str = redis.get(f"room:{room_id}")
    if not room_data_str:
        return {"status": "not_found"}

    room_data = json.loads(room_data_str)
    room_data["open"] = False
    redis.set(f"room:{room_id}", json.dumps(room_data))

    # Remove from group index
    topic = room_data.get("topic", "")
    redis.delete(f"group:{topic}")

    return {"status": "closed"}


@app.get("/room/{room_id}/info")
async def room_info(room_id: str):
    """Get room info including participants and type."""
    room_data_str = redis.get(f"room:{room_id}")
    if not room_data_str:
        return {"status": "not_found"}

    room_data = json.loads(room_data_str)
    return {
        "status": "ok",
        "topic": room_data.get("topic"),
        "type": room_data.get("type", "pair"),
        "participants": [u["codename"] for u in room_data.get("users", [])],
        "open": room_data.get("open", False),
        "max_size": room_data.get("max_size", 2),
    }


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

        # ZCARD is O(1) — no scanning needed!
        count = redis.zcard(k)
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

    # Look up sender codename from room data for group chats
    sender_codename = "partner"
    room_data_str = redis.get(f"room:{msg.room_id}")
    if room_data_str:
        room_data = json.loads(room_data_str)
        for u in room_data.get("users", []):
            if u["id"] == msg.user_id:
                sender_codename = u["codename"]
                break

    payload = json.dumps({
        "type": "chat",
        "text": msg.text,
        "sender": "partner",
        "sender_codename": sender_codename,
        "sender_id": msg.user_id,
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
    # Look up codename for leave notification
    leaver_codename = "Someone"
    room_data_str = redis.get(f"room:{req.room_id}")
    room_type = "pair"
    if room_data_str:
        room_data = json.loads(room_data_str)
        room_type = room_data.get("type", "pair")
        for u in room_data.get("users", []):
            if u["id"] == req.user_id:
                leaver_codename = u["codename"]
                break
        # Remove from room data
        room_data["users"] = [u for u in room_data["users"] if u["id"] != req.user_id]
        redis.set(f"room:{req.room_id}", json.dumps(room_data))

    # Remove myself
    redis.srem(f"room:{req.room_id}:p", req.user_id)
    redis.delete(f"mailbox:{req.user_id}")
    heartbeat_cache.pop(req.user_id, None)

    # Notify others
    participants = redis.smembers(f"room:{req.room_id}:p")
    if room_type == "group":
        disconnect_msg = json.dumps({
            "type": "user_left",
            "codename": leaver_codename,
            "participant_count": len(participants)
        })
    else:
        disconnect_msg = json.dumps({"type": "partner_disconnected"})

    for pid in participants:
        redis.rpush(f"mailbox:{pid}", disconnect_msg)

    # If room empty, clean up
    if redis.scard(f"room:{req.room_id}:p") == 0:
        redis.delete(f"room:{req.room_id}")
        redis.delete(f"room:{req.room_id}:p")
        # Clean up group index
        if room_data_str:
            topic = json.loads(room_data_str).get("topic", "")
            group_key = f"group:{topic}"
            if redis.get(group_key) == req.room_id:
                redis.delete(group_key)

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

    data: dict = {"type": req.type}
    if req.payload:
        if req.type == "reaction":
            data.update(req.payload)
        else:
            data["fields"] = req.payload

    msg_str = json.dumps(data)

    for pid in participants:
        if pid != req.user_id:
            redis.rpush(f"mailbox:{pid}", msg_str)
            redis.expire(f"mailbox:{pid}", MAILBOX_TTL)

    return {"status": "ok"}

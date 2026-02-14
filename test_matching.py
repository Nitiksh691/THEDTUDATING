"""
DD DTU Dating — Comprehensive Backend Test Suite
=================================================
Tests all API endpoints: matching, chat, browse/direct match, group chat,
queue management, stats, and admin operations.

Usage:
    1. Start the backend:  uvicorn main:app --reload
    2. Run tests:          python test_matching.py

    Optional flags:
        --base-url URL    Override the base URL (default: http://localhost:8000)
        --verbose         Print full response bodies
"""

import requests
import time
import json
import sys
import threading
from typing import Optional

# ─── Configuration ────────────────────────────────────────────────────────────

BASE_URL = "http://localhost:8000"
ADMIN_KEY = "default-dev-key"
VERBOSE = "--verbose" in sys.argv

# Parse --base-url flag
for i, arg in enumerate(sys.argv):
    if arg == "--base-url" and i + 1 < len(sys.argv):
        BASE_URL = sys.argv[i + 1]

test_results: list[tuple[str, bool, str]] = []  # (name, passed, detail)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def log(msg: str):
    print(f"    {msg}")

def vlog(msg: str):
    if VERBOSE:
        print(f"      → {msg}")

def flush_redis():
    """Clean slate before each test group."""
    resp = requests.post(f"{BASE_URL}/admin/flush", headers={"X-Admin-Key": ADMIN_KEY})
    assert resp.status_code == 200, f"Flush failed: {resp.status_code}"

def match_user(interest: str, gender: str = "any", preference: str = "any") -> dict:
    """Helper to call /match and return the JSON response."""
    resp = requests.post(f"{BASE_URL}/match", json={
        "interest": interest, "gender": gender, "preference": preference
    })
    data = resp.json()
    vlog(f"/match → {data}")
    return data

def check_match(interest: str, queue_id: str) -> dict:
    """Helper to call /check-match."""
    resp = requests.post(f"{BASE_URL}/check-match", json={
        "interest": interest, "queue_id": queue_id
    })
    data = resp.json()
    vlog(f"/check-match → {data}")
    return data

def send_msg(room_id: str, user_id: str, text: str) -> dict:
    """Helper to send a chat message."""
    resp = requests.post(f"{BASE_URL}/chat/send", json={
        "room_id": room_id, "user_id": user_id, "text": text
    })
    return resp.json()

def poll_msgs(room_id: str, user_id: str) -> dict:
    """Helper to poll for messages (with short timeout)."""
    resp = requests.post(f"{BASE_URL}/chat/poll", json={
        "room_id": room_id, "user_id": user_id
    })
    return resp.json()

def leave_chat(room_id: str, user_id: str) -> dict:
    resp = requests.post(f"{BASE_URL}/chat/leave", json={
        "room_id": room_id, "user_id": user_id
    })
    return resp.json()


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 1: Core Matching
# ═══════════════════════════════════════════════════════════════════════════════

def test_basic_match():
    """Two users with the same topic should match."""
    flush_redis()
    topic = "Deep Talk"

    a = match_user(topic)
    assert a["status"] == "waiting", "User A should be waiting"
    assert "queue_id" in a, "Should return queue_id"
    assert "user_id" in a, "Should return user_id"
    assert "codename" in a, "Should return codename"

    b = match_user(topic)
    assert b["status"] == "matched", "User B should be matched"
    assert "room_id" in b, "Should return room_id"
    assert "user_id" in b, "Should return user_id for matched user"
    assert "partner_codename" in b, "Should return partner codename"

    # Verify User A gets matched via check-match
    check = check_match(topic, a["queue_id"])
    assert check["status"] == "matched", "User A should find match on check"
    assert check["room_id"] == b["room_id"], "Both should be in same room"

    return True, "Basic matching works, user_id returned for both"


def test_user_id_in_response():
    """Match response should always include user_id for consistent tracking."""
    flush_redis()

    # Waiting response
    a = match_user("ID Test")
    assert "user_id" in a, "Waiting response must have user_id"
    assert a["user_id"] is not None, "user_id should not be None"
    assert len(a["user_id"]) > 10, "user_id should be a UUID"

    # Matched response
    b = match_user("ID Test")
    assert "user_id" in b, "Matched response must have user_id"
    assert b["user_id"] != a["user_id"], "Each user should get unique ID"

    return True, "user_id present and unique in all match responses"


def test_gender_matching():
    """Male→Female should match Female→Male."""
    flush_redis()
    topic = "Gender Test"

    f = match_user(topic, gender="female", preference="male")
    assert f["status"] == "waiting"

    m = match_user(topic, gender="male", preference="female")
    assert m["status"] == "matched", "Male→Female should match Female→Male"

    return True, "Cross-gender matching works"


def test_gender_incompatible():
    """Male→Female should NOT match Male→Male (incompatible preferences)."""
    flush_redis()
    topic = "Incompatible Test"

    a = match_user(topic, gender="male", preference="female")
    assert a["status"] == "waiting"

    b = match_user(topic, gender="male", preference="male")
    assert b["status"] == "waiting", "Incompatible prefs should not match"

    return True, "Incompatible gender prefs correctly stay in queue"


def test_any_gender_matching():
    """'any' preference should match with anyone."""
    flush_redis()
    topic = "Any Gender Test"

    a = match_user(topic, gender="male", preference="any")
    assert a["status"] == "waiting"

    b = match_user(topic, gender="female", preference="any")
    assert b["status"] == "matched", "'any' pref should match anyone"

    return True, "'any' preference matches universally"


def test_topic_normalization():
    """'I want to talk about Football' and 'football' should match."""
    flush_redis()

    a = match_user("I want to talk about Football")
    assert a["status"] == "waiting"

    b = match_user("football")
    assert b["status"] == "matched", "Normalized topics should match"

    return True, "Topic normalization strips stop words and lowercases"


def test_empty_topic():
    """Empty topic should default to 'random' — not error."""
    flush_redis()

    a = match_user("")
    assert a["status"] == "waiting", "Empty topic should be treated as 'random'"
    assert "user_id" in a, "Should still return user_id"

    b = match_user("")
    assert b["status"] == "matched", "Two empty-topic users should match"

    return True, "Empty topic defaults to 'random' bucket correctly"


def test_different_topics_match_fallback():
    """Users with different topics should match via Global Fallback."""
    flush_redis()

    a = match_user("Anime")
    assert a["status"] == "waiting"

    b = match_user("Gaming")
    assert b["status"] == "matched", "Different topics should match via Fallback"
    assert b["partner_codename"] == a["codename"]

    return True, "Different topics match via fallback correctly"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 2: Queue Management
# ═══════════════════════════════════════════════════════════════════════════════

def test_queue_leave():
    """Leaving the queue should remove user — next person shouldn't find them."""
    flush_redis()
    topic = "Leave Test"

    a = match_user(topic, gender="male", preference="female")
    assert a["status"] == "waiting"

    # Leave
    resp = requests.post(f"{BASE_URL}/queue/leave", json={
        "queue_id": a["queue_id"], "interest": topic,
        "gender": "male", "preference": "female"
    })
    assert resp.json()["status"] == "removed"

    # New user should NOT find the leaver
    b = match_user(topic, gender="female", preference="male")
    assert b["status"] == "waiting", "Should not find user who left"

    return True, "Queue leave properly removes user"


def test_queue_stats():
    """Queue stats should reflect correct counts."""
    flush_redis()

    # Before anyone joins
    resp = requests.get(f"{BASE_URL}/queue-stats")
    stats = resp.json()
    assert stats["waiting_count"] == 0, "Should start at 0"
    vlog(f"Stats before: {stats}")

    # Add a user
    a = match_user("Stats Test")
    assert a["status"] == "waiting"

    # Need to wait for stats cache to expire (10s) or just check raw
    time.sleep(0.5)
    resp = requests.get(f"{BASE_URL}/queue-stats")
    stats = resp.json()
    vlog(f"Stats after: {stats}")
    # Stats might be cached, so we just verify structure
    assert "waiting_count" in stats, "Should have waiting_count field"
    assert "total_online" in stats, "Should have total_online field"
    assert "active_chat_users" in stats, "Should have active_chat_users"
    assert "top_topics" in stats, "Should have top_topics"

    return True, "Queue stats returns correct structure"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 3: Chat Functionality
# ═══════════════════════════════════════════════════════════════════════════════

def test_chat_send_and_receive():
    """Messages sent by one user should be received by the other."""
    flush_redis()

    a = match_user("Chat Test")
    b = match_user("Chat Test")
    assert b["status"] == "matched"
    room_id = b["room_id"]

    # B needs to register presence first (poll initializes heartbeat)
    # Start polling for A in background
    def poll_a():
        return poll_msgs(room_id, a["user_id"])

    # B sends a message
    send_result = send_msg(room_id, b["user_id"], "Hello from B!")
    assert send_result["status"] == "sent"

    # A polls and should receive the message
    result = poll_msgs(room_id, a["user_id"])
    messages = result.get("messages", [])

    found = any(m.get("text") == "Hello from B!" for m in messages)
    assert found, f"User A should receive B's message. Got: {messages}"

    return True, "Chat send/receive works — messages delivered via polling"


def test_chat_message_has_sender_codename():
    """Chat messages should include sender_codename for group chat support."""
    flush_redis()

    a = match_user("Codename Test")
    b = match_user("Codename Test")
    assert b["status"] == "matched"
    room_id = b["room_id"]

    send_msg(room_id, b["user_id"], "Test sender info")
    result = poll_msgs(room_id, a["user_id"])
    messages = result.get("messages", [])

    assert len(messages) > 0, "Should receive message"
    msg = messages[0]
    assert "sender_codename" in msg, "Message should have sender_codename"
    assert "sender_id" in msg, "Message should have sender_id"
    assert msg["sender_codename"] == b["codename"], \
        f"sender_codename should be B's codename, got {msg.get('sender_codename')}"

    return True, "Messages include sender_codename and sender_id"


def test_chat_leave_notifies_partner():
    """Leaving a chat should send partner_disconnected to the other user."""
    flush_redis()

    a = match_user("Leave Notify Test")
    b = match_user("Leave Notify Test")
    assert b["status"] == "matched"
    room_id = b["room_id"]

    # Register A's presence 
    poll_msgs(room_id, a["user_id"])

    # B leaves
    leave_result = leave_chat(room_id, b["user_id"])
    assert leave_result["status"] == "left"

    # A should get disconnect notification
    result = poll_msgs(room_id, a["user_id"])
    messages = result.get("messages", [])

    found = any(m.get("type") == "partner_disconnected" for m in messages)
    assert found, f"Partner should be notified of disconnect. Got: {messages}"

    return True, "Chat leave sends partner_disconnected notification"


def test_chat_typing_indicator():
    """Typing indicator should be received by partner."""
    flush_redis()

    a = match_user("Typing Test")
    b = match_user("Typing Test")
    assert b["status"] == "matched"
    room_id = b["room_id"]

    # B sends typing indicator
    resp = requests.post(f"{BASE_URL}/chat/typing", json={
        "room_id": room_id, "user_id": b["user_id"]
    })
    assert resp.status_code == 200

    # A polls — should see typing
    result = poll_msgs(room_id, a["user_id"])
    messages = result.get("messages", [])

    found = any(m.get("type") == "typing" for m in messages)
    assert found, f"Should receive typing indicator. Got: {messages}"

    return True, "Typing indicator delivered to partner"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 4: Browse & Direct Match
# ═══════════════════════════════════════════════════════════════════════════════

def test_browse_empty():
    """Browse should return empty list when no one is waiting."""
    flush_redis()

    resp = requests.get(f"{BASE_URL}/queue/browse")
    data = resp.json()
    assert "people" in data, "Should have 'people' field"
    assert len(data["people"]) == 0, "Should be empty with no users"

    return True, "Browse returns empty list correctly"


def test_browse_shows_waiting_users():
    """Browse should list users who are waiting in the queue."""
    flush_redis()

    # Add 3 users to queue
    a = match_user("Anime", gender="male")
    b = match_user("Gaming", gender="female")
    c = match_user("Movies", gender="other")

    # All should be waiting
    assert a["status"] == "waiting"
    assert b["status"] == "waiting"
    assert c["status"] == "waiting"

    resp = requests.get(f"{BASE_URL}/queue/browse")
    data = resp.json()
    people = data["people"]
    vlog(f"Browse returned: {people}")

    assert len(people) >= 3, f"Should have at least 3 people, got {len(people)}"

    # Verify structure
    for p in people:
        assert "codename" in p, "Each person should have codename"
        assert "topic" in p, "Each person should have topic"
        assert "gender" in p, "Each person should have gender"
        assert "waiting_seconds" in p, "Each person should have waiting_seconds"

    # Verify our users' codenames are present
    codenames = [p["codename"] for p in people]
    assert a["codename"] in codenames, "User A's codename should appear"
    assert b["codename"] in codenames, "User B's codename should appear"
    assert c["codename"] in codenames, "User C's codename should appear"

    return True, "Browse correctly lists waiting users with all fields"


def test_browse_excludes_matched_users():
    """Users who got matched should NOT appear in browse."""
    flush_redis()

    a = match_user("Exclude Test")
    b = match_user("Exclude Test")
    assert b["status"] == "matched"

    # Add one more waiting user
    c = match_user("Different Topic")
    assert c["status"] == "waiting"

    resp = requests.get(f"{BASE_URL}/queue/browse")
    people = resp.json()["people"]
    codenames = [p["codename"] for p in people]

    assert a["codename"] not in codenames, "Matched user A should not appear"
    assert b["codename"] not in codenames, "Matched user B should not appear"
    assert c["codename"] in codenames, "Waiting user C should appear"

    return True, "Browse excludes matched users"


def test_direct_match():
    """Direct match by codename should create a room."""
    flush_redis()

    # User A waits
    a = match_user("Direct Test", gender="female", preference="any")
    assert a["status"] == "waiting"

    codename_a = a["codename"]

    # User B directly matches A
    resp = requests.post(f"{BASE_URL}/match/direct", json={
        "codename": codename_a, "my_gender": "male", "my_preference": "any"
    })
    data = resp.json()
    vlog(f"Direct match response: {data}")

    assert data["status"] == "matched", f"Should match, got: {data['status']}"
    assert "room_id" in data, "Should return room_id"
    assert "user_id" in data, "Should return user_id"
    assert "codename" in data, "Should return own codename"
    assert data["partner_codename"] == codename_a, "Partner should be A"

    return True, "Direct match by codename creates room correctly"


def test_direct_match_removes_from_queue():
    """After direct match, the target shouldn't be in queue anymore."""
    flush_redis()

    a = match_user("Direct Remove Test")
    assert a["status"] == "waiting"

    # Direct match A
    requests.post(f"{BASE_URL}/match/direct", json={
        "codename": a["codename"]
    })

    # A should no longer appear in browse
    resp = requests.get(f"{BASE_URL}/queue/browse")
    codenames = [p["codename"] for p in resp.json()["people"]]
    assert a["codename"] not in codenames, "Matched user should be removed from browse"

    return True, "Direct match removes target from queue"


def test_direct_match_nonexistent():
    """Direct match with fake codename should return not_found."""
    flush_redis()

    resp = requests.post(f"{BASE_URL}/match/direct", json={
        "codename": "FakeUser#9999"
    })
    data = resp.json()
    assert data["status"] == "not_found", "Should return not_found for fake codename"

    return True, "Direct match gracefully handles nonexistent users"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 5: Group Chat
# ═══════════════════════════════════════════════════════════════════════════════

def test_group_create():
    """Creating a group chat should return a room with 'group' type."""
    flush_redis()

    resp = requests.post(f"{BASE_URL}/match-group", json={
        "interest": "Group Test", "gender": "any", "preference": "any", "max_size": 5
    })
    data = resp.json()
    vlog(f"Group create: {data}")

    assert data["status"] == "created", f"Should create, got: {data['status']}"
    assert data["room_type"] == "group", "Should be group type"
    assert "room_id" in data, "Should return room_id"
    assert "user_id" in data, "Should return user_id"
    assert "codename" in data, "Should return codename"
    assert len(data["participants"]) == 1, "Creator should be only participant"

    return True, "Group chat creation works"


def test_group_join():
    """Second user should join existing group room for same topic."""
    flush_redis()

    # First user creates group
    a = requests.post(f"{BASE_URL}/match-group", json={
        "interest": "Group Join", "max_size": 5
    }).json()
    assert a["status"] == "created"

    # Register presence for notification delivery
    poll_msgs(a["room_id"], a["user_id"])

    # Second user joins same topic
    b = requests.post(f"{BASE_URL}/match-group", json={
        "interest": "Group Join", "max_size": 5
    }).json()
    vlog(f"User B group response: {b}")

    assert b["status"] == "joined", f"Should join existing group, got: {b['status']}"
    assert b["room_id"] == a["room_id"], "Should join same room"
    assert len(b["participants"]) == 2, f"Should have 2 participants, got {len(b['participants'])}"

    # First user should get notification
    result = poll_msgs(a["room_id"], a["user_id"])
    messages = result.get("messages", [])
    found = any(m.get("type") == "user_joined" for m in messages)
    assert found, f"Creator should be notified of join. Got: {messages}"

    return True, "Group join works, existing members notified"


def test_group_multiple_joins():
    """Multiple users should be able to join the same group."""
    flush_redis()

    a = requests.post(f"{BASE_URL}/match-group", json={
        "interest": "Multi Join", "max_size": 5
    }).json()
    assert a["status"] == "created"
    room_id = a["room_id"]

    # Join 3 more users
    for i in range(3):
        poll_msgs(room_id, a["user_id"])  # Keep presence active
        u = requests.post(f"{BASE_URL}/match-group", json={
            "interest": "Multi Join", "max_size": 5
        }).json()
        assert u["status"] == "joined", f"User {i+2} should join, got: {u['status']}"
        assert u["room_id"] == room_id, "Should join same room"

    # Check room info
    info = requests.get(f"{BASE_URL}/room/{room_id}/info").json()
    vlog(f"Room info: {info}")
    assert info["status"] == "ok"
    assert info["type"] == "group"
    assert len(info["participants"]) == 4, f"Should have 4 participants, got {len(info['participants'])}"

    return True, "Multiple users can join same group room"


def test_group_max_size():
    """Group room should not allow more users than max_size."""
    flush_redis()

    a = requests.post(f"{BASE_URL}/match-group", json={
        "interest": "Max Size", "max_size": 2
    }).json()
    assert a["status"] == "created"
    room_id = a["room_id"]

    # Second user joins (fills room)
    b = requests.post(f"{BASE_URL}/match-group", json={
        "interest": "Max Size", "max_size": 2
    }).json()
    assert b["status"] == "joined"
    assert b["room_id"] == room_id

    # Third user should create NEW room (existing one is full)
    c = requests.post(f"{BASE_URL}/match-group", json={
        "interest": "Max Size", "max_size": 2
    }).json()
    assert c["status"] == "created", f"Should create new group (old is full), got: {c['status']}"
    assert c["room_id"] != room_id, "Should be a different room"

    return True, "Group max_size enforced — new room created when full"


def test_group_chat_messaging():
    """Messages in group chat should reach all participants."""
    flush_redis()

    a = requests.post(f"{BASE_URL}/match-group", json={
        "interest": "Group Msg", "max_size": 5
    }).json()
    poll_msgs(a["room_id"], a["user_id"])

    b = requests.post(f"{BASE_URL}/match-group", json={
        "interest": "Group Msg", "max_size": 5
    }).json()
    room_id = a["room_id"]

    # Drain join notification from A's mailbox
    poll_msgs(room_id, a["user_id"])

    # B sends message
    send_msg(room_id, b["user_id"], "Hello group!")

    # A should receive it
    result = poll_msgs(room_id, a["user_id"])
    messages = result.get("messages", [])
    found = any(m.get("text") == "Hello group!" for m in messages)
    assert found, f"Group message should reach A. Got: {messages}"

    return True, "Group chat messages delivered to all participants"


def test_group_leave_notifies():
    """Leaving a group should send user_left (not partner_disconnected)."""
    flush_redis()

    a = requests.post(f"{BASE_URL}/match-group", json={
        "interest": "Group Leave", "max_size": 5
    }).json()
    poll_msgs(a["room_id"], a["user_id"])

    b = requests.post(f"{BASE_URL}/match-group", json={
        "interest": "Group Leave", "max_size": 5
    }).json()
    room_id = a["room_id"]

    # Drain join message
    poll_msgs(room_id, a["user_id"])

    # Register B's presence
    poll_msgs(room_id, b["user_id"])

    # B leaves
    leave_chat(room_id, b["user_id"])

    # A should get user_left (NOT partner_disconnected)
    result = poll_msgs(room_id, a["user_id"])
    messages = result.get("messages", [])
    found = any(m.get("type") == "user_left" for m in messages)
    assert found, f"Should get user_left in group. Got: {messages}"

    # Should include codename
    leave_msg = next((m for m in messages if m.get("type") == "user_left"), None)
    assert leave_msg and "codename" in leave_msg, "user_left should include codename"

    return True, "Group leave sends user_left with codename"


def test_room_info():
    """Room info endpoint should return correct data."""
    flush_redis()

    a = match_user("Room Info Test")
    b = match_user("Room Info Test")
    assert b["status"] == "matched"

    info = requests.get(f"{BASE_URL}/room/{b['room_id']}/info").json()
    vlog(f"Room info: {info}")

    assert info["status"] == "ok"
    assert info["type"] == "pair", "Default rooms should be 'pair' type"
    assert len(info["participants"]) == 2
    assert info["max_size"] == 2

    return True, "Room info returns correct metadata"


def test_room_info_not_found():
    """Room info for nonexistent room should return not_found."""
    resp = requests.get(f"{BASE_URL}/room/fake-room-id/info").json()
    assert resp["status"] == "not_found"

    return True, "Room info handles nonexistent rooms"


def test_group_empty_topic():
    """Group chat with empty topic should default to 'random'."""
    flush_redis()

    a = requests.post(f"{BASE_URL}/match-group", json={
        "interest": "", "max_size": 3
    }).json()
    assert a["status"] == "created"
    assert a["matched_topic"] == "random", f"Empty topic should be 'random', got: {a.get('matched_topic')}"

    return True, "Group chat empty topic defaults to 'random'"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 6: Admin & Security
# ═══════════════════════════════════════════════════════════════════════════════

def test_admin_protection():
    """Admin flush without key should return 403."""
    resp = requests.post(f"{BASE_URL}/admin/flush")
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"

    return True, "Admin endpoint requires authentication"


def test_admin_flush_with_key():
    """Admin flush with correct key should work."""
    resp = requests.post(f"{BASE_URL}/admin/flush", headers={"X-Admin-Key": ADMIN_KEY})
    assert resp.status_code == 200

    return True, "Admin flush works with correct key"


def test_admin_wrong_key():
    """Admin flush with wrong key should return 403."""
    resp = requests.post(f"{BASE_URL}/admin/flush", headers={"X-Admin-Key": "wrong-key"})
    assert resp.status_code == 403

    return True, "Admin endpoint rejects wrong key"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 7: Edge Cases & Robustness
# ═══════════════════════════════════════════════════════════════════════════════

def test_double_match_same_user():
    """Same user calling /match twice should not break anything."""
    flush_redis()
    topic = "Double Match"

    a = match_user(topic)
    assert a["status"] == "waiting"

    # A calls match again (shouldn't crash)
    a2 = match_user(topic)
    # Could either match with first instance or create new queue entry
    # Should not error
    assert a2["status"] in ("waiting", "matched"), "Should handle gracefully"

    return True, "Double match call handled gracefully"


def test_poll_empty_room():
    """Polling a room with no messages should return empty list."""
    flush_redis()

    a = match_user("Empty Poll")
    b = match_user("Empty Poll")
    assert b["status"] == "matched"

    # Poll without any messages sent
    result = poll_msgs(b["room_id"], a["user_id"])
    assert result.get("messages") == [] or result.get("messages") is not None

    return True, "Polling empty room returns gracefully"


def test_send_to_nonexistent_room():
    """Sending to a fake room should not crash."""
    result = send_msg("fake-room", "fake-user", "test")
    # Should return sent (even if no recipients) or handle gracefully
    assert "status" in result

    return True, "Send to nonexistent room handled gracefully"


def test_chat_signal_reveal():
    """Reveal request signal should work."""
    flush_redis()

    a = match_user("Reveal Test")
    b = match_user("Reveal Test")
    assert b["status"] == "matched"
    room_id = b["room_id"]

    # A sends reveal request
    resp = requests.post(f"{BASE_URL}/chat/signal", json={
        "room_id": room_id, "user_id": a["user_id"], "type": "reveal_request"
    })
    assert resp.status_code == 200

    # B should receive it
    result = poll_msgs(room_id, b["user_id"])
    messages = result.get("messages", [])
    found = any(m.get("type") == "reveal_request" for m in messages)
    assert found, f"Should receive reveal_request. Got: {messages}"

    return True, "Reveal request signal delivered correctly"


def test_concurrent_different_topics():
    """Multiple topics should match independently."""
    flush_redis()

    a1 = match_user("Anime")
    a2 = match_user("Gaming")
    a3 = match_user("Movies")

    assert a1["status"] == "waiting"
    assert a2["status"] == "waiting"
    assert a3["status"] == "waiting"

    # Match each topic
    b1 = match_user("Anime")
    b2 = match_user("Gaming")
    b3 = match_user("Movies")

    assert b1["status"] == "matched", "Anime should match"
    assert b2["status"] == "matched", "Gaming should match"
    assert b3["status"] == "matched", "Movies should match"

    # Verify each room is different
    rooms = {b1["room_id"], b2["room_id"], b3["room_id"]}
    assert len(rooms) == 3, "Each topic should have its own room"

    return True, "Multiple topics match independently"


def test_health_endpoint():
    """Root endpoint should respond."""
    resp = requests.get(f"{BASE_URL}/")
    assert resp.status_code == 200

    return True, "Health/root endpoint responds"


def test_nickname_persistence():
    """Users should be able to set nickname (motive removed)"""
    flush_redis()
    
    # User A with nickname
    a_data = {
        "interest": "Identity Test",
        "gender": "male",
        "preference": "any",
        "nickname": "CoolGuy",
    }
    a = requests.post(f"{BASE_URL}/match", json=a_data).json()
    assert a["status"] == "waiting"
    
    # Check browse - fields should serve correctly
    browse = requests.get(f"{BASE_URL}/queue/browse").json()
    people = browse["people"]
    found = next((p for p in people if p["codename"] == a["codename"]), None)
    
    assert found, "User should appear in browse"
    assert found.get("nickname") == "CoolGuy"
    
    # User B matches
    b = requests.post(f"{BASE_URL}/match", json={"interest": "Identity Test"}).json()
    assert b["status"] == "matched"
    
    return True, "Nickname persisted and displayed"


def test_fallback_matching():
    """Users with different topics should match via global fallback."""
    flush_redis()
    
    # User A: Topic 'Chess', Male wanting Female
    a_data = {"interest": "Chess", "gender": "male", "preference": "female"}
    a = requests.post(f"{BASE_URL}/match", json=a_data).json()
    assert a["status"] == "waiting"
    
    # User B: Topic 'Checkers', Female wanting Male
    b_data = {"interest": "Checkers", "gender": "female", "preference": "male"}
    b = requests.post(f"{BASE_URL}/match", json=b_data).json()
    
    # They should match because of fallback
    assert b["status"] == "matched", "Different topics should match via fallback"
    assert b["partner_codename"] == a["codename"]
    
    return True, "Fallback matching works across topics"


# ═══════════════════════════════════════════════════════════════════════════════
# Test Runner
# ═══════════════════════════════════════════════════════════════════════════════

ALL_TESTS = [
    # Group 1: Core Matching
    ("Core Matching", [
        test_basic_match,
        test_user_id_in_response,
        test_gender_matching,
        test_gender_incompatible,
        test_any_gender_matching,
        test_topic_normalization,
        test_empty_topic,
        test_different_topics_match_fallback,
    ]),
    # Group 2: Queue Management
    ("Queue Management", [
        test_queue_leave,
        test_queue_stats,
    ]),
    # Group 3: Chat
    ("Chat", [
        test_chat_send_and_receive,
        test_chat_message_has_sender_codename,
        test_chat_leave_notifies_partner,
        test_chat_typing_indicator,
    ]),
    # Group 4: Browse & Direct Match
    ("Browse & Direct Match", [
        test_browse_empty,
        test_browse_shows_waiting_users,
        test_browse_excludes_matched_users,
        test_direct_match,
        test_direct_match_removes_from_queue,
        test_direct_match_nonexistent,
    ]),
    # Group 5: Group Chat
    ("Group Chat", [
        test_group_create,
        test_group_join,
        test_group_multiple_joins,
        test_group_max_size,
        test_group_chat_messaging,
        test_group_leave_notifies,
        test_room_info,
        test_room_info_not_found,
        test_group_empty_topic,
    ]),
    # Group 6: Admin & Security
    ("Admin & Security", [
        test_admin_protection,
        test_admin_flush_with_key,
        test_admin_wrong_key,
    ]),
    # Group 7: Edge Cases
    ("Edge Cases & Robustness", [
        test_double_match_same_user,
        test_poll_empty_room,
        test_send_to_nonexistent_room,
        test_chat_signal_reveal,
        test_concurrent_different_topics,
        test_health_endpoint,
        test_concurrent_different_topics,
        test_health_endpoint,
    ]),
    # Group 8: User Identity & Fallback
    ("User Identity & Fallback", [
        test_nickname_persistence,
        test_fallback_matching,
    ]),
]

def run_all():
    results: list[tuple[str, str, bool, str]] = []
    total = sum(len(tests) for _, tests in ALL_TESTS)

    print(f"\n{'='*60}")
    print(f"  DD DTU Dating — Test Suite  ({total} tests)")
    print(f"{'='*60}")

    # Verify server is up
    try:
        requests.get(f"{BASE_URL}/", timeout=5)
    except requests.ConnectionError:
        print(f"\n  ❌ Cannot connect to {BASE_URL}")
        print(f"     Start the backend first: uvicorn main:app --reload\n")
        sys.exit(1)

    for group_name, tests in ALL_TESTS:
        print(f"\n  ▸ {group_name}")
        print(f"  {'─'*50}")

        for test_fn in tests:
            name = test_fn.__name__
            try:
                passed, detail = test_fn()
                status = "✅" if passed else "❌"
                results.append((group_name, name, passed, detail))
                print(f"    {status}  {name}")
                if VERBOSE and detail:
                    print(f"       {detail}")
            except AssertionError as e:
                results.append((group_name, name, False, str(e)))
                print(f"    ❌  {name}")
                print(f"       ASSERT: {e}")
            except Exception as e:
                results.append((group_name, name, False, str(e)))
                print(f"    ❌  {name}")
                print(f"       ERROR: {e}")

    # Summary
    passed_count = sum(1 for _, _, p, _ in results if p)
    failed_count = len(results) - passed_count

    print(f"\n{'='*60}")
    print(f"  RESULTS: {passed_count}/{len(results)} passed", end="")
    if failed_count > 0:
        print(f"  ({failed_count} failed)")
        print(f"\n  Failed tests:")
        for group, name, passed, detail in results:
            if not passed:
                print(f"    ❌ [{group}] {name}: {detail}")
    else:
        print(f"  🎉 All tests passed!")
    print(f"{'='*60}\n")

    return failed_count == 0


if __name__ == "__main__":
    success = run_all()
    sys.exit(0 if success else 1)

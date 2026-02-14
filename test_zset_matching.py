import time
import json
import uuid
import sys
import os

# Add backend directory to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from main import redis, add_to_queue, find_match_in_queue, remove_from_queue, _queue_key

def setup():
    print("Cleaning up Redis test keys...")
    keys = redis.keys("queue:*") + redis.keys("user:test:*")
    if keys:
        redis.delete(*keys)

def create_dummy_user(uid, gender="male", pref="female", topic="coding", wait_seconds=0):
    user_data = {
        "id": uid,
        "codename": f"TestUser_{uid}",
        "gender": gender,
        "preference": pref,
        "topic": topic,
        "joined_at": time.time() - wait_seconds
    }
    
    # Manually add to queue with custom timestamp to simulate waiting
    # Specific Topic Queue
    key_specific = _queue_key(topic, gender, pref)
    redis.zadd(key_specific, {uid: user_data['joined_at']})
    
    # Global Fallback Queue
    key_global = f"queue:global:{gender}:{pref}"
    redis.zadd(key_global, {uid: user_data['joined_at']})

    # Store user data
    redis.set(f"user:{uid}:data", json.dumps(user_data))
    redis.set(f"user:{uid}:heartbeat", "1")
    return uid

def test_fifo_matching():
    print("\n--- Test 1: FIFO Matching (Compatible) ---")
    setup()
    
    # User A: Male, wants Female, Joined 20s ago
    create_dummy_user("user_A", gender="male", pref="female", wait_seconds=20)
    # User B: Male, wants Female, Joined 5s ago
    create_dummy_user("user_B", gender="male", pref="female", wait_seconds=5)
    
    print("Added User A (20s wait) and User B (5s wait). Both Male, want Female.")
    
    # User C: Female, wants Male
    print("User C (Female, wants Male) searching...")
    match = find_match_in_queue("coding", "female", "male")
    
    if match and match['id'] == "user_A":
        print("✅ PASS: Matched with User A (Oldest).")
    else:
        print(f"❌ FAIL: Matched with {match['id'] if match else 'None'}. Expected user_A.")

def test_desperate_matching():
    print("\n--- Test 2: Desperate Matching (Incompatible > 10s) ---")
    setup()
    
    # User D: Male, wants Female, Joined 15s ago (Desperate!)
    create_dummy_user("user_D", gender="male", pref="female", wait_seconds=15)
    
    # User E: Male, wants Female, Joined 2s ago (Not Desperate)
    create_dummy_user("user_E", gender="male", pref="female", wait_seconds=2)
    
    print("Added User D (15s wait) and User E (2s wait). Both Male, want Female.")
    
    # User F: Male, wants Male (Incompatible with D and E in normal phase)
    # Normall D and E want Female. F is Male.
    # Phase 1 should fail.
    # Phase 2 should pick D because D > 10s. E is < 10s so ignored.
    
    print("User F (Male, wants Male) searching...")
    match = find_match_in_queue("coding", "male", "male")
    
    if match and match['id'] == "user_D":
        print("✅ PASS: Matched with User D (Desperate).")
    elif match and match['id'] == "user_E":
        print("❌ FAIL: Matched with User E (Not Desperate).")
    else:
        print(f"❌ FAIL: No match found. Expected user_D. Result: {match}")

def test_random_topic_matching():
    print("\n--- Test 3: Random Topic Matching ---")
    setup()
    
    # User G: Topic "Coding", Joined 5s ago, Wants ANY (Compatible with H)
    create_dummy_user("user_G", topic="coding", pref="any", wait_seconds=5)
    
    print("Added User G (Topic: Coding, Wants: Any).")
    
    # User H: Topic "Random"
    print("User H (Topic: Random) searching...")
    # Should match via global queue fallback
    match = find_match_in_queue("random", "male", "any") # H wants any
    
    if match and match['id'] == "user_G":
        print("✅ PASS: 'Random' topic matched with 'Coding' topic user.")
    else:
        print(f"❌ FAIL: 'Random' topic failed to match. Result: {match}")

if __name__ == "__main__":
    try:
        test_fifo_matching()
        test_desperate_matching()
        test_random_topic_matching()
    except Exception as e:
        print(f"Test Error: {e}")

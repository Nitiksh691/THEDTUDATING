import requests
import time
import json

BASE_URL = "http://localhost:8000"
INTEREST = "Deep Talk & Philosophy"

def test_basic_match():
    """Test 1: Basic matching — two users with same topic should match."""
    print(f"\n--- Test 1: Basic Match for '{INTEREST}' ---")
    
    # User A joins
    print("User A requesting match...")
    resp_a = requests.post(f"{BASE_URL}/match", json={"interest": INTEREST})
    data_a = resp_a.json()
    print(f"User A response: {data_a}")
    
    if data_a["status"] != "waiting":
        print("ERROR: User A should be waiting!")
        return False

    queue_id_a = data_a["queue_id"]
    print(f"User A is waiting with ID: {queue_id_a}")

    # User B joins
    print("\nUser B requesting match...")
    resp_b = requests.post(f"{BASE_URL}/match", json={"interest": INTEREST})
    data_b = resp_b.json()
    print(f"User B response: {data_b}")

    if data_b["status"] != "matched":
        print("ERROR: User B should be matched!")
        return False

    room_id = data_b["room_id"]
    print(f"User B matched! Room ID: {room_id}")

    # User A checks match status
    print("\nUser A checking match status...")
    resp_check = requests.post(f"{BASE_URL}/check-match", json={"interest": INTEREST, "queue_id": queue_id_a})
    data_check = resp_check.json()
    print(f"User A check response: {data_check}")

    if data_check["status"] == "matched":
        print(f"SUCCESS: User A is now matched! Room match: {data_check['room_id'] == room_id}")
        return True
    else:
        print("FAILURE: User A is still waiting.")
        return False


def test_gender_matching():
    """Test 2: Gender filter — Male→Female should match Female→Male."""
    print(f"\n--- Test 2: Gender Matching ---")
    topic = "Gender Test"
    
    # Female looking for Male
    print("Female (looking for Male) requesting match...")
    resp_f = requests.post(f"{BASE_URL}/match", json={
        "interest": topic, "gender": "female", "preference": "male"
    })
    data_f = resp_f.json()
    print(f"Female response: {data_f}")
    assert data_f["status"] == "waiting", "Female should be waiting"
    
    # Male looking for Female (should match!)
    print("\nMale (looking for Female) requesting match...")
    resp_m = requests.post(f"{BASE_URL}/match", json={
        "interest": topic, "gender": "male", "preference": "female"
    })
    data_m = resp_m.json()
    print(f"Male response: {data_m}")
    
    if data_m["status"] == "matched":
        print("SUCCESS: Male↔Female matched!")
        return True
    else:
        print("FAILURE: Should have matched!")
        return False


def test_gender_incompatible():
    """Test 3: Incompatible genders should NOT match."""
    print(f"\n--- Test 3: Incompatible Gender (Male→Female vs Male→Male) ---")
    topic = "Incompatible Test"
    
    # Male looking for Female
    print("Male A (looking for Female) requesting match...")
    resp_a = requests.post(f"{BASE_URL}/match", json={
        "interest": topic, "gender": "male", "preference": "female"
    })
    data_a = resp_a.json()
    print(f"Male A response: {data_a}")
    assert data_a["status"] == "waiting", "Male A should be waiting"
    
    # Another Male looking for Male (should NOT match Male A)
    print("\nMale B (looking for Male) requesting match...")
    resp_b = requests.post(f"{BASE_URL}/match", json={
        "interest": topic, "gender": "male", "preference": "male"
    })
    data_b = resp_b.json()
    print(f"Male B response: {data_b}")
    
    if data_b["status"] == "waiting":
        print("SUCCESS: Incompatible users did NOT match!")
        return True
    else:
        print("FAILURE: They should NOT have matched!")
        return False


def test_topic_normalization():
    """Test 4: Topic normalization — stop words should be stripped."""
    print(f"\n--- Test 4: Topic Normalization ---")
    
    # User A with verbose topic
    print("User A: 'I want to talk about Football'")
    resp_a = requests.post(f"{BASE_URL}/match", json={
        "interest": "I want to talk about Football"
    })
    data_a = resp_a.json()
    print(f"User A response: {data_a}")
    assert data_a["status"] == "waiting", "User A should be waiting"
    
    # User B with simple topic  
    print("\nUser B: 'football'")
    resp_b = requests.post(f"{BASE_URL}/match", json={
        "interest": "football"
    })
    data_b = resp_b.json()
    print(f"User B response: {data_b}")
    
    if data_b["status"] == "matched":
        print("SUCCESS: Topic normalization worked!")
        return True
    else:
        print("FAILURE: Topics should have been normalized to the same queue!")
        return False


def test_admin_protection():
    """Test 5: Admin flush should be protected."""
    print(f"\n--- Test 5: Admin Endpoint Protection ---")
    
    # Without key
    print("Calling /admin/flush WITHOUT key...")
    resp = requests.post(f"{BASE_URL}/admin/flush")
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 403:
        print("SUCCESS: Admin endpoint is protected!")
        return True
    else:
        print(f"FAILURE: Expected 403, got {resp.status_code}")
        return False


def test_queue_leave():
    """Test 6: Queue leave should remove user from queue."""
    print(f"\n--- Test 6: Queue Leave ---")
    topic = "Leave Test"
    
    # User A joins
    print("User A joining queue...")
    resp_a = requests.post(f"{BASE_URL}/match", json={
        "interest": topic, "gender": "male", "preference": "female"
    })
    data_a = resp_a.json()
    assert data_a["status"] == "waiting"
    queue_id = data_a["queue_id"]
    print(f"User A waiting: {queue_id}")
    
    # User A leaves
    print("User A leaving queue...")
    resp_leave = requests.post(f"{BASE_URL}/queue/leave", json={
        "queue_id": queue_id,
        "interest": topic,
        "gender": "male",
        "preference": "female"
    })
    print(f"Leave response: {resp_leave.json()}")
    
    # User B joins (should NOT find A)
    print("\nFemale (looking for Male) requesting match...")
    resp_b = requests.post(f"{BASE_URL}/match", json={
        "interest": topic, "gender": "female", "preference": "male"
    })
    data_b = resp_b.json()
    print(f"User B response: {data_b}")
    
    if data_b["status"] == "waiting":
        print("SUCCESS: User A was properly removed from queue!")
        return True
    else:
        print("FAILURE: User B matched a ghost!")
        return False


if __name__ == "__main__":
    results = []
    tests = [
        test_basic_match,
        test_gender_matching,
        test_gender_incompatible,
        test_topic_normalization,
        test_admin_protection,
        test_queue_leave,
    ]
    
    # Flush first (with dev key)
    print("=== Flushing Redis for clean test ===")
    flush_resp = requests.post(f"{BASE_URL}/admin/flush", headers={"X-Admin-Key": "default-dev-key"})
    print(f"Flush: {flush_resp.json()}\n")
    
    for test_fn in tests:
        try:
            passed = test_fn()
            results.append((test_fn.__name__, passed))
        except Exception as e:
            print(f"EXCEPTION: {e}")
            results.append((test_fn.__name__, False))
    
    # Summary
    print("\n" + "=" * 50)
    print("TEST RESULTS")
    print("=" * 50)
    passed_count = sum(1 for _, p in results if p)
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status}  {name}")
    print(f"\n{passed_count}/{len(results)} tests passed")

import requests
import time
import json

BASE_URL = "http://localhost:8000"
INTEREST = "Deep Talk & Philosophy"

def test_match():
    print(f"--- Starting Match Test for interest: {INTEREST} ---")
    
    # 1. User A joins
    print("User A requesting match...")
    resp_a = requests.post(f"{BASE_URL}/match", json={"interest": INTEREST})
    data_a = resp_a.json()
    print(f"User A response: {data_a}")
    
    if data_a["status"] != "waiting":
        print("ERROR: User A should be waiting!")
        return

    queue_id_a = data_a["queue_id"]
    print(f"User A is waiting with ID: {queue_id_a}")

    # 2. User B joins
    print("\nUser B requesting match...")
    resp_b = requests.post(f"{BASE_URL}/match", json={"interest": INTEREST})
    data_b = resp_b.json()
    print(f"User B response: {data_b}")

    if data_b["status"] != "matched":
        print("ERROR: User B should be matched!")
        return

    room_id = data_b["room_id"]
    print(f"User B matched! Room ID: {room_id}")

    # 3. User A checks match status
    print("\nUser A checking match status...")
    resp_check = requests.post(f"{BASE_URL}/check-match", json={"interest": INTEREST, "queue_id": queue_id_a})
    data_check = resp_check.json()
    print(f"User A check response: {data_check}")

    if data_check["status"] == "matched":
        print("SUCCESS: User A is now matched!")
        print(f"Room ID match: {data_check['room_id'] == room_id}")
    else:
        print("FAILURE: User A is still waiting (or lost).")

if __name__ == "__main__":
    try:
        test_match()
    except Exception as e:
        print(f"Test failed: {e}")

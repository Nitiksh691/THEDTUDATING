/**
 * Comprehensive API Integration Tests
 * Tests all 17 endpoints against the running server with real Upstash Redis.
 *
 * Test groups:
 *   1. Health & Infrastructure
 *   2. Matching Flow (match → check-match → full cycle)
 *   3. Queue Management (leave, browse, stats)
 *   4. Chat Flow (send, poll, typing, signal, leave)
 *   5. Group Chat (create, join, close, room info)
 *   6. Global Chat (send, poll, rate limiting)
 *   7. Admin (flush)
 *   8. Input Validation (missing fields, edge cases)
 *   9. Direct Match Flow
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app, server } from "../src/index";

// ─── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

// ─── Flush before & after ──────────────────────────────────────────────────

beforeAll(async () => {
    await request(app)
        .post("/admin/flush")
        .set("x-admin-key", process.env.ADMIN_KEY || "default-dev-key")
        .expect(200);
});

afterAll(async () => {
    await request(app)
        .post("/admin/flush")
        .set("x-admin-key", process.env.ADMIN_KEY || "default-dev-key");
    server.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. HEALTH & INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

describe("Health & Infrastructure", () => {
    it("GET /health returns ok with uptime", async () => {
        const res = await request(app).get("/health").expect(200);
        expect(res.body.status).toBe("ok");
        expect(res.body.uptime).toBeGreaterThan(0);
    });

    it("GET / returns dashboard HTML", async () => {
        const res = await request(app).get("/").expect(200);
        expect(res.text).toContain("DD Server");
        expect(res.text).toContain("Live Monitor");
    });

    it("sets security headers", async () => {
        const res = await request(app).get("/health");
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["x-frame-options"]).toBe("DENY");
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. MATCHING FLOW
// ═══════════════════════════════════════════════════════════════════════════

describe("Matching Flow", () => {
    let user1QueueId: string;
    let user2RoomId: string;
    let user2UserId: string;

    it("POST /match — first user gets waiting status", async () => {
        const res = await request(app)
            .post("/match")
            .send({ interest: "coding", gender: "male", preference: "any", nickname: "Alice" })
            .expect(200);

        expect(res.body.status).toBe("waiting");
        expect(res.body.user_id).toBeTruthy();
        expect(res.body.codename).toBeTruthy();
        expect(res.body.queue_id).toBeTruthy();
        user1QueueId = res.body.queue_id;
    });

    it("POST /check-match — user1 still waiting", async () => {
        const res = await request(app)
            .post("/check-match")
            .send({ queue_id: user1QueueId })
            .expect(200);

        expect(res.body.status).toBe("waiting");
    });

    it("POST /match — second user gets matched", async () => {
        const res = await request(app)
            .post("/match")
            .send({ interest: "coding", gender: "female", preference: "any", nickname: "Bob" })
            .expect(200);

        expect(res.body.status).toBe("matched");
        expect(res.body.room_id).toBeTruthy();
        expect(res.body.codename).toBeTruthy();
        expect(res.body.partner_codename).toBeTruthy();
        expect(res.body.matched_topic).toBe("coding");
        user2RoomId = res.body.room_id;
        user2UserId = res.body.user_id;
    });

    it("POST /check-match — user1 now matched", async () => {
        const res = await request(app)
            .post("/check-match")
            .send({ queue_id: user1QueueId })
            .expect(200);

        expect(res.body.status).toBe("matched");
        expect(res.body.room_id).toBeTruthy();
        expect(res.body.codename).toBeTruthy();
        expect(res.body.partner_codename).toBeTruthy();
    });

    it("GET /room/:id/info returns room data", async () => {
        const res = await request(app)
            .get(`/room/${user2RoomId}/info`)
            .expect(200);

        expect(res.body.status).toBe("ok");
        expect(res.body.topic).toBe("coding");
        expect(res.body.type).toBe("pair");
        expect(res.body.participants).toHaveLength(2);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. QUEUE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

describe("Queue Management", () => {
    it("GET /queue-stats returns stats structure", async () => {
        const res = await request(app).get("/queue-stats").expect(200);

        expect(res.body).toHaveProperty("total_online");
        expect(res.body).toHaveProperty("waiting_count");
        expect(res.body).toHaveProperty("active_chat_users");
        expect(res.body).toHaveProperty("top_topics");
        expect(Array.isArray(res.body.top_topics)).toBe(true);
    });

    it("GET /queue/browse returns people array", async () => {
        const res = await request(app).get("/queue/browse").expect(200);
        expect(res.body).toHaveProperty("people");
        expect(Array.isArray(res.body.people)).toBe(true);
    });

    it("POST /queue/leave removes user from queue", async () => {
        // First add a user to queue
        const matchRes = await request(app)
            .post("/match")
            .send({ interest: "music", gender: "male", preference: "any" })
            .expect(200);

        expect(matchRes.body.status).toBe("waiting");

        // Leave the queue
        const leaveRes = await request(app)
            .post("/queue/leave")
            .send({
                queue_id: matchRes.body.queue_id,
                interest: "music",
                gender: "male",
                preference: "any",
            })
            .expect(200);

        expect(leaveRes.body.status).toBe("removed");
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. CHAT FLOW
// ═══════════════════════════════════════════════════════════════════════════

describe("Chat Flow", () => {
    let roomId: string;
    let user1Id: string;
    let user2Id: string;

    beforeAll(async () => {
        // Flush and create a matched pair
        await request(app)
            .post("/admin/flush")
            .set("x-admin-key", process.env.ADMIN_KEY || "default-dev-key");

        const r1 = await request(app)
            .post("/match")
            .send({ interest: "testing", gender: "male", preference: "any" });
        user1Id = r1.body.user_id;

        const r2 = await request(app)
            .post("/match")
            .send({ interest: "testing", gender: "female", preference: "any" });
        expect(r2.body.status).toBe("matched");
        roomId = r2.body.room_id;
        user2Id = r2.body.user_id;
    });

    it("POST /chat/send — sends a message", async () => {
        const res = await request(app)
            .post("/chat/send")
            .send({ room_id: roomId, user_id: user1Id, text: "Hello from user 1!" })
            .expect(200);

        expect(res.body.status).toBe("sent");
    });

    it("POST /chat/poll — user2 receives the message", async () => {
        const res = await request(app)
            .post("/chat/poll")
            .send({ room_id: roomId, user_id: user2Id })
            .expect(200);

        expect(res.body.messages).toBeTruthy();
        expect(res.body.messages.length).toBeGreaterThan(0);
        expect(res.body.messages[0].type).toBe("chat");
        expect(res.body.messages[0].text).toBe("Hello from user 1!");
    });

    it("POST /chat/typing — sends typing indicator", async () => {
        const res = await request(app)
            .post("/chat/typing")
            .send({ room_id: roomId, user_id: user1Id })
            .expect(200);
        expect(res.body.status).toBe("ok");
    });

    it("POST /chat/poll after typing — user2 sees typing", async () => {
        const res = await request(app)
            .post("/chat/poll")
            .send({ room_id: roomId, user_id: user2Id })
            .expect(200);

        const typingMsgs = res.body.messages.filter((m: any) => m.type === "typing");
        expect(typingMsgs.length).toBeGreaterThan(0);
    });

    it("POST /chat/signal — sends a signal (reaction)", async () => {
        const res = await request(app)
            .post("/chat/signal")
            .send({ room_id: roomId, user_id: user1Id, type: "reaction", payload: { emoji: "❤️" } })
            .expect(200);
        expect(res.body.status).toBe("ok");
    });

    it("POST /chat/leave — user leaves and partner is notified", async () => {
        const leaveRes = await request(app)
            .post("/chat/leave")
            .send({ room_id: roomId, user_id: user1Id })
            .expect(200);
        expect(leaveRes.body.status).toBe("left");

        // User2 should get partner_disconnected
        const pollRes = await request(app)
            .post("/chat/poll")
            .send({ room_id: roomId, user_id: user2Id })
            .expect(200);

        const disconnectMsgs = pollRes.body.messages.filter(
            (m: any) => m.type === "partner_disconnected"
        );
        expect(disconnectMsgs.length).toBeGreaterThan(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. GROUP CHAT
// ═══════════════════════════════════════════════════════════════════════════

describe("Group Chat", () => {
    let groupRoomId: string;
    let creator1Id: string;
    let joiner2Id: string;

    beforeAll(async () => {
        await request(app)
            .post("/admin/flush")
            .set("x-admin-key", process.env.ADMIN_KEY || "default-dev-key");
    });

    it("POST /match-group — creates a new group", async () => {
        const res = await request(app)
            .post("/match-group")
            .send({ interest: "anime", gender: "any", preference: "any", max_size: 5 })
            .expect(200);

        expect(res.body.status).toBe("created");
        expect(res.body.room_id).toBeTruthy();
        expect(res.body.codename).toBeTruthy();
        expect(res.body.room_type).toBe("group");
        expect(res.body.participants).toHaveLength(1);
        groupRoomId = res.body.room_id;
        creator1Id = res.body.user_id;
    });

    it("POST /match-group — second user joins existing group", async () => {
        const res = await request(app)
            .post("/match-group")
            .send({ interest: "anime", gender: "any", preference: "any" })
            .expect(200);

        expect(res.body.status).toBe("joined");
        expect(res.body.room_id).toBe(groupRoomId);
        expect(res.body.participants).toHaveLength(2);
        joiner2Id = res.body.user_id;
    });

    it("GET /room/:id/info — shows group info", async () => {
        const res = await request(app)
            .get(`/room/${groupRoomId}/info`)
            .expect(200);

        expect(res.body.type).toBe("group");
        expect(res.body.participants.length).toBeGreaterThanOrEqual(2);
        expect(res.body.open).toBe(true);
    });

    it("POST /group/close — closes the group", async () => {
        const res = await request(app)
            .post("/group/close")
            .send({ room_id: groupRoomId, user_id: creator1Id })
            .expect(200);

        expect(res.body.status).toBe("closed");
    });

    it("GET /room/:id/info — group is now closed", async () => {
        const res = await request(app)
            .get(`/room/${groupRoomId}/info`)
            .expect(200);

        expect(res.body.open).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. GLOBAL CHAT
// ═══════════════════════════════════════════════════════════════════════════

describe("Global Chat", () => {
    beforeAll(async () => {
        await request(app)
            .post("/admin/flush")
            .set("x-admin-key", process.env.ADMIN_KEY || "default-dev-key");
    });

    it("POST /chat/global/send — sends a global message", async () => {
        const res = await request(app)
            .post("/chat/global/send")
            .send({ text: "Hello World!", sender_codename: "TestUser", sender_color: "#ff0000" })
            .expect(200);

        expect(res.body.status).toBe("sent");
    });

    it("POST /chat/global/poll — retrieves global messages", async () => {
        // Wait a moment for write to propagate
        await sleep(200);

        const res = await request(app)
            .post("/chat/global/poll")
            .send({ last_timestamp: 0 })
            .expect(200);

        expect(res.body.messages).toBeTruthy();
        expect(res.body.messages.length).toBeGreaterThan(0);
        expect(res.body.messages[0].text).toBe("Hello World!");
        expect(res.body.messages[0].sender).toBe("TestUser");
    });

    it("POST /chat/global/send — rate limited on rapid calls", async () => {
        // First call should succeed (but might be rate limited from previous test)
        // Wait for rate limit window to expire
        await sleep(5500);

        const res1 = await request(app)
            .post("/chat/global/send")
            .send({ text: "Msg1", sender_codename: "RateTest" })
            .expect(200);

        // Immediate second call should be rate limited
        const res2 = await request(app)
            .post("/chat/global/send")
            .send({ text: "Msg2", sender_codename: "RateTest" });

        expect(res2.status).toBe(429);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. ADMIN
// ═══════════════════════════════════════════════════════════════════════════

describe("Admin", () => {
    it("POST /admin/flush — requires auth header", async () => {
        const res = await request(app)
            .post("/admin/flush")
            .expect(401);

        expect(res.body.detail).toContain("Missing");
    });

    it("POST /admin/flush — rejects wrong key", async () => {
        const res = await request(app)
            .post("/admin/flush")
            .set("x-admin-key", "wrong-key")
            .expect(403);

        expect(res.body.detail).toContain("Invalid");
    });

    it("POST /admin/flush — works with correct key", async () => {
        const res = await request(app)
            .post("/admin/flush")
            .set("x-admin-key", process.env.ADMIN_KEY || "default-dev-key")
            .expect(200);

        expect(res.body.status).toBe("flushed all");
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. INPUT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Input Validation", () => {
    it("POST /check-match — missing queue_id returns 400", async () => {
        const res = await request(app)
            .post("/check-match")
            .send({})
            .expect(400);

        expect(res.body.detail).toContain("queue_id");
    });

    it("POST /match/direct — missing codename returns 400", async () => {
        const res = await request(app)
            .post("/match/direct")
            .send({})
            .expect(400);

        expect(res.body.detail).toContain("codename");
    });

    it("POST /chat/send — missing fields returns 400", async () => {
        const res = await request(app)
            .post("/chat/send")
            .send({ room_id: "test" })
            .expect(400);

        expect(res.body.detail).toContain("Missing");
    });

    it("POST /chat/poll — missing user_id returns 400", async () => {
        const res = await request(app)
            .post("/chat/poll")
            .send({ room_id: "test" })
            .expect(400);

        expect(res.body.detail).toContain("user_id");
    });

    it("POST /chat/signal — missing type returns 400", async () => {
        const res = await request(app)
            .post("/chat/signal")
            .send({ room_id: "test", user_id: "test" })
            .expect(400);

        expect(res.body.detail).toContain("type");
    });

    it("POST /chat/global/send — missing text returns 400", async () => {
        const res = await request(app)
            .post("/chat/global/send")
            .send({ sender_codename: "Test" })
            .expect(400);

        expect(res.body.detail).toContain("text");
    });

    it("POST /chat/global/send — missing sender_codename returns 400", async () => {
        const res = await request(app)
            .post("/chat/global/send")
            .send({ text: "Hello" })
            .expect(400);

        expect(res.body.detail).toContain("sender_codename");
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. DIRECT MATCH
// ═══════════════════════════════════════════════════════════════════════════

describe("Direct Match", () => {
    let waitingUserCodename: string;
    let waitingUserQueueId: string;

    beforeAll(async () => {
        await request(app)
            .post("/admin/flush")
            .set("x-admin-key", process.env.ADMIN_KEY || "default-dev-key");
    });

    it("POST /match — put a user in queue", async () => {
        const res = await request(app)
            .post("/match")
            .send({ interest: "philosophy", gender: "male", preference: "any" })
            .expect(200);

        expect(res.body.status).toBe("waiting");
        waitingUserCodename = res.body.codename;
        waitingUserQueueId = res.body.queue_id;
    });

    it("POST /match/direct — matches with user by codename", async () => {
        const res = await request(app)
            .post("/match/direct")
            .send({ codename: waitingUserCodename })
            .expect(200);

        expect(res.body.status).toBe("matched");
        expect(res.body.room_id).toBeTruthy();
        expect(res.body.partner_codename).toBeTruthy();
        expect(res.body.matched_topic).toBe("philosophy");
    });

    it("POST /match/direct — not_found for non-existent codename", async () => {
        const res = await request(app)
            .post("/match/direct")
            .send({ codename: "NonExistentUser999" })
            .expect(200);

        expect(res.body.status).toBe("not_found");
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe("Edge Cases", () => {
    it("POST /match — topic normalization works", async () => {
        await request(app)
            .post("/admin/flush")
            .set("x-admin-key", process.env.ADMIN_KEY || "default-dev-key");

        const r1 = await request(app)
            .post("/match")
            .send({ interest: "  CODING  ", gender: "male", preference: "any" });
        expect(r1.body.status).toBe("waiting");

        const r2 = await request(app)
            .post("/match")
            .send({ interest: "coding", gender: "female", preference: "any" });
        // They should match on the same normalized topic
        expect(r2.body.status).toBe("matched");
        expect(r2.body.matched_topic).toBe("coding");
    });

    it("POST /match — empty interest defaults to random", async () => {
        await request(app)
            .post("/admin/flush")
            .set("x-admin-key", process.env.ADMIN_KEY || "default-dev-key");

        const r1 = await request(app)
            .post("/match")
            .send({ interest: "", gender: "male", preference: "any" });
        expect(r1.body.status).toBe("waiting");

        const r2 = await request(app)
            .post("/match")
            .send({ gender: "female", preference: "any" });
        expect(r2.body.status).toBe("matched");
    });

    it("GET /room/:id/info — non-existent room returns not_found", async () => {
        const res = await request(app)
            .get("/room/non-existent-room-id/info")
            .expect(200);
        expect(res.body.status).toBe("not_found");
    });

    it("POST /check-match — non-existent queue_id returns waiting", async () => {
        const res = await request(app)
            .post("/check-match")
            .send({ queue_id: "non-existent-id" })
            .expect(200);
        expect(res.body.status).toBe("waiting");
    });
});

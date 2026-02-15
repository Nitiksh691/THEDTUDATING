// ─── TypeScript Interfaces ─────────────────────────────────────────────────
// Shared types used across controllers, services, and routes.

// ─── Match ─────────────────────────────────────────────────────────────────

export interface MatchRequest {
    interest: string;
    gender?: string;
    preference?: string;
    nickname?: string;
}

export interface MatchResponse {
    status: "matched" | "waiting";
    room_id?: string;
    user_id?: string;
    codename?: string;
    partner_codename?: string;
    queue_id?: string;
    matched_topic?: string;
}

export interface CheckMatchRequest {
    interest: string;
    queue_id: string;
}

export interface CheckMatchResponse {
    status: "matched" | "waiting" | "expired";
    room_id?: string;
    codename?: string;
    partner_codename?: string;
}

export interface DirectMatchRequest {
    codename: string;
    my_gender?: string;
    my_preference?: string;
}

// ─── Queue ─────────────────────────────────────────────────────────────────

export interface QueueLeaveRequest {
    queue_id: string;
    interest: string;
    gender?: string;
    preference?: string;
}

export interface QueueUser {
    id: string;
    codename: string;
    gender: string;
    preference: string;
    nickname: string;
    topic: string;
    joined_at: number;
}

export interface BrowseUser {
    codename: string;
    topic: string;
    gender: string;
    nickname: string;
    waiting_seconds: number;
}

// ─── Room ──────────────────────────────────────────────────────────────────

export interface RoomUser {
    id: string;
    codename: string;
}

export interface RoomData {
    topic: string;
    type: "pair" | "group";
    max_size: number;
    users: RoomUser[];
    active: boolean;
    open: boolean;
    created_at: number;
}

// ─── Chat ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
    room_id: string;
    user_id: string;
    text: string;
}

export interface PollRequest {
    room_id: string;
    user_id: string;
}

export interface LeaveRequest {
    room_id: string;
    user_id: string;
}

export interface SignalRequest {
    room_id: string;
    user_id: string;
    type: string;
    payload?: Record<string, unknown>;
}

// ─── Group ─────────────────────────────────────────────────────────────────

export interface GroupMatchRequest {
    interest: string;
    gender?: string;
    preference?: string;
    max_size?: number;
}

// ─── Global Chat ───────────────────────────────────────────────────────────

export interface GlobalMessage {
    text: string;
    sender_codename: string;
    sender_color?: string;
}

export interface GlobalPollRequest {
    last_timestamp?: number;
}

// ─── Stats ─────────────────────────────────────────────────────────────────

export interface QueueStats {
    total_online: number;
    waiting_count: number;
    active_chat_users: number;
    top_topics: { topic: string; count: number }[];
}

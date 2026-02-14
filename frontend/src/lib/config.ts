// ─── Centralized Configuration ─────────────────────────────────────────────
// Single source of truth for API URLs. Change here to update everywhere.

export const API_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "https://thedtudating.onrender.com");

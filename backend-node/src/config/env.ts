import dotenv from "dotenv";
dotenv.config();

// ─── Environment Variables ─────────────────────────────────────────────────
// Centralized config — Redis credentials are REQUIRED, no defaults.

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`❌ Missing required env var: ${name}. Copy .env.example → .env and fill in values.`);
    }
    return value;
}

export const env = {
    /** Upstash Redis REST URL */
    UPSTASH_REDIS_REST_URL: requireEnv("UPSTASH_REDIS_REST_URL"),

    /** Upstash Redis REST Token */
    UPSTASH_REDIS_REST_TOKEN: requireEnv("UPSTASH_REDIS_REST_TOKEN"),

    /** Admin key for protected endpoints */
    ADMIN_KEY: process.env.ADMIN_KEY || "default-dev-key",

    /** Server port */
    PORT: parseInt(process.env.PORT || "3001", 10),

    /** CORS origins (comma-separated or *) */
    CORS_ORIGINS: process.env.CORS_ORIGINS || "*",

    /** MongoDB Connection String */
    MONGODB_URI: process.env.MONGODB_URI,
} as const;

// ─── Validation ────────────────────────────────────────────────────────────

if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    console.error("❌ Missing Redis credentials in .env file");
    process.exit(1);
}

if (!env.MONGODB_URI) {
    console.warn("⚠️  Missing MONGODB_URI in .env file — MongoDB features (Admin/Polls) will not work.");
}

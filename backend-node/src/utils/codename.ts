// ─── Codename Generator ────────────────────────────────────────────────────
// Generates anonymous codenames like "Subject #423" for matched users.

export function generateCodename(): string {
    const num = Math.floor(Math.random() * 900) + 100; // 100–999
    return `Subject #${num}`;
}

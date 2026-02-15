// ─── Topic Normalization ───────────────────────────────────────────────────
// Strips common stop words and lowercases to canonicalize topics.
// "I want to talk about Football" → "football"

const STOP_WORDS = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "is", "it", "as", "be", "this", "that", "i",
    "me", "my", "we", "our", "about", "like", "want", "lets", "let",
    "talk", "discuss", "chat", "conversation", "just", "some", "do",
    "does", "doing", "would", "could", "should", "have", "has", "had",
]);

export function normalizeTopic(raw: string): string {
    const words = raw.toLowerCase().split(/\s+/);
    const filtered = words.filter((w) => !STOP_WORDS.has(w));
    const result = (filtered.length > 0 ? filtered : words).join(" ").trim();
    return result || "random";
}

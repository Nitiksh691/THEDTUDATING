"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import RevealCard from "./RevealCard";

const getWsUrl = () => {
    return "wss://thedtudating.onrender.com";
};

const getApiUrl = () => {
    return "https://thedtudating.onrender.com";
};

interface ChatProps {
    roomId: string;
    codename: string;
    partnerCodename: string;
    onDisconnected: (reason?: "partner_left" | "error" | null) => void;
}

interface Message {
    id: string;
    sender: "me" | "partner";
    text: string;
    timestamp: number;
}

export default function Chat({
    roomId,
    codename,
    partnerCodename,
    onDisconnected,
}: ChatProps) {
    const [userId] = useState(() => Math.random().toString(36).substring(2));
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [partnerTyping, setPartnerTyping] = useState(false);
    const [revealState, setRevealState] = useState<
        "idle" | "i_requested" | "partner_requested" | "mutual"
    >("idle");
    const [partnerRevealData, setPartnerRevealData] = useState<Record<string, string> | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const partnerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, partnerTyping]);

    // HTTP Long Polling Logic
    useEffect(() => {
        let active = true;
        let timeoutId: NodeJS.Timeout;

        const poll = async () => {
            if (!active) return;
            try {
                const res = await fetch(`${getApiUrl()}/chat/poll`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ room_id: roomId, user_id: userId }),
                });

                if (res.ok) {
                    const data = await res.json();
                    const newMessages = data.messages || [];

                    if (newMessages.length > 0) {
                        newMessages.forEach((msg: any) => {
                            console.log("[Blind Connection] 📨 Poll Message:", msg);
                            if (msg.type === "chat") {
                                setMessages((prev) => [
                                    ...prev,
                                    {
                                        id: Math.random().toString(36).substring(2, 15),
                                        sender: "partner",
                                        text: msg.text,
                                        timestamp: msg.timestamp || Date.now(),
                                    },
                                ]);
                                setPartnerTyping(false);
                            } else if (msg.type === "typing") {
                                setPartnerTyping(true);
                                if (partnerTypingTimeoutRef.current)
                                    clearTimeout(partnerTypingTimeoutRef.current);
                                partnerTypingTimeoutRef.current = setTimeout(
                                    () => setPartnerTyping(false),
                                    2000
                                );
                            } else if (msg.type === "reveal_request") {
                                setRevealState((prev) => prev === "i_requested" ? "mutual" : "partner_requested");
                            } else if (msg.type === "reveal_accept") {
                                setRevealState("mutual");
                            } else if (msg.type === "reveal_data") {
                                setPartnerRevealData(msg.fields);
                            } else if (msg.type === "partner_disconnected") {
                                console.log("[Blind Connection] ⚠️ Partner disconnected");
                                active = false;
                                onDisconnected("partner_left");
                            }
                        });
                    }
                }
            } catch (err) {
                console.error("Poll error:", err);
                // Wait slightly longer on error before retry
                if (active) timeoutId = setTimeout(poll, 2000);
                return;
            }

            // Immediately poll again if active (for long polling effect)
            if (active) timeoutId = setTimeout(poll, 100);
        };

        poll();

        return () => {
            active = false;
            if (timeoutId) clearTimeout(timeoutId);
            // Try to leave
            fetch(`${getApiUrl()}/chat/leave`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room_id: roomId, user_id: userId }),
                keepalive: true
            });
        };
    }, [roomId, userId, onDisconnected]);

    const generateId = () => Math.random().toString(36).substring(2, 15);

    const sendMessage = useCallback(async () => {
        if (!input.trim()) return;
        const text = input.trim();
        setInput("");

        // Optimistic update
        setMessages((prev) => [
            ...prev,
            {
                id: generateId(),
                sender: "me",
                text,
                timestamp: Date.now(),
            },
        ]);

        try {
            await fetch(`${getWsUrl().replace("wss:", "https:")}/chat/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room_id: roomId, user_id: userId, text }),
            });
        } catch (err) {
            console.error("Send error:", err);
        }

        inputRef.current?.focus();
    }, [input, roomId, userId]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);

        // Send typing indicator (throttled)
        if (!typingTimeoutRef.current) {
            fetch(`${getWsUrl().replace("wss:", "https:")}/chat/typing`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room_id: roomId, user_id: userId }),
            });
            typingTimeoutRef.current = setTimeout(() => {
                typingTimeoutRef.current = null;
            }, 2000);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleRevealRequest = async () => {
        if (revealState === "idle") {
            setRevealState("i_requested");
            await fetch(`${getWsUrl().replace("wss:", "https:")}/chat/signal`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room_id: roomId, user_id: userId, type: "reveal_request" }),
            });
        } else if (revealState === "partner_requested") {
            setRevealState("mutual");
            await fetch(`${getWsUrl().replace("wss:", "https:")}/chat/signal`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room_id: roomId, user_id: userId, type: "reveal_accept" }),
            });
        }
    };

    const handleSendRevealData = async (fields: Record<string, string>) => {
        await fetch(`${getWsUrl().replace("wss:", "https:")}/chat/signal`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room_id: roomId, user_id: userId, type: "reveal_data", payload: fields }),
        });
    };

    const formatTime = (ts: number) => {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex flex-col bg-[var(--bg)]"
        >
            {/* Header */}
            <div className="glass-strong rounded-none border-x-0 border-t-0 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-green)] flex items-center justify-center text-xs font-bold text-black">
                        ?
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                            {partnerCodename}
                        </h3>
                        <p className="text-[10px] text-[var(--accent-green)] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)] inline-block" />
                            Connected
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleRevealRequest}
                    disabled={revealState === "i_requested" || revealState === "mutual"}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 cursor-pointer
            ${revealState === "idle"
                            ? "bg-[var(--accent)]/20 text-[var(--accent-light)] hover:bg-[var(--accent)]/30 border border-[var(--accent)]/30"
                            : revealState === "partner_requested"
                                ? "bg-[var(--accent-green)]/20 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/30 border border-[var(--accent-green)]/30 animate-pulse"
                                : revealState === "i_requested"
                                    ? "bg-white/5 text-[var(--text-secondary)] border border-white/10"
                                    : "bg-[var(--accent-green)]/20 text-[var(--accent-green)] border border-[var(--accent-green)]/30"
                        }`}
                >
                    {revealState === "idle"
                        ? "🔓 Request Reveal"
                        : revealState === "i_requested"
                            ? "⏳ Waiting..."
                            : revealState === "partner_requested"
                                ? "✨ Reveal Yours Too"
                                : "✅ Revealed"}
                </button>
            </div>

            {/* Partner requested banner */}
            <AnimatePresence>
                {revealState === "partner_requested" && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-[var(--accent-green)]/10 border-b border-[var(--accent-green)]/20 px-4 py-2 text-center text-xs text-[var(--accent-green)]">
                            ✨ Partner wants to share their info — click &quot;Reveal Yours
                            Too&quot; to unlock!
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Reveal Card */}
            <AnimatePresence>
                {revealState === "mutual" && (
                    <RevealCard
                        partnerCodename={partnerCodename}
                        partnerData={partnerRevealData}
                        onSendData={handleSendRevealData}
                    />
                )}
            </AnimatePresence>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
                {/* System message */}
                <div className="text-center py-4">
                    <div className="inline-block glass px-4 py-2 text-[10px] text-[var(--text-secondary)]">
                        🔒 You&apos;re connected with{" "}
                        <span className="text-[var(--accent-light)] font-medium">
                            {partnerCodename}
                        </span>
                        . Messages are never stored.
                    </div>
                </div>

                {messages.map((msg) => (
                    <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={`max-w-[80%] sm:max-w-[65%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed
                ${msg.sender === "me"
                                    ? "bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] text-white rounded-br-md"
                                    : "bg-white/[0.06] border border-white/[0.08] text-[var(--text-primary)] rounded-bl-md"
                                }`}
                        >
                            <p>{msg.text}</p>
                            <p
                                className={`text-[10px] mt-1 ${msg.sender === "me" ? "text-white/50" : "text-[var(--text-secondary)]"
                                    }`}
                            >
                                {formatTime(msg.timestamp)}
                            </p>
                        </div>
                    </motion.div>
                ))}

                {/* Typing Indicator */}
                <AnimatePresence>
                    {partnerTyping && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="flex justify-start"
                        >
                            <div className="bg-white/[0.06] border border-white/[0.08] rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[var(--accent-light)] typing-dot" />
                                <span className="w-2 h-2 rounded-full bg-[var(--accent-light)] typing-dot" />
                                <span className="w-2 h-2 rounded-full bg-[var(--accent-light)] typing-dot" />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="shrink-0 px-3 sm:px-6 py-3 sm:py-4 border-t border-white/[0.06]">
                <div className="flex items-center gap-2 max-w-3xl mx-auto">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message..."
                        className="flex-1 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] 
              text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]
              focus:outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/10
              transition-all duration-200"
                    />
                    <motion.button
                        onClick={sendMessage}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        disabled={!input.trim()}
                        className={`p-3 rounded-xl transition-all duration-200 cursor-pointer
              ${input.trim()
                                ? "bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] text-white shadow-lg shadow-purple-500/20"
                                : "bg-white/[0.05] text-[var(--text-secondary)]"
                            }`}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                            />
                        </svg>
                    </motion.button>
                </div>
            </div>
        </motion.div>
    );
}

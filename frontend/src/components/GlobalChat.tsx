"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, AlertTriangle, Radio } from "lucide-react";
import { API_URL } from "@/lib/config";

interface GlobalMsg {
    id: string;
    text: string;
    sender: string;
    color: string;
    timestamp: number;
}

function isBraveBrowser(): boolean {
    if (typeof navigator === "undefined") return false;
    return (navigator as any).brave !== undefined;
}

export default function GlobalChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<GlobalMsg[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [lastTimestamp, setLastTimestamp] = useState(0);
    const [showBraveWarning, setShowBraveWarning] = useState(false);
    const [connectionError, setConnectionError] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const isBrave = useMemo(() => isBraveBrowser(), []);

    useEffect(() => {
        if (isOpen && isBrave) setShowBraveWarning(true);
    }, [isOpen, isBrave]);

    useEffect(() => {
        if (isOpen && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [isOpen, messages]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    // Poll for new messages
    useEffect(() => {
        if (!isOpen) return;
        const fetchMessages = async () => {
            try {
                const res = await fetch(`${API_URL}/chat/global/poll`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ last_timestamp: lastTimestamp }),
                });
                const data = await res.json();
                setConnectionError(false);
                if (data.messages && data.messages.length > 0) {
                    setMessages((prev) => {
                        const existingIds = new Set(prev.map((m) => m.id));
                        const newMsgs = data.messages.filter((m: GlobalMsg) => !existingIds.has(m.id));
                        if (newMsgs.length === 0) return prev;
                        const combined = [...prev, ...newMsgs].sort((a, b) => a.timestamp - b.timestamp);
                        const latest = combined[combined.length - 1];
                        setLastTimestamp(latest.timestamp);
                        return combined.slice(-50);
                    });
                }
            } catch (err) {
                console.error("Global poll error:", err);
                setConnectionError(true);
            }
        };
        fetchMessages();
        const interval = setInterval(fetchMessages, 3000);
        return () => clearInterval(interval);
    }, [isOpen, lastTimestamp]);

    const sendMessage = async () => {
        if (!input.trim() || loading) return;
        const text = input.trim();
        setInput("");
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/chat/global/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: text,
                    sender_codename: "Anonymous",
                    sender_color: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0"),
                }),
            });
            if (res.status === 429) {
                alert("Slow down! You can only send 1 message every 2 seconds.");
            } else if (!res.ok) {
                const errText = await res.text();
                console.error(`Send failed: ${res.status} ${res.statusText}`, errText);
            }
        } catch (err) {
            console.error("Send error:", err);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (ts: number) => {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    return (
        <>
            {/* ───── Full-Screen Overlay ───── */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center"
                    >
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/80"
                            onClick={() => setIsOpen(false)}
                        />

                        {/* Chat Container */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className="relative z-10 w-full max-w-2xl h-[85vh] mx-4 flex flex-col rounded-xl overflow-hidden bg-[#0e0e10] border border-white/[0.06]"
                        >
                            {/* ── Header ── */}
                            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-[#18181b]">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Radio className="w-4 h-4 text-red-500" />
                                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                                    </div>
                                    <div>
                                        <h2 className="text-white font-semibold text-base tracking-tight">Live Chat</h2>
                                        <p className="text-white/30 text-[11px] -mt-0.5">
                                            {messages.length > 0 ? `${messages.length} messages` : "Be the first to chat"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {connectionError && (
                                        <span className="text-red-400 text-xs flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                                            Offline
                                        </span>
                                    )}
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
                                    >
                                        <X className="w-5 h-5 text-gray-500 hover:text-white transition-colors" />
                                    </button>
                                </div>
                            </div>

                            {/* ── Brave Warning ── */}
                            <AnimatePresence>
                                {showBraveWarning && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="flex items-start gap-3 px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/15">
                                            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                                            <p className="text-amber-200/80 text-xs leading-relaxed flex-1">
                                                <strong>Brave Browser detected.</strong> Shields may block chat. Disable Shields for this site or use Chrome/Edge.
                                            </p>
                                            <button
                                                onClick={() => setShowBraveWarning(false)}
                                                className="p-0.5 text-amber-400/50 hover:text-amber-300"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* ── Messages ── */}
                            <div
                                ref={scrollRef}
                                className="flex-1 overflow-y-auto px-4 py-3"
                                style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}
                            >
                                {messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center gap-2 opacity-30">
                                        <MessageCircle className="w-10 h-10 text-gray-500" />
                                        <p className="text-white/60 text-sm">No messages yet</p>
                                        <p className="text-white/30 text-xs">Be the first to say something!</p>
                                    </div>
                                ) : (
                                    messages.map((m) => (
                                        <div
                                            key={m.id}
                                            className="group flex items-baseline gap-2 py-[3px] px-2 -mx-2 rounded hover:bg-white/[0.03] transition-colors"
                                        >
                                            <span className="text-[10px] text-white/15 font-mono min-w-[38px] opacity-0 group-hover:opacity-100 transition-opacity select-none">
                                                {formatTime(m.timestamp)}
                                            </span>
                                            <span
                                                className="text-[13px] font-semibold cursor-default flex-shrink-0"
                                                style={{ color: m.color }}
                                            >
                                                {m.sender.slice(0, 12)}:
                                            </span>
                                            <span className="text-[13px] text-white/85 break-words leading-snug">
                                                {m.text}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* ── Input ── */}
                            <div className="px-4 py-3 border-t border-white/[0.06] bg-[#18181b]">
                                <div className="flex gap-2 items-center">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                                        placeholder="Send a message"
                                        maxLength={200}
                                        className="flex-1 bg-[#0e0e10] border border-white/[0.08] rounded-md px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20 transition-colors"
                                    />
                                    <button
                                        onClick={sendMessage}
                                        disabled={loading || !input.trim()}
                                        className="px-4 py-2.5 bg-white/10 hover:bg-white/15 disabled:opacity-20 disabled:cursor-not-allowed rounded-md text-white text-sm font-medium transition-colors flex items-center gap-1.5"
                                    >
                                        <Send className="w-3.5 h-3.5" />
                                        Chat
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ───── Trigger Button ───── */}
            {!isOpen && (
                <motion.button
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 1, type: "spring", stiffness: 200 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-lg bg-[#18181b] border border-white/[0.08] text-white font-medium text-sm hover:bg-[#1f1f23] transition-colors"
                >
                    <div className="relative">
                        <MessageCircle className="w-4 h-4 text-white/70" />
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
                    </div>
                    Live Chat
                </motion.button>
            )}
        </>
    );
}

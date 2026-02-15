"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import RevealCard from "./RevealCard";
import { API_URL } from "@/lib/config";
import { getSocket } from "@/lib/socket";

// ─── Emoji Reactions ───────────────────────────────────────────────────────
const QUICK_REACTIONS = [
    // Common
    "❤️", "😂", "🔥", "👍", "😭",
    // Uncommon / fun
    "💀", "🫡", "🗿", "👀", "🤌",
    "💅", "🫠", "☠️", "🥶", "😈",
];

interface ChatProps {
    roomId: string;
    userId: string;
    codename: string;
    partnerCodename: string;
    roomType?: "pair" | "group";
    participants?: string[];
    onDisconnected: (reason?: "partner_left" | "error" | null) => void;
}

interface Reaction {
    emoji: string;
    fromMe: boolean;
}

interface Message {
    id: string;
    sender: "me" | "partner" | "system";
    senderCodename?: string;
    text: string;
    timestamp: number;
    reactions: Reaction[];
}

export default function Chat({
    roomId,
    userId,
    codename,
    partnerCodename,
    roomType = "pair",
    participants: initialParticipants,
    onDisconnected,
}: ChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [partnerTyping, setPartnerTyping] = useState(false);
    const [participantList, setParticipantList] = useState<string[]>(initialParticipants || [partnerCodename]);
    const [revealState, setRevealState] = useState<
        "idle" | "i_requested" | "partner_requested" | "mutual"
    >("idle");
    const [partnerRevealData, setPartnerRevealData] = useState<Record<string, string> | null>(null);
    const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const partnerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const reactionPickerRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, partnerTyping]);

    // Close reaction picker on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
                setActiveReactionMsgId(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Stable ref for onDisconnected to avoid useEffect re-runs when parent re-renders
    const onDisconnectedRef = useRef(onDisconnected);
    useEffect(() => {
        onDisconnectedRef.current = onDisconnected;
    }, [onDisconnected]);

    // ─── Socket.io Real-Time Connection ────────────────────────────────
    useEffect(() => {
        const socket = getSocket();

        // Join the chat room
        socket.emit("join_room", { room_id: roomId, user_id: userId });

        // Listen for all message types
        const handleMessage = (msg: any) => {
            console.log("[Blind Connection] 📨 Socket Message:", msg);

            if (msg.type === "chat") {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: Math.random().toString(36).substring(2, 15),
                        sender: "partner",
                        senderCodename: msg.sender_codename || partnerCodename,
                        text: msg.text,
                        timestamp: msg.timestamp || Date.now(),
                        reactions: [],
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
            } else if (msg.type === "reaction") {
                const { message_id, emoji } = msg;
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === message_id
                            ? { ...m, reactions: [...m.reactions, { emoji, fromMe: false }] }
                            : m
                    )
                );
                spawnFloatingReaction(emoji);
            } else if (msg.type === "reveal_request") {
                setRevealState((prev) => prev === "i_requested" ? "mutual" : "partner_requested");
            } else if (msg.type === "reveal_accept") {
                setRevealState("mutual");
            } else if (msg.type === "reveal_data") {
                setPartnerRevealData(msg.fields);
            } else if (msg.type === "partner_disconnected") {
                console.log("[Blind Connection] ⚠️ Partner disconnected");
                onDisconnectedRef.current("partner_left");
            } else if (msg.type === "user_joined") {
                setParticipantList(prev => [...prev, msg.codename]);
                setMessages(prev => [...prev, {
                    id: Math.random().toString(36).substring(2, 15),
                    sender: "system",
                    text: `${msg.codename} joined the chat`,
                    timestamp: Date.now(),
                    reactions: [],
                }]);
            } else if (msg.type === "user_left") {
                setParticipantList(prev => prev.filter(p => p !== msg.codename));
                setMessages(prev => [...prev, {
                    id: Math.random().toString(36).substring(2, 15),
                    sender: "system",
                    text: `${msg.codename} left the chat`,
                    timestamp: Date.now(),
                    reactions: [],
                }]);
            }
        };

        socket.on("new_message", handleMessage);

        // Browser close / navigate away: emit leave_room so backend cleans up Redis
        const handleBeforeUnload = () => {
            socket.emit("leave_room", { room_id: roomId, user_id: userId });
        };
        window.addEventListener("beforeunload", handleBeforeUnload);

        // Cleanup: only remove the listener — do NOT leave the room here.
        // Room leaving is handled by beforeunload (browser close) or socket disconnect.
        return () => {
            socket.off("new_message", handleMessage);
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [roomId, userId]);

    const generateId = () => Math.random().toString(36).substring(2, 15);

    // Floating reaction animation
    const spawnFloatingReaction = (emoji: string) => {
        const id = generateId();
        const x = 30 + Math.random() * 40; // random x position (30-70% of screen)
        setFloatingReactions((prev) => [...prev, { id, emoji, x }]);
        setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
        }, 2000);
    };

    const sendMessage = useCallback(async () => {
        if (!input.trim()) return;
        const text = input.trim();
        setInput("");

        setMessages((prev) => [
            ...prev,
            {
                id: generateId(),
                sender: "me",
                text,
                timestamp: Date.now(),
                reactions: [],
            },
        ]);

        try {
            const socket = getSocket();
            socket.emit("send_message", { room_id: roomId, user_id: userId, text });
        } catch (err) {
            console.error("Send error:", err);
        }

        inputRef.current?.focus();
    }, [input, roomId, userId]);

    // Send reaction
    const sendReaction = async (messageId: string, emoji: string) => {
        // Optimistic update — add my reaction locally
        setMessages((prev) =>
            prev.map((m) =>
                m.id === messageId
                    ? { ...m, reactions: [...m.reactions, { emoji, fromMe: true }] }
                    : m
            )
        );

        // Floating animation
        spawnFloatingReaction(emoji);

        // Close picker
        setActiveReactionMsgId(null);

        // Send to partner via signal
        try {
            const socket = getSocket();
            socket.emit("signal", {
                room_id: roomId,
                user_id: userId,
                type: "reaction",
                payload: { message_id: messageId, emoji },
            });
        } catch (err) {
            console.error("Reaction send error:", err);
        }
    };

    // Quick emoji send (from emoji bar)
    const sendQuickEmoji = async (emoji: string) => {
        setShowEmojiPicker(false);

        setMessages((prev) => [
            ...prev,
            {
                id: generateId(),
                sender: "me",
                text: emoji,
                timestamp: Date.now(),
                reactions: [],
            },
        ]);

        try {
            const socket = getSocket();
            socket.emit("send_message", { room_id: roomId, user_id: userId, text: emoji });
        } catch (err) {
            console.error("Emoji send error:", err);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);

        if (!typingTimeoutRef.current) {
            const socket = getSocket();
            socket.emit("typing", { room_id: roomId, user_id: userId });
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

    const handleRevealRequest = () => {
        const socket = getSocket();
        if (revealState === "idle") {
            setRevealState("i_requested");
            socket.emit("signal", { room_id: roomId, user_id: userId, type: "reveal_request" });
        } else if (revealState === "partner_requested") {
            setRevealState("mutual");
            socket.emit("signal", { room_id: roomId, user_id: userId, type: "reveal_accept" });
        }
    };

    const handleSendRevealData = (fields: Record<string, string>) => {
        const socket = getSocket();
        socket.emit("signal", { room_id: roomId, user_id: userId, type: "reveal_data", payload: fields });
    };

    const formatTime = (ts: number) => {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    // Group reactions by emoji for display
    const groupReactions = (reactions: Reaction[]) => {
        const map = new Map<string, { count: number; fromMe: boolean }>();
        reactions.forEach((r) => {
            const existing = map.get(r.emoji);
            if (existing) {
                existing.count++;
                if (r.fromMe) existing.fromMe = true;
            } else {
                map.set(r.emoji, { count: 1, fromMe: r.fromMe });
            }
        });
        return Array.from(map.entries());
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex flex-col bg-[var(--bg)]"
        >
            {/* Floating Reactions Animation */}
            <AnimatePresence>
                {floatingReactions.map((fr) => (
                    <motion.div
                        key={fr.id}
                        initial={{ opacity: 1, y: 0, scale: 1 }}
                        animate={{ opacity: 0, y: -200, scale: 1.6 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.8, ease: "easeOut" }}
                        className="fixed z-50 text-3xl pointer-events-none"
                        style={{ bottom: "20%", left: `${fr.x}%` }}
                    >
                        {fr.emoji}
                    </motion.div>
                ))}
            </AnimatePresence>

            {/* Header */}
            <div className="glass-strong rounded-none border-x-0 border-t-0 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-green)] flex items-center justify-center text-xs font-bold text-black">
                        {roomType === "group" ? participantList.length : "?"}
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                            {roomType === "group" ? "Group Chat" : partnerCodename}
                        </h3>
                        <p className="text-[10px] text-[var(--accent-green)] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)] inline-block" />
                            {roomType === "group"
                                ? `${participantList.length + 1} participants`
                                : "Connected"}
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
                        🔒 {roomType === "group"
                            ? `You're in a group chat. ${participantList.length + 1} participants.`
                            : (<>You&apos;re connected with{" "}
                                <span className="text-[var(--accent-light)] font-medium">
                                    {partnerCodename}
                                </span>
                                . Messages are never stored.</>)
                        }
                    </div>
                </div>

                {messages.map((msg) => (
                    <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        className={`flex ${msg.sender === "me" ? "justify-end" : msg.sender === "system" ? "justify-center" : "justify-start"}`}
                    >
                        {msg.sender === "system" ? (
                            <div className="glass px-3 py-1 text-[10px] text-[var(--text-secondary)]">
                                {msg.text}
                            </div>
                        ) : (
                            <div className="relative group/msg max-w-[80%] sm:max-w-[65%]">
                                {/* Reaction trigger — appears on hover */}
                                <button
                                    onClick={() => setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id)}
                                    className={`absolute ${msg.sender === "me" ? "-left-8" : "-right-8"} top-1/2 -translate-y-1/2 
                    w-6 h-6 rounded-full bg-white/[0.06] border border-white/[0.08] 
                    flex items-center justify-center text-xs
                    opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200
                    hover:bg-white/[0.12] cursor-pointer z-10`}
                                >
                                    😊
                                </button>

                                {/* Message Bubble */}
                                <div
                                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed
                    ${msg.sender === "me"
                                            ? "bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] text-white rounded-br-md"
                                            : "bg-white/[0.06] border border-white/[0.08] text-[var(--text-primary)] rounded-bl-md"
                                        }`}
                                >
                                    {roomType === "group" && msg.sender === "partner" && msg.senderCodename && (
                                        <p className="text-[10px] font-semibold text-purple-300/70 mb-1">
                                            {msg.senderCodename}
                                        </p>
                                    )}
                                    <p>{msg.text}</p>
                                    <p
                                        className={`text-[10px] mt-1 ${msg.sender === "me" ? "text-white/50" : "text-[var(--text-secondary)]"
                                            }`}
                                    >
                                        {formatTime(msg.timestamp)}
                                    </p>
                                </div>

                                {/* Reaction Display */}
                                {msg.reactions.length > 0 && (
                                    <div className={`flex flex-wrap gap-1 mt-1 ${msg.sender === "me" ? "justify-end" : "justify-start"}`}>
                                        {groupReactions(msg.reactions).map(([emoji, data]) => (
                                            <motion.span
                                                key={emoji}
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs
                          ${data.fromMe
                                                        ? "bg-purple-500/20 border border-purple-500/30"
                                                        : "bg-white/[0.06] border border-white/[0.08]"
                                                    }`}
                                            >
                                                <span>{emoji}</span>
                                                {data.count > 1 && (
                                                    <span className="text-[10px] text-white/50">{data.count}</span>
                                                )}
                                            </motion.span>
                                        ))}
                                    </div>
                                )}

                                {/* Reaction Picker Popup */}
                                <AnimatePresence>
                                    {activeReactionMsgId === msg.id && (
                                        <motion.div
                                            ref={reactionPickerRef}
                                            initial={{ opacity: 0, scale: 0.8, y: 5 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.8, y: 5 }}
                                            transition={{ duration: 0.15 }}
                                            className={`absolute ${msg.sender === "me" ? "right-0" : "left-0"} -top-14 z-20
                        bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-2xl px-2 py-1.5 
                        flex items-center gap-0.5 shadow-2xl shadow-black/40`}
                                        >
                                            {QUICK_REACTIONS.map((emoji) => (
                                                <button
                                                    key={emoji}
                                                    onClick={() => sendReaction(msg.id, emoji)}
                                                    className="w-8 h-8 flex items-center justify-center text-lg rounded-lg 
                            hover:bg-white/10 hover:scale-125 transition-all duration-150 cursor-pointer"
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
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
                {/* Emoji Picker Bar (above input) */}
                <AnimatePresence>
                    {showEmojiPicker && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden mb-2 max-w-3xl mx-auto"
                        >
                            <div className="flex flex-wrap gap-1 p-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                                {QUICK_REACTIONS.map((emoji) => (
                                    <button
                                        key={emoji}
                                        onClick={() => sendQuickEmoji(emoji)}
                                        className="w-9 h-9 flex items-center justify-center text-xl rounded-lg 
                      hover:bg-white/10 hover:scale-110 transition-all duration-150 cursor-pointer"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex items-center gap-2 max-w-3xl mx-auto">
                    {/* Emoji Toggle Button */}
                    <motion.button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className={`p-3 rounded-xl transition-all duration-200 cursor-pointer shrink-0
              ${showEmojiPicker
                                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                : "bg-white/[0.05] text-[var(--text-secondary)] hover:bg-white/[0.08]"
                            }`}
                    >
                        <span className="text-lg">😊</span>
                    </motion.button>

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

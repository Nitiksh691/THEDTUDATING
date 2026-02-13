"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";

const getApiUrl = () => {
    return "https://thedtudating-xqwf.vercel.app";
};

interface WaitingRoomProps {
    interest: string;
    queueId: string;
    codename: string;
    onMatched: (roomId: string, partnerCodename: string) => void;
    onCancel: () => void;
}

export default function WaitingRoom({
    interest,
    queueId,
    codename,
    onMatched,
    onCancel,
}: WaitingRoomProps) {
    const [elapsed, setElapsed] = useState(0);
    const [totalWaiting, setTotalWaiting] = useState(0);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const statsRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        // Timer
        timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

        // Poll for match
        pollRef.current = setInterval(async () => {
            if (!queueId) return;
            try {
                const res = await fetch(`${getApiUrl()}/check-match`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ interest, queue_id: queueId }),
                });
                const data = await res.json();
                console.log("[Blind Connection] 🔄 Polling check-match:", data);
                if (data.status === "matched") {
                    console.log(`[Blind Connection] 🎉 MATCHED! Room: ${data.room_id}, Partner: ${data.partner_codename}`);
                    onMatched(data.room_id, data.partner_codename);
                } else if (data.status === "expired") {
                    console.error("[Blind Connection] ❌ Session expired (queue ID invalid).");
                    alert("Your session has expired. Please try connecting again.");
                    onCancel(); // Reset to home
                }
            } catch {
                // ignore network errors during polling
            }
        }, 2000);

        // Queue stats
        const fetchStats = async () => {
            try {
                const res = await fetch(`${getApiUrl()}/queue-stats`);
                const data = await res.json();
                setTotalWaiting(data.total_waiting);
            } catch {
                // ignore
            }
        };
        fetchStats();
        statsRef.current = setInterval(fetchStats, 3000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
            if (statsRef.current) clearInterval(statsRef.current);
        };
    }, [interest, queueId, onMatched]);

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 flex flex-col items-center justify-center p-6 z-50"
        >
            {/* Pulsing Rings */}
            <div className="relative mb-12">
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-2 border-[var(--accent)]/30 pulse-ring absolute inset-0" />
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-2 border-[var(--accent)]/20 pulse-ring-delay-1 absolute inset-0" />
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-2 border-[var(--accent)]/10 pulse-ring-delay-2 absolute inset-0" />
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-[var(--accent)]/5 border border-[var(--accent)]/20 flex items-center justify-center relative">
                    <div className="text-center">
                        <div className="text-3xl sm:text-4xl font-bold text-[var(--accent-light)] font-mono">
                            {formatTime(elapsed)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Text */}
            <motion.h2
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="text-xl sm:text-2xl font-semibold text-glow mb-3 tracking-wide"
            >
                Searching the void...
            </motion.h2>

            <p className="text-[var(--text-secondary)] text-sm mb-1">
                Looking for someone in{" "}
                <span className="text-[var(--accent-light)] font-medium">{interest}</span>
            </p>

            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-8">
                <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent-green)] animate-pulse" />
                <span>
                    {totalWaiting} {totalWaiting === 1 ? "person" : "people"} currently
                    looking
                </span>
            </div>

            {/* Your Codename */}
            <div className="glass px-5 py-3 mb-8 text-center">
                <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)] block mb-1">
                    Your Codename
                </span>
                <span className="text-[var(--accent-green)] font-semibold text-sm">
                    {codename}
                </span>
            </div>

            {/* Cancel */}
            <button
                onClick={onCancel}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer underline underline-offset-4 decoration-white/10 hover:decoration-white/30"
            >
                Leave the queue
            </button>
        </motion.div>
    );
}

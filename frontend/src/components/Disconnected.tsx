"use client";

import { motion } from "framer-motion";

interface DisconnectedProps {
    onReturnHome: () => void;
    reason?: "partner_left" | "error" | null;
}

export default function Disconnected({ onReturnHome, reason }: DisconnectedProps) {
    const isPartnerLeft = reason === "partner_left";

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 flex flex-col items-center justify-center p-6 z-50 bg-black/80 backdrop-blur-sm"
        >
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
                className="glass glow-purple max-w-sm w-full p-8 text-center border border-white/10"
            >
                {/* Icon */}
                <div className="mb-6">
                    <div className={`w-20 h-20 mx-auto rounded-full border flex items-center justify-center
            ${isPartnerLeft ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20"}`}
                    >
                        {isPartnerLeft ? (
                            <span className="text-3xl">👋</span>
                        ) : (
                            <svg
                                className="w-10 h-10 text-red-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                                />
                            </svg>
                        )}
                    </div>
                </div>

                <h2 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
                    {isPartnerLeft ? "Chat Ended" : "Connection Lost"}
                </h2>
                <p className="text-sm text-[var(--text-secondary)] mb-2 leading-relaxed">
                    {isPartnerLeft
                        ? "Your partner has left the chat."
                        : "Connection to the server was lost."}
                </p>
                <p className="text-xs text-[var(--accent)] mb-8 font-medium">
                    🔒 This session has been wiped.
                </p>

                <motion.button
                    onClick={onReturnHome}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] 
            text-white font-semibold text-sm shadow-lg shadow-purple-500/25 
            hover:shadow-purple-500/40 transition-shadow cursor-pointer"
                >
                    Return Home
                </motion.button>
            </motion.div>
        </motion.div>
    );
}

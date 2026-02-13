"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface RevealCardProps {
    partnerCodename: string;
    partnerData: Record<string, string> | null;
    onSendData: (fields: Record<string, string>) => void;
}

export default function RevealCard({
    partnerCodename,
    partnerData,
    onSendData,
}: RevealCardProps) {
    const [name, setName] = useState("");
    const [yearBranch, setYearBranch] = useState("");
    const [social, setSocial] = useState("");
    const [sent, setSent] = useState(false);

    const handleSend = () => {
        if (!name.trim()) return;
        onSendData({
            name: name.trim(),
            yearBranch: yearBranch.trim(),
            social: social.trim(),
        });
        setSent(true);
    };

    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="overflow-hidden border-b border-white/[0.06]"
        >
            <div className="px-4 sm:px-6 py-4 bg-gradient-to-b from-[var(--accent)]/5 to-transparent">
                <div className="max-w-lg mx-auto flex flex-col sm:flex-row gap-4">
                    {/* My Info Form */}
                    <div className="flex-1 glass p-4">
                        <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-[var(--accent-light)] mb-3">
                            Your Identity
                        </h4>
                        {!sent ? (
                            <div className="space-y-2.5">
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Your name"
                                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm
                    text-[var(--text-primary)] placeholder-[var(--text-secondary)]
                    focus:outline-none focus:border-[var(--accent)]/50 transition-all"
                                />
                                <input
                                    type="text"
                                    value={yearBranch}
                                    onChange={(e) => setYearBranch(e.target.value)}
                                    placeholder="Year / Branch (optional)"
                                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm
                    text-[var(--text-primary)] placeholder-[var(--text-secondary)]
                    focus:outline-none focus:border-[var(--accent)]/50 transition-all"
                                />
                                <input
                                    type="text"
                                    value={social}
                                    onChange={(e) => setSocial(e.target.value)}
                                    placeholder="Social / Phone (optional)"
                                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm
                    text-[var(--text-primary)] placeholder-[var(--text-secondary)]
                    focus:outline-none focus:border-[var(--accent)]/50 transition-all"
                                />
                                <motion.button
                                    onClick={handleSend}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    disabled={!name.trim()}
                                    className={`w-full py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer
                    ${name.trim()
                                            ? "bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] text-white"
                                            : "bg-white/[0.05] text-[var(--text-secondary)] cursor-not-allowed"
                                        }`}
                                >
                                    Share Identity ✨
                                </motion.button>
                            </div>
                        ) : (
                            <div className="text-center py-4">
                                <div className="text-2xl mb-2">✅</div>
                                <p className="text-xs text-[var(--accent-green)]">
                                    Identity shared!
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Partner Info */}
                    <div className="flex-1 glass p-4">
                        <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-[var(--accent-green)] mb-3">
                            {partnerCodename}&apos;s Identity
                        </h4>
                        {partnerData ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="space-y-3"
                            >
                                <div>
                                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                                        Name
                                    </span>
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                                        {partnerData.name}
                                    </p>
                                </div>
                                {partnerData.yearBranch && (
                                    <div>
                                        <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                                            Year / Branch
                                        </span>
                                        <p className="text-sm text-[var(--text-primary)]">
                                            {partnerData.yearBranch}
                                        </p>
                                    </div>
                                )}
                                {partnerData.social && (
                                    <div>
                                        <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                                            Social / Contact
                                        </span>
                                        <p className="text-sm text-[var(--accent-light)]">
                                            {partnerData.social}
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <div className="text-center py-6">
                                <motion.div
                                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="text-sm text-[var(--text-secondary)]"
                                >
                                    Waiting for partner to share...
                                </motion.div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

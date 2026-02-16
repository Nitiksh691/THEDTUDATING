"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type RevealPhase = "form" | "submitted" | "revealed";

interface RevealCardProps {
    partnerCodename: string;
    partnerData: Record<string, string> | null;
    partnerSubmitted: boolean;
    onSendData: (fields: Record<string, string>) => void;
    onCancel: () => void;
    onClose: () => void;
}

export default function RevealCard({
    partnerCodename,
    partnerData,
    partnerSubmitted,
    onSendData,
    onCancel,
    onClose,
}: RevealCardProps) {
    const [name, setName] = useState("");
    const [yearBranch, setYearBranch] = useState("");
    const [social, setSocial] = useState("");
    const [sent, setSent] = useState(false);

    const phase: RevealPhase = partnerData ? "revealed" : sent ? "submitted" : "form";

    const handleSend = () => {
        if (!name.trim()) return;
        onSendData({
            name: name.trim(),
            yearBranch: yearBranch.trim(),
            social: social.trim(),
        });
        setSent(true);
    };

    const handleCancel = () => {
        setSent(false);
        setName("");
        setYearBranch("");
        setSocial("");
        onCancel();
    };

    return (
        <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 340 }}
            className="absolute bottom-[68px] left-0 right-0 z-30 mx-2 sm:mx-4"
        >
            <div className="relative bg-[#0f0f1a]/95 backdrop-blur-2xl border border-white/[0.1] 
                          rounded-2xl shadow-2xl shadow-purple-900/30 overflow-hidden max-w-lg mx-auto">

                {/* Accent top line */}
                <div className="h-0.5 bg-gradient-to-r from-transparent via-purple-500 to-transparent" />

                {/* Close / Cancel button */}
                <button
                    onClick={phase === "submitted" ? handleCancel : onClose}
                    className="absolute top-2.5 right-3 z-10 w-7 h-7 rounded-full 
                             bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1]
                             flex items-center justify-center text-white/40 hover:text-white/80
                             transition-all duration-200 cursor-pointer text-xs"
                    title={phase === "submitted" ? "Cancel Reveal" : "Close"}
                >
                    ✕
                </button>

                <div className="px-4 py-3">
                    <AnimatePresence mode="wait">
                        {/* ─── PHASE: Form ─── */}
                        {phase === "form" && (
                            <motion.div
                                key="form"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-base">🔓</span>
                                    <h4 className="text-xs font-bold tracking-wider uppercase text-purple-300">
                                        Reveal Yourself
                                    </h4>
                                    {partnerSubmitted && (
                                        <span className="ml-auto text-[10px] text-green-400 font-medium bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20 animate-pulse">
                                            Partner ready ✓
                                        </span>
                                    )}
                                </div>

                                <div className="flex gap-2 mb-2.5">
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Your name *"
                                        className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm
                                                 text-white placeholder-white/25
                                                 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20
                                                 transition-all"
                                        autoFocus
                                    />
                                    <input
                                        type="text"
                                        value={yearBranch}
                                        onChange={(e) => setYearBranch(e.target.value)}
                                        placeholder="Year / Branch"
                                        className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm
                                                 text-white placeholder-white/25
                                                 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20
                                                 transition-all"
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={social}
                                        onChange={(e) => setSocial(e.target.value)}
                                        placeholder="Instagram / Phone"
                                        className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm
                                                 text-white placeholder-white/25
                                                 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20
                                                 transition-all"
                                    />
                                    <motion.button
                                        onClick={handleSend}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.97 }}
                                        disabled={!name.trim()}
                                        className={`px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap
                                                  ${name.trim()
                                                ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/20"
                                                : "bg-white/[0.05] text-white/30 cursor-not-allowed"}`}
                                    >
                                        Share ✨
                                    </motion.button>
                                </div>

                                <p className="text-[10px] text-white/25 mt-2 text-center">
                                    🔒 Both must share before either can see. No cheating!
                                </p>
                            </motion.div>
                        )}

                        {/* ─── PHASE: Submitted (waiting for partner) ─── */}
                        {phase === "submitted" && (
                            <motion.div
                                key="submitted"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="text-center py-4"
                            >
                                <motion.div
                                    animate={{ scale: [1, 1.15, 1] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                    className="text-3xl mb-2"
                                >
                                    🔐
                                </motion.div>
                                <p className="text-sm font-semibold text-purple-300 mb-1">
                                    Your identity is locked in!
                                </p>
                                <motion.p
                                    animate={{ opacity: [0.4, 0.8, 0.4] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="text-xs text-white/40"
                                >
                                    {partnerSubmitted
                                        ? "Processing... both ready!"
                                        : `Waiting for ${partnerCodename} to share theirs...`}
                                </motion.p>
                                <button
                                    onClick={handleCancel}
                                    className="mt-3 text-[10px] text-white/30 hover:text-red-400 transition-colors cursor-pointer underline underline-offset-2"
                                >
                                    Cancel & withdraw
                                </button>
                            </motion.div>
                        )}

                        {/* ─── PHASE: Revealed (both shared!) ─── */}
                        {phase === "revealed" && partnerData && (
                            <motion.div
                                key="revealed"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                            >
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-base">✨</span>
                                    <h4 className="text-xs font-bold tracking-wider uppercase text-green-400">
                                        {partnerCodename}&apos;s Identity
                                    </h4>
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    {partnerData.name && (
                                        <div className="bg-white/[0.04] rounded-xl px-3 py-2.5 border border-white/[0.06]">
                                            <span className="text-[9px] uppercase tracking-wider text-white/30 block mb-0.5">Name</span>
                                            <p className="text-sm font-semibold text-white">{partnerData.name}</p>
                                        </div>
                                    )}
                                    {partnerData.yearBranch && (
                                        <div className="bg-white/[0.04] rounded-xl px-3 py-2.5 border border-white/[0.06]">
                                            <span className="text-[9px] uppercase tracking-wider text-white/30 block mb-0.5">Year/Branch</span>
                                            <p className="text-sm text-white/90">{partnerData.yearBranch}</p>
                                        </div>
                                    )}
                                    {partnerData.social && (
                                        <div className="bg-white/[0.04] rounded-xl px-3 py-2.5 border border-white/[0.06]">
                                            <span className="text-[9px] uppercase tracking-wider text-white/30 block mb-0.5">Contact</span>
                                            <p className="text-sm text-purple-300 font-medium">{partnerData.social}</p>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={onClose}
                                    className="mt-3 w-full py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] 
                                             text-[10px] text-white/40 hover:text-white/60 transition-all cursor-pointer border border-white/[0.06]"
                                >
                                    Dismiss
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
}

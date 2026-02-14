"use client";

import { motion } from "framer-motion";

export default function Maintenance() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-[#0a0a0a]"
        >
            {/* Background glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-amber-900/10 blur-[150px]" />
                <div className="absolute bottom-[-20%] left-[-10%] w-[40%] h-[40%] rounded-full bg-orange-900/8 blur-[120px]" />
            </div>

            {/* Animated construction icon */}
            <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="relative mb-8"
            >
                <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-amber-500/5 border border-amber-500/20 flex items-center justify-center">
                    <span className="text-5xl sm:text-6xl">🔧</span>
                </div>
                {/* Pulse rings */}
                <div className="absolute inset-0 rounded-full border border-amber-500/10 animate-ping" style={{ animationDuration: "3s" }} />
            </motion.div>

            {/* Title */}
            <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="text-3xl sm:text-5xl font-black tracking-tight text-center mb-4"
            >
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-orange-200 to-amber-300">
                    We&apos;re Leveling Up
                </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="text-white/50 text-base sm:text-lg font-light text-center max-w-md mb-8 leading-relaxed"
            >
                DD DTU Dating is under maintenance. We&apos;re making things faster, smoother, and better for you.
            </motion.p>

            {/* Status card */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.7, duration: 0.5 }}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl px-6 py-5 max-w-sm w-full backdrop-blur-sm mb-8"
            >
                <div className="flex items-center gap-3 mb-3">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                    </span>
                    <span className="text-sm font-semibold text-amber-200/80">Work in Progress</span>
                </div>
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-white/40">
                        <span>⚡</span>
                        <span>Upgrading server infrastructure</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/40">
                        <span>🛡️</span>
                        <span>Improving connection stability</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/40">
                        <span>🚀</span>
                        <span>Better matching algorithm</span>
                    </div>
                </div>
            </motion.div>

            {/* CTA */}
            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 0.6 }}
                className="text-white/30 text-xs text-center"
            >
                Check back in a bit — shouldn&apos;t be long! 🤞
            </motion.p>

            {/* Contact link */}
            <motion.a
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 0.6 }}
                href="mailto:nitikshpal@gmail.com?subject=DD DTU Dating - Status Check"
                className="mt-4 text-xs text-amber-300/40 hover:text-amber-300/70 transition-colors underline underline-offset-4 decoration-amber-300/20"
            >
                Questions? Reach out
            </motion.a>
        </motion.div>
    );
}

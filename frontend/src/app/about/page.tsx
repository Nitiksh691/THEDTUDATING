"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const stagger = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.15 },
    },
};

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    show: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: "easeOut" as const },
    },
};

export default function AboutPage() {
    return (
        <main className="min-h-dvh flex flex-col items-center p-4 sm:p-8 relative overflow-hidden bg-[#0a0a0a]">
            {/* Background Orbs */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-purple-900/10 blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-rose-900/8 blur-[120px]" />
                <div className="absolute top-[40%] left-[50%] w-[40%] h-[40%] rounded-full bg-blue-900/5 blur-[100px]" />
            </div>

            {/* Back Button */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="w-full max-w-2xl z-10"
            >
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-white/40 hover:text-white text-sm transition-colors mb-8"
                >
                    ← Back to Home
                </Link>
            </motion.div>

            <motion.div
                variants={stagger}
                initial="hidden"
                animate="show"
                className="w-full max-w-2xl z-10"
            >
                {/* Header */}
                <motion.div variants={fadeUp} className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-lg mb-6">
                        <span className="text-lg">✨</span>
                        <span className="text-xs font-semibold text-white/70 tracking-wider uppercase">
                            The Vision
                        </span>
                    </div>

                    <h1 className="text-4xl sm:text-6xl font-black mb-4 tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/40">
                        About DTU Dating
                    </h1>

                    <p className="text-white/50 text-base sm:text-lg font-light tracking-wide max-w-md mx-auto leading-relaxed">
                        From a fun weekend experiment to a growing student platform.
                    </p>
                </motion.div>

                {/* The Origin Quote */}
                <motion.div
                    variants={fadeUp}
                    className="relative p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/10 backdrop-blur-xl mb-12"
                >
                    <div className="absolute -top-3 -left-1 text-5xl text-white/10 font-serif select-none">
                        &ldquo;
                    </div>
                    <p className="text-white/80 text-base sm:text-lg font-medium leading-relaxed italic pl-4">
                        This started as a spontaneous late-night project—purely for the vibes. But seeing students actually connect and have meaningful conversations changed the perspective. Now, it's about building something lasting while keeping that initial spark of fun alive.
                    </p>
                    <div className="mt-4 pl-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-purple-500/30">
                            N
                        </div>
                        <div>
                            <p className="text-sm font-bold text-white/90">The Creator</p>
                            <p className="text-xs text-white/40">DTU Dating</p>
                        </div>
                    </div>
                </motion.div>

                {/* The Future Vision */}
                <motion.div variants={fadeUp} className="mb-10">
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/30 mb-4 pl-1">
                        What's Next
                    </h2>

                    <div className="p-5 sm:p-6 rounded-2xl bg-purple-500/[0.05] border border-purple-500/10 hover:bg-purple-500/[0.08] transition-all">
                        <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Committed to Growth</h3>
                        <p className="text-white/60 text-sm leading-relaxed mb-3">
                            If the community response continues to be positive, I am fully committed to taking this project further. My goal is to continuously improve the experience, add premium features, and maintain a high standard of quality.
                        </p>
                        <p className="text-white/60 text-sm leading-relaxed">
                            This isn't just a side project anymore; it's a platform I want to make the best it can be for DTU. Your feedback and engagement directly shape what we build next.
                        </p>
                    </div>
                </motion.div>

                {/* What Makes Us Different */}
                <motion.div variants={fadeUp} className="mb-10">
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/30 mb-6 pl-1">
                        Why This Is Different
                    </h2>

                    <div className="space-y-3">
                        {[
                            {
                                emoji: "🫥",
                                title: "No Profiles, No BS",
                                desc: "No selfies, no bios, no swiping fatigue. Just pick a topic and talk.",
                            },
                            {
                                emoji: "💨",
                                title: "Ephemeral By Design",
                                desc: "Chats aren't stored. Messages vanish when you disconnect. It's like it never happened.",
                            },
                            {
                                emoji: "🎲",
                                title: "Pure Serendipity",
                                desc: "You don't choose who you talk to — the algorithm matches you based on what you want to talk about.",
                            },
                            {
                                emoji: "❤️",
                                title: "Student Focused",
                                desc: "Built by students, for students. We understand the vibe because we are part of it.",
                            },
                        ].map((item) => (
                            <div
                                key={item.title}
                                className="flex gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all group"
                            >
                                <div className="text-2xl shrink-0 group-hover:scale-110 transition-transform">
                                    {item.emoji}
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white/85 mb-0.5 group-hover:text-white transition-colors">
                                        {item.title}
                                    </h3>
                                    <p className="text-xs text-white/40 leading-relaxed font-light">
                                        {item.desc}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* CTA */}
                <motion.div variants={fadeUp} className="text-center pb-12">
                    <p className="text-white/30 text-sm mb-4 font-light">
                        Join the community. Make a connection.
                    </p>
                    <Link href="/">
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="px-8 py-4 rounded-full bg-white text-black font-bold text-base tracking-wide shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(255,255,255,0.5)] transition-all cursor-pointer"
                        >
                            Start Matching →
                        </motion.button>
                    </Link>

                    <p className="text-white/15 text-[10px] mt-8 tracking-wider">
                        Built with 💜 at DTU • {new Date().getFullYear()}
                    </p>
                </motion.div>
            </motion.div>
        </main>
    );
}

"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "@/lib/config";

interface Person {
    codename: string;
    topic: string;
    gender: string;
    waiting_seconds: number;
    nickname?: string;
}

interface PeopleBrowserProps {
    onSelectPerson: (codename: string) => void;
    onClose: () => void;
}

export default function PeopleBrowser({ onSelectPerson, onClose }: PeopleBrowserProps) {
    const [people, setPeople] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("");
    const [matchingCodename, setMatchingCodename] = useState<string | null>(null);

    const fetchPeople = async () => {
        try {
            const res = await fetch(`${API_URL}/queue/browse`);
            const data = await res.json();
            setPeople(data.people || []);
        } catch (err) {
            console.error("Failed to fetch people:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPeople();
        const interval = setInterval(fetchPeople, 5000);
        return () => clearInterval(interval);
    }, []);

    const filtered = people.filter((p) => {
        if (!filter) return false;
        return (
            p.topic.toLowerCase().includes(filter.toLowerCase()) ||
            p.codename.toLowerCase().includes(filter.toLowerCase()) ||
            (p.nickname && p.nickname.toLowerCase().includes(filter.toLowerCase()))
        );
    });

    const formatWait = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        return `${mins}m ${seconds % 60}s`;
    };

    const handleSelect = async (codename: string) => {
        setMatchingCodename(codename);
        onSelectPerson(codename);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-lg mx-auto z-10"
        >
            {/* Header */}
            <div className="flex items-center mb-6">
                <button
                    onClick={onClose}
                    className="text-white/40 hover:text-white px-2 py-1 text-sm transition-colors"
                >
                    ← Back
                </button>
                <div className="flex-1 text-center pr-10">
                    <h2 className="text-xl font-bold text-white">Find User</h2>
                    <p className="text-xs text-white/40 mt-0.5">
                        Search by name or codename
                    </p>
                </div>
            </div>

            <div className="bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden">
                {/* Search / Filter */}
                <div className="p-4 border-b border-white/[0.06]">
                    <input
                        type="text"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Enter Name or Codename..."
                        className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 
                            text-sm text-white placeholder-white/20 font-medium
                            focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10
                            transition-all"
                        autoFocus
                    />
                </div>

                {/* People List */}
                <div className="max-h-[400px] overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <motion.div
                                animate={{ opacity: [0.3, 1, 0.3] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                className="text-white/40 text-sm"
                            >
                                Loading people...
                            </motion.div>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-12 px-4">
                            <div className="text-3xl mb-3">🔍</div>
                            <p className="text-white/40 text-sm">
                                {!filter ? "Type to search for users." : "No matches found."}
                            </p>
                        </div>
                    ) : (
                        <AnimatePresence>
                            {filtered.map((person, i) => {
                                const displayName = person.nickname && person.nickname !== "Anonymous"
                                    ? person.nickname
                                    : person.codename;

                                return (
                                    <motion.button
                                        key={person.codename}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        onClick={() => handleSelect(person.codename)}
                                        disabled={matchingCodename !== null}
                                        className={`w-full flex items-center gap-4 p-4 hover:bg-white/[0.04] 
                                        transition-all border-b border-white/[0.04] last:border-b-0 text-left
                                        cursor-pointer group
                                        ${matchingCodename === person.codename ? "bg-purple-500/10" : ""}`}
                                    >
                                        {/* Avatar */}
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 
                                        flex items-center justify-center text-sm font-bold text-white shrink-0
                                        group-hover:scale-110 transition-transform shadow-lg shadow-purple-500/20">
                                            {displayName[0].toUpperCase()}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-white/90 truncate">
                                                    {displayName}
                                                </span>
                                                {displayName !== person.codename && (
                                                    <span className="text-[10px] text-white/30 truncate hidden sm:inline">
                                                        ({person.codename})
                                                    </span>
                                                )}
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/40 capitalize">
                                                    {person.gender}
                                                </span>
                                            </div>



                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-purple-300/80 font-medium bg-purple-500/10 px-1.5 py-0.5 rounded">
                                                    {person.topic}
                                                </span>
                                                <span className="text-[10px] text-white/30">
                                                    waiting {formatWait(person.waiting_seconds)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Action */}
                                        <div className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-all
                                        ${matchingCodename === person.codename
                                                ? "bg-purple-500/30 text-purple-200"
                                                : "bg-white/[0.06] text-white/40 group-hover:bg-purple-500/20 group-hover:text-purple-200"
                                            }`}>
                                            {matchingCodename === person.codename ? "Matching..." : "Chat →"}
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </AnimatePresence>
                    )}
                </div>
            </div>

            {/* Refresh hint */}
            <p className="text-center text-[10px] text-white/20 mt-3">
                Auto-refreshes every 5 seconds
            </p>
        </motion.div>
    );
}

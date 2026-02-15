"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "@/lib/config";

export default function AdminPage() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [adminKey, setAdminKey] = useState("");
    const [activeTab, setActiveTab] = useState<"notifications" | "polls">("notifications");

    // Notifications
    const [title, setTitle] = useState("");
    const [message, setMessage] = useState("");
    const [type, setType] = useState("info");
    const [activeAnnouncements, setActiveAnnouncements] = useState<any[]>([]);

    // Polls
    const [question, setQuestion] = useState("");
    const [options, setOptions] = useState<string[]>(["", ""]);
    const [pollDuration, setPollDuration] = useState(24);
    const [activePoll, setActivePoll] = useState<any>(null);

    // Auth check
    useEffect(() => {
        const storedKey = localStorage.getItem("adminKey");
        if (storedKey) {
            setAdminKey(storedKey);
            checkAuth(storedKey);
        }
    }, []);

    const checkAuth = async (key: string): Promise<boolean> => {
        try {
            const res = await fetch(`${API_URL}/admin/verify`, {
                headers: { "x-admin-key": key }
            });
            if (res.ok) {
                setIsAuthenticated(true);
                return true;
            }
        } catch (e) { }
        return false;
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const isValid = await checkAuth(adminKey);
        if (isValid) {
            localStorage.setItem("adminKey", adminKey);
            fetchData();
        } else {
            alert("Invalid Admin Key");
        }
    };

    const fetchData = async () => {
        if (activeTab === "notifications") fetchAnnouncements();
        else fetchPolls();
    };

    useEffect(() => {
        if (isAuthenticated) fetchData();
    }, [isAuthenticated, activeTab]);

    // ─── Notifications Logic ───────────────────────────────────────────────

    const fetchAnnouncements = async () => {
        try {
            const res = await fetch(`${API_URL}/notifications/active`);
            const data = await res.json();
            setActiveAnnouncements(data.announcements || []);
        } catch (err) { console.error(err); }
    };

    const createAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/notifications`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-admin-key": adminKey,
                },
                body: JSON.stringify({ title, message, type }),
            });
            if (res.ok) {
                setTitle("");
                setMessage("");
                fetchAnnouncements();
                alert("Announcement created!");
            } else {
                alert("Failed via API (Check Key)"); // Basic error handling
            }
        } catch (err) { console.error(err); }
    };

    const deactivateAnnouncement = async (id: string) => {
        if (!confirm("Deactivate?")) return;
        try {
            await fetch(`${API_URL}/notifications/${id}`, {
                method: "DELETE",
                headers: { "x-admin-key": adminKey },
            });
            fetchAnnouncements();
        } catch (err) { console.error(err); }
    };

    // ─── Polls Logic ───────────────────────────────────────────────────────

    const fetchPolls = async () => {
        try {
            const res = await fetch(`${API_URL}/polls/active`);
            const data = await res.json();
            setActivePoll(data.poll);
        } catch (err) { console.error(err); }
    };

    const handleOptionChange = (idx: number, val: string) => {
        const newOptions = [...options];
        newOptions[idx] = val;
        setOptions(newOptions);
    };

    const addOption = () => setOptions([...options, ""]);
    const removeOption = (idx: number) => setOptions(options.filter((_, i) => i !== idx));

    const createPoll = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const validOptions = options.filter(o => o.trim() !== "");
            if (validOptions.length < 2) return alert("Need at least 2 options");

            const res = await fetch(`${API_URL}/polls`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-admin-key": adminKey,
                },
                body: JSON.stringify({
                    question,
                    options: validOptions,
                    durationHours: pollDuration
                }),
            });
            if (res.ok) {
                setQuestion("");
                setOptions(["", ""]);
                fetchPolls();
                alert("Poll created!");
            } else {
                alert("Failed to create poll");
            }
        } catch (err) { console.error(err); }
    };

    const closePoll = async (id: string) => {
        if (!confirm("Close this poll?")) return;
        try {
            await fetch(`${API_URL}/polls/${id}`, {
                method: "DELETE",
                headers: { "x-admin-key": adminKey },
            });
            fetchPolls();
        } catch (err) { console.error(err); }
    };

    // ─── Render ────────────────────────────────────────────────────────────

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
                <form onSubmit={handleLogin} className="w-full max-w-md space-y-4">
                    <h1 className="text-2xl font-bold text-white text-center">Admin Access</h1>
                    <input
                        type="password"
                        value={adminKey}
                        onChange={(e) => setAdminKey(e.target.value)}
                        placeholder="Enter Admin Key"
                        className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-purple-500"
                    />
                    <button type="submit" className="w-full py-3 bg-purple-600 rounded-xl text-white font-bold hover:bg-purple-700">
                        Unlock
                    </button>
                    <div className="text-center text-white/20 text-xs">
                        If you don't know the key, you shouldn't be here.
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                        Admin Dashboard
                    </h1>
                    <button onClick={() => { localStorage.removeItem("adminKey"); setIsAuthenticated(false); }} className="text-sm text-white/40 hover:text-white">
                        Logout
                    </button>
                </div>

                <div className="flex gap-4 mb-8">
                    <button
                        onClick={() => setActiveTab("notifications")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "notifications" ? "bg-purple-600 text-white" : "bg-white/5 text-white/50 hover:text-white"}`}
                    >
                        Notifications
                    </button>
                    <button
                        onClick={() => setActiveTab("polls")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "polls" ? "bg-purple-600 text-white" : "bg-white/5 text-white/50 hover:text-white"}`}
                    >
                        Polls
                    </button>
                </div>

                {activeTab === "notifications" ? (
                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Create Form */}
                        <div className="space-y-6">
                            <h2 className="text-xl font-bold">Create Announcement</h2>
                            <form onSubmit={createAnnouncement} className="space-y-4 bg-white/5 p-6 rounded-2xl border border-white/10">
                                <div>
                                    <label className="block text-xs uppercase text-white/40 font-bold mb-1">Title</label>
                                    <input value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 bg-black/40 rounded-lg border border-white/10 outline-none focus:border-purple-500" required />
                                </div>
                                <div>
                                    <label className="block text-xs uppercase text-white/40 font-bold mb-1">Message</label>
                                    <textarea value={message} onChange={e => setMessage(e.target.value)} className="w-full p-3 bg-black/40 rounded-lg border border-white/10 outline-none focus:border-purple-500 h-24" required />
                                </div>
                                <div>
                                    <label className="block text-xs uppercase text-white/40 font-bold mb-1">Type</label>
                                    <select value={type} onChange={e => setType(e.target.value)} className="w-full p-3 bg-black/40 rounded-lg border border-white/10 outline-none focus:border-purple-500">
                                        <option value="info">Info (Blue)</option>
                                        <option value="success">Success (Green)</option>
                                        <option value="warning">Warning (Yellow)</option>
                                        <option value="tech-stack">Tech Stack (Purple)</option>
                                    </select>
                                </div>
                                <button type="submit" className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-lg font-bold transition-colors">
                                    Publish Announcement
                                </button>
                            </form>
                        </div>

                        {/* List Active */}
                        <div className="space-y-4">
                            <h2 className="text-xl font-bold">Active Announcements</h2>
                            {activeAnnouncements.length === 0 && <div className="text-white/30 italic">No active announcements</div>}
                            {activeAnnouncements.map((ann: any) => (
                                <div key={ann._id} className="p-4 bg-white/5 rounded-xl border border-white/10 flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`w-2 h-2 rounded-full ${ann.type === 'info' ? 'bg-blue-400' : ann.type === 'warning' ? 'bg-yellow-400' : 'bg-green-400'}`}></span>
                                            <h3 className="font-bold text-sm">{ann.title}</h3>
                                        </div>
                                        <p className="text-white/60 text-xs">{ann.message}</p>
                                    </div>
                                    <button onClick={() => deactivateAnnouncement(ann._id)} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-400/10 rounded">
                                        Deactivate
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Create Poll */}
                        <div className="space-y-6">
                            <h2 className="text-xl font-bold">Create Live Poll</h2>
                            <form onSubmit={createPoll} className="space-y-4 bg-white/5 p-6 rounded-2xl border border-white/10">
                                <div>
                                    <label className="block text-xs uppercase text-white/40 font-bold mb-1">Question</label>
                                    <input value={question} onChange={e => setQuestion(e.target.value)} className="w-full p-3 bg-black/40 rounded-lg border border-white/10 outline-none focus:border-purple-500" required />
                                </div>
                                <div>
                                    <label className="block text-xs uppercase text-white/40 font-bold mb-1">Options</label>
                                    <div className="space-y-2">
                                        {options.map((opt, idx) => (
                                            <div key={idx} className="flex gap-2">
                                                <input
                                                    value={opt}
                                                    onChange={e => handleOptionChange(idx, e.target.value)}
                                                    placeholder={`Option ${idx + 1}`}
                                                    className="flex-1 p-2 bg-black/40 rounded-lg border border-white/10 outline-none focus:border-purple-500 text-sm"
                                                />
                                                {options.length > 2 && (
                                                    <button type="button" onClick={() => removeOption(idx)} className="text-red-400 hover:text-red-300 px-2">×</button>
                                                )}
                                            </div>
                                        ))}
                                        <button type="button" onClick={addOption} className="text-xs text-purple-400 hover:text-purple-300 font-bold">
                                            + Add Option
                                        </button>
                                    </div>
                                </div>
                                <button type="submit" className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-lg font-bold transition-colors">
                                    Start Poll
                                </button>
                            </form>
                        </div>

                        {/* Live Poll Stats */}
                        <div className="space-y-4">
                            <h2 className="text-xl font-bold">Live Poll</h2>
                            {!activePoll ? (
                                <div className="text-white/30 italic">No active poll</div>
                            ) : (
                                <div className="p-6 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-bold text-lg">{activePoll.question}</h3>
                                        <button onClick={() => closePoll(activePoll.id)} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-400/10 rounded">
                                            Close Poll
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {activePoll.options.map((opt: any, idx: number) => {
                                            const total = activePoll.totalVotes || 1; // avoid /0
                                            const percent = Math.round((opt.votes / total) * 100);
                                            return (
                                                <div key={idx} className="space-y-1">
                                                    <div className="flex justify-between text-xs text-white/70">
                                                        <span>{opt.text}</span>
                                                        <span>{opt.votes} votes ({percent}%)</span>
                                                    </div>
                                                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                                        <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${percent}%` }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div className="text-right text-xs text-white/30 pt-2">
                                            Total Votes: {activePoll.totalVotes}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import WaitingRoom from "@/components/WaitingRoom";
import Chat from "@/components/Chat";
import Disconnected from "@/components/Disconnected";
import Maintenance from "@/components/Maintenance";

const getApiUrl = () => {
  return "https://thedtudating.onrender.com";
};

const SUGGESTIONS = [
  { label: "Deep Talk", emoji: "🧠" },
  { label: "Anime", emoji: "⛩️" },
  { label: "Gaming", emoji: "🎮" },
  { label: "Movies", emoji: "🎬" },
  { label: "Music", emoji: "🎵" },
  { label: "Relationship Advice", emoji: "💔" },
  { label: "Study Partner", emoji: "📚" },
  { label: "Vent", emoji: "🗣️" },
];

type AppPhase = "hero" | "matching" | "waiting" | "chat" | "disconnected";

type Stats = {
  total_online: number;
  waiting_count: number;
  active_chat_users: number;
  top_topics: { topic: string; count: number }[];
};

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>("hero");
  const [topicInput, setTopicInput] = useState("");
  const [myGender, setMyGender] = useState("male");
  const [preference, setPreference] = useState("any");
  const [roomId, setRoomId] = useState("");
  const [codename, setCodename] = useState("");
  const [partnerCodename, setPartnerCodename] = useState("");
  const [queueId, setQueueId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [disconnectReason, setDisconnectReason] = useState<"partner_left" | "error" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverDown, setServerDown] = useState(false);
  const failCountRef = useRef(0);

  // Poll for stats + server health check
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/queue-stats`);
        if (!res.ok) throw new Error("Server error");
        const data = await res.json();
        setStats(data);
        failCountRef.current = 0;
        setServerDown(false);
      } catch (err) {
        console.error("Failed to fetch stats", err);
        failCountRef.current += 1;
        // Mark server as down after 3 consecutive failures
        if (failCountRef.current >= 3) {
          setServerDown(true);
        }
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleEnter = async (topicToUse?: string) => {
    // Guard against double-submit
    if (isSubmitting) return;
    setIsSubmitting(true);

    const topic = (topicToUse || topicInput).trim();
    setTopicInput(topic);
    setErrorMsg("");
    console.log("[DD Dating] 🔍 Searching for topic:", topic, myGender, preference);
    try {
      const res = await fetch(`${getApiUrl()}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interest: topic,
          gender: myGender,
          preference: preference
        }),
      });
      const data = await res.json();
      console.log("[DD Dating] 📡 Server response:", data);

      if (data.status === "matched") {
        console.log(`[DD Dating] ✅ Matched! Room: ${data.room_id}, Partner: ${data.partner_codename}`);
        setRoomId(data.room_id);
        setCodename(data.codename);
        setPartnerCodename(data.partner_codename);
        setPhase("chat");
      } else if (data.status === "error") {
        setErrorMsg("Please enter a valid topic.");
        setIsSubmitting(false);
      } else {
        console.log(`[DD Dating] ⏳ Waiting in queue. Codename: ${data.codename}, QueueID: ${data.queue_id}`);
        setCodename(data.codename);
        setQueueId(data.queue_id);
        setPhase("waiting");
      }
    } catch {
      setErrorMsg("Failed to connect to server. Is the backend running?");
      setIsSubmitting(false);
    }
  };

  const handleMatched = (roomId: string, partnerCodename: string) => {
    setRoomId(roomId);
    setPartnerCodename(partnerCodename);
    setPhase("chat");
  };

  const handleDisconnected = (reason?: "partner_left" | "error" | null) => {
    setDisconnectReason(reason || null);
    setPhase("disconnected");
  };

  const handleReturnHome = () => {
    setPhase("hero");
    setTopicInput("");
    setRoomId("");
    setCodename("");
    setPartnerCodename("");
    setQueueId("");
    setErrorMsg("");
    setDisconnectReason(null);
    setIsSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEnter();
    }
  };

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-4 relative overflow-hidden bg-[#0a0a0a]">
      {/* Server Down Overlay */}
      <AnimatePresence>
        {serverDown && <Maintenance />}
      </AnimatePresence>
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-rose-900/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-900/10 blur-[120px]" />
      </div>

      {/* Suggestion Box - Top Right Fixed */}
      {(phase === "hero" || phase === "matching") && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-4 right-4 z-50"
        >
          <a
            href="mailto:nitikshpal@gmail.com?subject=Idea for DD DTU Dating"
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 hover:bg-white/20 transition-all backdrop-blur-md group shadow-lg shadow-black/20"
          >
            <span className="text-lg">💡</span>
            <span className="text-xs font-semibold text-white/80 group-hover:text-white hidden sm:inline-block">
              Have an idea?
            </span>
          </a>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {phase === "hero" && (
          <motion.div
            key="hero"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg mx-auto z-10 text-center"
          >
            {/* Live User Badge */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-lg">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-sm font-medium text-white/90 tracking-wide">
                  {stats ? `${stats.total_online} Students Online` : "Connecting..."}
                </span>
              </div>
            </div>

            <h1 className="text-5xl sm:text-7xl font-black mb-6 tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/50 drop-shadow-sm">
              DD DTU Dating
            </h1>

            <p className="text-white/60 text-lg sm:text-xl font-light tracking-wide max-w-sm mx-auto mb-8 leading-relaxed">
              The anonymous social network for students. Connect, vent, and vibe without judgment.
            </p>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-8 max-w-sm mx-auto text-left">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-xl">🔒</span>
                <div>
                  <h3 className="text-white font-bold text-sm">Privacy First</h3>
                  <p className="text-white/50 text-xs">We don't store chats, IPs, or personal data. Everything is ephemeral.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-xl">⚡</span>
                <div>
                  <h3 className="text-white font-bold text-sm">Instant Connections</h3>
                  <p className="text-white/50 text-xs">Matching based on topics and interests in milliseconds.</p>
                </div>
              </div>
            </div>

            <motion.button
              onClick={() => setPhase("matching")}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 rounded-full bg-white text-black font-bold text-lg tracking-wide shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(255,255,255,0.5)] transition-all"
            >
              Start Matching →
            </motion.button>

            <div className="mt-8 text-center opacity-40 mb-8">
              <p className="text-[10px] uppercase tracking-widest text-white/60">
                {stats?.waiting_count ?? "-"} Waiting • {stats?.active_chat_users ?? "-"} Chatting
              </p>
            </div>
          </motion.div>
        )}

        {phase === "matching" && (
          <motion.div
            key="matching"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-lg mx-auto z-10"
          >
            <div className="flex items-center mb-6">
              <button
                onClick={() => setPhase("hero")}
                className="text-white/40 hover:text-white px-2 py-1 text-sm transition-colors"
              >
                ← Back
              </button>
              <div className="flex-1 text-center pr-10">
                <h2 className="text-xl font-bold text-white">Match Preferences</h2>
              </div>
            </div>

            <div className="glass glow-purple p-1 bg-gradient-to-b from-white/10 to-white/5 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl">
              <div className="bg-[#0f0f0f]/90 rounded-xl p-6 sm:p-8 space-y-6">

                {/* Gender Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">I am</label>
                    <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                      {["Male", "Female", "Other"].map((g) => (
                        <button
                          key={g}
                          onClick={() => setMyGender(g.toLowerCase())}
                          className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${myGender === g.toLowerCase()
                            ? "bg-white/20 text-white shadow-sm"
                            : "text-white/40 hover:text-white/70"
                            }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Looking for</label>
                    <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                      {["Male", "Female", "Any"].map((g) => (
                        <button
                          key={g}
                          onClick={() => setPreference(g.toLowerCase())}
                          className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${preference === g.toLowerCase()
                            ? "bg-white/20 text-white shadow-sm"
                            : "text-white/40 hover:text-white/70"
                            }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Topic Input */}
                <div className="relative">
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2 ml-1">
                    Topic (Optional)
                  </label>
                  <input
                    type="text"
                    value={topicInput}
                    onChange={(e) => {
                      setTopicInput(e.target.value);
                      setErrorMsg("");
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="e.g. Chill, Vent, Movies..."
                    className="w-full px-5 py-4 rounded-xl text-left transition-all duration-300  
                        bg-black/40 border border-white/10 hover:border-white/20
                        focus:outline-none focus:border-rose-500/50 focus:ring-4 focus:ring-rose-500/10
                        text-base sm:text-lg text-white placeholder-white/20 font-medium"
                    autoFocus
                  />
                </div>

                {/* Trending Topics (Dynamic) */}
                {stats && stats.top_topics.length > 0 && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-white/30">Trending Now</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {stats.top_topics.map((t) => (
                        <button
                          key={t.topic}
                          onClick={() => handleEnter(t.topic)}
                          className="group relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all cursor-pointer"
                        >
                          <span className="text-xs text-white/70 font-medium group-hover:text-white">{t.topic}</span>
                          <span className="text-[10px] font-bold text-rose-300 group-hover:text-rose-200">
                            {t.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Suggestions (Static) */}
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-white/30">Quick Picks</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => handleEnter(s.label)}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all cursor-pointer text-xs text-white/60 hover:text-white"
                      >
                        {s.emoji} {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error Message */}
                <AnimatePresence>
                  {errorMsg && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-rose-400 text-xs font-medium pl-1"
                    >
                      ⚠️ {errorMsg}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* CTA Button */}
                <motion.button
                  onClick={() => handleEnter()}
                  disabled={isSubmitting}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full py-4 rounded-xl font-bold text-base tracking-wide bg-gradient-to-r from-rose-600 to-orange-600 text-white shadow-rose-900/20 hover:shadow-rose-900/40 hover:brightness-110 transition-all duration-300 cursor-pointer shadow-lg ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? "Searching..." : (topicInput ? `Find ${topicInput} Partners` : "Surprise Me (Any Topic) →")}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {phase === "waiting" && (
          <WaitingRoom
            key="waiting"
            interest={topicInput}
            queueId={queueId}
            codename={codename}
            gender={myGender}
            preference={preference}
            onMatched={handleMatched}
            onCancel={handleReturnHome}
          />
        )}

        {phase === "chat" && (
          <Chat
            key="chat"
            roomId={roomId}
            codename={codename}
            partnerCodename={partnerCodename}
            onDisconnected={handleDisconnected}
          />
        )}

        {phase === "disconnected" && (
          <Disconnected
            key="disconnected"
            onReturnHome={handleReturnHome}
            reason={disconnectReason}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

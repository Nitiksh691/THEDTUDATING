"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import WaitingRoom from "@/components/WaitingRoom";
import Chat from "@/components/Chat";
import Disconnected from "@/components/Disconnected";
import Maintenance from "@/components/Maintenance";
import Link from "next/link";
import { API_URL } from "@/lib/config";

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
  const [nickname, setNickname] = useState("");
  const [roomId, setRoomId] = useState("");
  const [userId, setUserId] = useState("");
  const [codename, setCodename] = useState("");
  const [partnerCodename, setPartnerCodename] = useState("");
  const [queueId, setQueueId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [disconnectReason, setDisconnectReason] = useState<"partner_left" | "error" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverDown, setServerDown] = useState(false);
  const [roomType, setRoomType] = useState<"pair" | "group">("pair");
  const [participants, setParticipants] = useState<string[]>([]);
  const [shareCopied, setShareCopied] = useState(false);
  const failCountRef = useRef(0);

  const handleShare = async () => {
    const shareText = "yo check this out 😂 anonymous chatting for DTU students, just pick a topic and you get matched with someone random. lowkey fun ngl 👀\n\nhttps://dtudating.live";
    try {
      if (navigator.share) {
        await navigator.share({ title: "DTU Dating", text: shareText, url: "https://dtudating.live" });
      } else {
        await navigator.clipboard.writeText(shareText);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(shareText);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      } catch { /* ignore */ }
    }
  };

  // Poll for stats + server health check
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/queue-stats`);
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
      const res = await fetch(`${API_URL}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interest: topic,
          gender: myGender,
          preference: preference,
          nickname: nickname.trim(),
        }),
      });
      const data = await res.json();
      console.log("[DD Dating] 📡 Server response:", data);

      if (data.status === "matched") {
        console.log(`[DD Dating] ✅ Matched! Room: ${data.room_id}, Partner: ${data.partner_codename}`);
        setRoomId(data.room_id);
        setUserId(data.user_id);
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

  const handleMatched = (roomId: string, partnerCodename: string, matchedUserId?: string) => {
    setRoomId(roomId);
    if (matchedUserId) setUserId(matchedUserId);
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
    setUserId("");
    setCodename("");
    setPartnerCodename("");
    setQueueId("");
    setErrorMsg("");
    setDisconnectReason(null);
    setIsSubmitting(false);
    setRoomType("pair");
    setParticipants([]);
    setNickname("");
  };



  // Group chat handler
  const handleGroupMatch = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const topic = topicInput.trim() || "random";
    try {
      const res = await fetch(`${API_URL}/match-group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interest: topic,
          gender: myGender,
          preference: preference,
          nickname: nickname.trim(),
        }),
      });
      const data = await res.json();
      if (data.status === "joined" || data.status === "created") {
        setRoomId(data.room_id);
        setUserId(data.user_id);
        setCodename(data.codename);
        setPartnerCodename(data.status === "joined" ? "Group" : "Waiting for others...");
        setRoomType("group");
        setParticipants(data.participants || []);
        setPhase("chat");
      }
    } catch {
      setErrorMsg("Failed to join group chat.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick re-match from disconnect screen
  const handleFindNew = () => {
    setRoomId("");
    setUserId("");
    setPartnerCodename("");
    setDisconnectReason(null);
    setRoomType("pair");
    setParticipants([]);
    setPhase("matching");
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

      {/* Top Navigation */}
      {(phase === "hero" || phase === "matching") && (
        <>
          {/* Suggestion Box - Top Left */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed top-4 left-4 z-50"
          >
            <a
              href="mailto:nitikshpal@gmail.com?subject=Idea for DTU Dating"
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all backdrop-blur-md group shadow-lg shadow-black/20"
            >
              <span className="text-lg">💡</span>
              <span className="text-xs font-semibold text-white/80 group-hover:text-white hidden sm:inline-block">
                Have an idea?
              </span>
            </a>
          </motion.div>

          {/* Share Button - Top Right */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed top-4 right-4 z-50"
          >
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all backdrop-blur-md group cursor-pointer shadow-lg shadow-black/20"
            >
              <span className="text-base">{shareCopied ? "✅" : "🔗"}</span>
              <span className="text-xs font-semibold text-white/70 group-hover:text-white hidden sm:inline-block">
                {shareCopied ? "Copied!" : "Share"}
              </span>
            </button>
          </motion.div>
        </>
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
              DTU Dating
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

            {/* Stats */}
            <div className="mt-6 text-center">
              <p className="text-[10px] uppercase tracking-widest text-white/40">
                {stats?.waiting_count ?? "-"} Waiting • {stats?.active_chat_users ?? "-"} Chatting
              </p>
            </div>



            {/* Connect Section */}
            <div className="mt-8 flex flex-col items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                Connect with me
              </span>
              <div className="flex gap-3">
                <a
                  href="https://www.instagram.com/nitiksh_das?igsh=ZmRhZXcycDJhYXlo&utm_source=qr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-gradient-to-tr hover:from-purple-500/20 hover:to-orange-500/20 hover:border-white/20 transition-all group"
                  title="Instagram"
                >
                  <svg className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </a>
                <a
                  href="https://www.linkedin.com/in/nitiksh-pal-924275274?utm_source=share_via&utm_content=profile&utm_medium=member_ios"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-[#0077b5]/20 hover:border-[#0077b5]/40 transition-all group"
                  title="LinkedIn"
                >
                  <svg className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5h-5v16h5v-16zm7.982 0h-4.968v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0v8.399h4.988v-10.131c0-7.88-8.922-7.593-11.018-3.714v-2.155z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* About Us Link */}
            <div className="text-center mt-8">
              <Link
                href="/about"
                className="text-white/30 hover:text-white/60 text-xs font-medium tracking-wide transition-colors underline underline-offset-4 decoration-white/10 hover:decoration-white/30"
              >
                About this project ✨
              </Link>
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

                {/* Identity Inputs */}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2 ml-1">
                      Nickname (Optional)
                    </label>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="Display Name"
                      className="w-full px-4 py-3 rounded-xl text-left transition-all duration-300  
                        bg-black/40 border border-white/10 hover:border-white/20
                        focus:outline-none focus:border-rose-500/50 focus:ring-4 focus:ring-rose-500/10
                        text-sm text-white placeholder-white/20 font-medium"
                    />
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

                {/* Group Chat Button */}
                <motion.button
                  onClick={handleGroupMatch}
                  disabled={isSubmitting}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-all cursor-pointer"
                >
                  👥 Group Chat
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
            userId={userId || queueId}
            codename={codename}
            partnerCodename={partnerCodename}
            roomType={roomType}
            participants={participants}
            onDisconnected={handleDisconnected}
          />
        )}

        {phase === "disconnected" && (
          <Disconnected
            key="disconnected"
            onReturnHome={handleReturnHome}
            onFindNew={handleFindNew}
            reason={disconnectReason}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

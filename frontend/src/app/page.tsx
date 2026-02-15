"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import WaitingRoom from "@/components/WaitingRoom";
import Chat from "@/components/Chat";
import GlobalChat from "@/components/GlobalChat";
import Disconnected from "@/components/Disconnected";
import Maintenance from "@/components/Maintenance";
import Link from "next/link";
import { API_URL } from "@/lib/config";

const SUGGESTIONS = [
  { label: "Deep Talk", emoji: "🧠" },
  { label: "Relationship Advice", emoji: "💔" },
  { label: "Study Partner", emoji: "📚" },
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
  /* ─── Notifications & Polls ─── */
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>([]);
  const [poll, setPoll] = useState<any>(null);
  const [votedOption, setVotedOption] = useState<number | null>(null);
  const [isPollMinimized, setIsPollMinimized] = useState(false);
  const failCountRef = useRef(0);

  // Load dismissed notifications from LocalStorage
  useEffect(() => {
    const stored = localStorage.getItem("dismissed_announcements");
    if (stored) setDismissedAnnouncements(JSON.parse(stored));
  }, []);

  const dismissAnnouncement = (id: string) => {
    const updated = [...dismissedAnnouncements, id];
    setDismissedAnnouncements(updated);
    localStorage.setItem("dismissed_announcements", JSON.stringify(updated));
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

  useEffect(() => {
    // Fetch Notifications
    fetch(`${API_URL}/notifications/active`)
      .then(res => res.json())
      .then(data => setAnnouncements(data.announcements || []))
      .catch(err => console.error("Failed to fetch notifications", err));

    // Fetch Poll
    fetch(`${API_URL}/polls/active`)
      .then(res => res.json())
      .then(data => {
        if (data.poll) {
          setPoll(data.poll);
          if (data.poll.userVoted) setVotedOption(-1); // Mark as voted
        }
      })
      .catch(err => console.error("Failed to fetch poll", err));
  }, []);

  const handleVote = async (optionIndex: number) => {
    if (!poll || votedOption !== null) return;

    // Optimistic update
    const newPoll = { ...poll };
    newPoll.options[optionIndex].votes++;
    newPoll.totalVotes++;
    newPoll.userVoted = true;
    setPoll(newPoll);
    setVotedOption(optionIndex);
    setIsPollMinimized(true); // Auto-hide after voting

    try {
      await fetch(`${API_URL}/polls/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollId: poll.id, optionIndex })
      });
    } catch (err) {
      console.error("Vote failed", err);
    }
  };

  const handleEnter = async (topicToUse?: string) => {
    // Guard against double-submit
    if (isSubmitting) return;
    setIsSubmitting(true);

    const topic = (topicToUse || topicInput).trim();
    setTopicInput(topic);
    setErrorMsg("");

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


      if (data.status === "matched") {

        setRoomId(data.room_id);
        setUserId(data.user_id);
        setCodename(data.codename);
        setPartnerCodename(data.partner_codename);
        setPhase("chat");
      } else if (data.status === "error") {
        setErrorMsg("Please enter a valid topic.");
        setIsSubmitting(false);
      } else {

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

  /* ─── UI Components ─── */

  const AnnouncementBanner = () => {
    const visibleAnnouncements = announcements.filter(a => !dismissedAnnouncements.includes(a._id));
    if (visibleAnnouncements.length === 0) return null;

    return (
      <div className="fixed top-4 right-4 z-50 w-80 space-y-2 pointer-events-auto">
        <AnimatePresence>
          {visibleAnnouncements.map((ann) => (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              key={ann._id}
              className={`relative p-3 rounded-xl border shadow-2xl backdrop-blur-md overflow-hidden group
                ${ann.type === 'warning' ? 'bg-yellow-900/80 border-yellow-500/30 text-yellow-100' :
                  ann.type === 'success' ? 'bg-green-900/80 border-green-500/30 text-green-100' :
                    ann.type === 'tech-stack' ? 'bg-purple-900/80 border-purple-500/30 text-purple-100' :
                      'bg-slate-900/80 border-blue-500/30 text-blue-100'}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">
                  {ann.type === 'warning' ? '⚠️' : ann.type === 'success' ? '✅' : ann.type === 'tech-stack' ? '🛠️' : '📢'}
                </span>
                <div className="flex-1 pr-4">
                  <h3 className="font-bold text-sm mb-1">{ann.title}</h3>
                  <p className="text-xs opacity-90 leading-relaxed font-light">{ann.message}</p>
                </div>
                <button
                  onClick={() => dismissAnnouncement(ann._id)}
                  className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/10 opacity-50 hover:opacity-100 transition-all text-xs"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  };

  const PollWidget = () => {
    if (!poll) return null;

    if (isPollMinimized) {
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
          <button
            onClick={() => setIsPollMinimized(false)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-xs font-bold text-white/60 hover:text-white"
          >
            📊 Show Poll
          </button>
        </motion.div>
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg mt-8 p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm relative"
      >
        <button
          onClick={() => setIsPollMinimized(true)}
          className="absolute top-4 right-4 text-white/20 hover:text-white transition-colors text-lg leading-none"
          title="Minimize Poll"
        >
          –
        </button>

        <div className="flex justify-between items-center mb-3 pr-8">
          <h3 className="text-sm font-bold text-white/90">📊 Live Poll: {poll.question}</h3>
        </div>

        <div className="space-y-2">
          {poll.options.map((opt: any, idx: number) => {
            const percent = poll.totalVotes ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
            const isWinner = Math.max(...poll.options.map((o: any) => o.votes)) === opt.votes && poll.totalVotes > 0;

            return (
              <button
                key={idx}
                onClick={() => handleVote(idx)}
                disabled={votedOption !== null}
                className="relative w-full text-left group"
              >
                {/* Progress Bar Background */}
                <div className="absolute inset-0 bg-white/5 rounded-lg overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className={`h-full opacity-20 ${isWinner ? 'bg-green-400' : 'bg-white'}`}
                  />
                </div>

                {/* Content */}
                <div className={`relative px-3 py-2 flex justify-between items-center text-xs font-medium transition-colors
                    ${votedOption === idx ? 'text-green-300' : 'text-white/70 group-hover:text-white'}
                `}>
                  <span>{opt.text} {votedOption === idx && "✓"}</span>
                  <span>{percent}% ({opt.votes})</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-right text-[10px] text-white/30">
          Total votes: {poll.totalVotes}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-[#050505] relative overflow-hidden font-sans selection:bg-rose-500/30">

      {/* ─── Background Effects ─── */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/10 blur-[120px] rounded-full mix-blend-screen animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-rose-900/10 blur-[120px] rounded-full mix-blend-screen animate-pulse-slow delay-1000" />
        <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] bg-blue-900/10 blur-[100px] rounded-full mix-blend-screen animate-pulse-slow delay-2000" />
      </div>

      {/* ─── Spotlight Effect ─── */}


      {/* ─── Maintenance Mode ─── */}
      {serverDown ? (
        <Maintenance />
      ) : (
        <main className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4">

          {/* Notifications Banner */}
          {phase !== "chat" && <AnnouncementBanner />}

          <AnimatePresence mode="wait">
            {phase === "hero" && (
              <motion.div
                key="hero"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="w-full max-w-lg mx-auto text-center"
              >

                {/* ─── Brand Logo/Title ─── */}
                <div className="mb-8 relative inline-block group">
                  <h1 className="relative text-5xl sm:text-7xl font-bold tracking-tight text-white mb-2">
                    DD Dating
                  </h1>
                  <div className="flex items-center justify-center gap-2 text-white/40 text-sm font-medium tracking-widest uppercase">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span>{stats ? stats.total_online : "..."} Online Now</span>
                  </div>
                </div>

                {/* ─── Main Description ─── */}
                <p className="text-lg sm:text-xl text-white/60 mb-10 max-w-md mx-auto leading-relaxed font-light">
                  Experience the thrill of <span className="text-white font-medium">blind conversations</span>.
                  Connect instantly, reveal gradually. No profiles, just vibes.
                </p>

                {/* ─── Connect Button ─── */}
                <button
                  onClick={() => setPhase("matching")}
                  className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-200 bg-white/5 font-lg rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/20 hover:bg-white/10 border border-white/10 overflow-hidden"
                >
                  <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                  <span className="mr-2 text-xl">Start Matching →</span>
                </button>

                {/* ─── Poll Widget ─── */}
                <div className="mt-8 flex justify-center">
                  <PollWidget />
                </div>

                {/* ─── Social Links ─── */}
                <div className="mt-12 flex flex-col items-center gap-2">
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
                      <span className="text-white/60 group-hover:text-white transition-colors">📸</span>
                    </a>
                    <a
                      href="https://www.linkedin.com/in/nitiksh-pal-924275274?utm_source=share_via&utm_content=profile&utm_medium=member_ios"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-[#0077b5]/20 hover:border-[#0077b5]/40 transition-all group"
                      title="LinkedIn"
                    >
                      <span className="text-white/60 group-hover:text-white transition-colors">💼</span>
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
          <GlobalChat />
        </main>
      )}
    </div>
  );
}

import express from "express";
import cors from "cors";
import http from "http";
import { env } from "./config/env";
import { initSocket } from "./socket";

// ─── Route Imports ─────────────────────────────────────────────────────────
import matchRoutes from "./routes/match.routes";
import queueRoutes from "./routes/queue.routes";
import chatRoutes from "./routes/chat.routes";
import groupRoutes from "./routes/group.routes";
import globalChatRoutes from "./routes/global-chat.routes";
import adminRoutes from "./routes/admin.routes";

// ─── App Setup ─────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Middleware
app.use(cors({ origin: env.CORS_ORIGINS === "*" ? true : env.CORS_ORIGINS.split(",") }));
app.use(express.json({ limit: "1mb" }));

// Security headers
app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    next();
});

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", uptime: process.uptime() }));

// ─── Dashboard (GET /) ────────────────────────────────────────────────────

app.get("/", (_req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>DD Dating Server Status</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');
            body { font-family: 'Inter', sans-serif; background-color: #050505; color: #e5e5e5; }
            .glass { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.05); }
            .pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        </style>
    </head>
    <body class="min-h-screen p-6 flex flex-col items-center justify-center relative overflow-hidden">
        <div class="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-900/20 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-900/20 rounded-full blur-3xl pointer-events-none"></div>

        <div class="max-w-4xl w-full space-y-8 z-10">
            <div class="text-center space-y-2">
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full glass border-green-500/30 text-green-400 text-xs font-semibold tracking-wider uppercase mb-2">
                    <span class="w-2 h-2 rounded-full bg-green-500 pulse"></span>
                    System Operational — Node.js
                </div>
                <h1 class="text-5xl font-black tracking-tight text-white">
                    DD Server <span class="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">Live Monitor</span>
                </h1>
                <p class="text-white/40">Real-time metrics from the matching engine</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="glass p-6 rounded-2xl">
                    <h3 class="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Total Online</h3>
                    <div class="flex items-end gap-2">
                        <span id="total-online" class="text-4xl font-bold text-white">--</span>
                        <span class="text-green-500 text-sm mb-1">● active</span>
                    </div>
                </div>
                <div class="glass p-6 rounded-2xl">
                    <h3 class="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Waiting in Queue</h3>
                    <div class="flex items-end gap-2">
                        <span id="waiting-count" class="text-4xl font-bold text-blue-400">--</span>
                        <span class="text-blue-500/50 text-sm mb-1">users</span>
                    </div>
                </div>
                <div class="glass p-6 rounded-2xl">
                    <h3 class="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Active Chats</h3>
                    <div class="flex items-end gap-2">
                        <span id="active-chats" class="text-4xl font-bold text-pink-400">--</span>
                        <span class="text-pink-500/50 text-sm mb-1">pairs</span>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="glass p-6 rounded-2xl h-80 overflow-hidden flex flex-col">
                    <h3 class="text-white/90 font-bold mb-4 flex items-center gap-2">🔥 Trending Topics</h3>
                    <div id="topics-list" class="space-y-3 overflow-y-auto pr-2 flex-1">
                        <div class="text-white/20 text-sm italic">Loading topics...</div>
                    </div>
                </div>
                <div class="glass p-6 rounded-2xl h-80 relative overflow-hidden">
                    <h3 class="text-white/90 font-bold mb-4">📊 Live Activity</h3>
                    <canvas id="activityChart"></canvas>
                </div>
            </div>

            <div class="text-center">
                <a href="/docs" class="text-white/20 hover:text-white/50 text-xs transition-colors underline decoration-white/10 underline-offset-4">API Documentation</a>
            </div>
        </div>

        <script>
            const ctx = document.getElementById('activityChart').getContext('2d');
            const activityChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Total Users',
                        data: [],
                        borderColor: '#a78bfa',
                        backgroundColor: 'rgba(167, 139, 250, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                        x: { display: false }
                    },
                    animation: { duration: 0 }
                }
            });

            async function fetchStats() {
                try {
                    const res = await fetch('/queue-stats');
                    const data = await res.json();

                    document.getElementById('total-online').innerText = data.total_online;
                    document.getElementById('waiting-count').innerText = data.waiting_count;
                    document.getElementById('active-chats').innerText = Math.floor(data.active_chat_users / 2);

                    const topicsContainer = document.getElementById('topics-list');
                    if (data.top_topics.length > 0) {
                        topicsContainer.innerHTML = data.top_topics.map(t =>
                            '<div class="flex items-center justify-between group">' +
                            '<span class="text-white/70 text-sm group-hover:text-white transition-colors">' + t.topic + '</span>' +
                            '<span class="bg-white/10 px-2 py-0.5 rounded text-xs text-white/50 font-mono group-hover:bg-white/20 transition-colors">' + t.count + '</span>' +
                            '</div>'
                        ).join('');
                    } else {
                        topicsContainer.innerHTML = '<div class="text-white/20 text-sm italic">No active topics yet</div>';
                    }

                    const now = new Date().toLocaleTimeString();
                    if (activityChart.data.labels.length > 20) {
                        activityChart.data.labels.shift();
                        activityChart.data.datasets[0].data.shift();
                    }
                    activityChart.data.labels.push(now);
                    activityChart.data.datasets[0].data.push(data.total_online);
                    activityChart.update();
                } catch (err) {
                    console.error("Failed to fetch stats");
                }
            }

            fetchStats();
            setInterval(fetchStats, 3000);
        </script>
    </body>
    </html>
  `);
});

// ─── Mount Routes ──────────────────────────────────────────────────────────

app.use(matchRoutes);
app.use(queueRoutes);
app.use(chatRoutes);
app.use(groupRoutes);
app.use(globalChatRoutes);
app.use(adminRoutes);

// ─── Start Server ──────────────────────────────────────────────────────────

server.listen(env.PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║  DD Backend (Node.js) is running! 🚀     ║
  ║  Port: ${env.PORT}                            ║
  ║  Dashboard: http://localhost:${env.PORT}       ║
  ╚══════════════════════════════════════════╝
  `);
});

// ─── Graceful Shutdown ─────────────────────────────────────────────────────

function gracefulShutdown(signal: string) {
    console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);
    server.close(() => {
        console.log("✅ HTTP server closed.");
        process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => {
        console.error("⚠️ Forced shutdown after timeout.");
        process.exit(1);
    }, 10000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

export { app, server };

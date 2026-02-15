import { Router, Request, Response } from "express";
import Poll from "../models/Poll";
import { adminAuth } from "../middleware/adminAuth";
import { validateBody } from "../middleware/validate";

const router = Router();

// ─── Public Routes ─────────────────────────────────────────────────────────

// GET /polls/active
// Returns the most recent active poll with vote counts
router.get("/active", async (req: Request, res: Response) => {
    try {
        // Find most recent active poll
        const poll = await Poll.findOne({ active: true }).sort({ createdAt: -1 });
        if (!poll) {
            res.json({ poll: null });
            return;
        }

        // Check availability (expiresAt)
        if (poll.expiresAt && new Date() > poll.expiresAt) {
            poll.active = false;
            await poll.save();
            res.json({ poll: null });
            return;
        }

        const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
        const userVoted = poll.votedIPs.includes(ip as string);

        res.json({
            poll: {
                id: poll._id,
                question: poll.question,
                options: poll.options,
                totalVotes: poll.options.reduce((acc, opt) => acc + opt.votes, 0),
                userVoted: userVoted,
                createdAt: poll.createdAt,
            }
        });
    } catch (err) {
        console.error("Error fetching poll:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
});

// POST /polls/vote
// Vote on a poll (IP restricted)
router.post("/vote", validateBody("pollId", "optionIndex"), async (req: Request, res: Response) => {
    try {
        const { pollId, optionIndex } = req.body;
        const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "") as string;

        const poll = await Poll.findById(pollId);
        if (!poll || !poll.active) {
            res.status(404).json({ detail: "Poll not found or inactive" });
            return;
        }

        // Check if user already voted
        if (poll.votedIPs.includes(ip)) {
            res.status(400).json({ detail: "You have already voted on this poll" });
            return;
        }

        // Check valid option
        if (optionIndex < 0 || optionIndex >= poll.options.length) {
            res.status(400).json({ detail: "Invalid option index" });
            return;
        }

        // Record vote
        poll.options[optionIndex].votes += 1;
        poll.votedIPs.push(ip);
        await poll.save();

        res.json({
            status: "voted",
            options: poll.options,
            totalVotes: poll.options.reduce((acc, opt) => acc + opt.votes, 0)
        });

    } catch (err) {
        console.error("Error voting on poll:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
});

// ─── Admin Routes ──────────────────────────────────────────────────────────

// POST /admin/polls
// Create a new poll (Admin only)
router.post(
    "/",
    adminAuth,
    validateBody("question", "options"),
    async (req: Request, res: Response) => {
        try {
            const { question, options, durationHours } = req.body; // options is string[]

            // Deactivate all previous polls
            await Poll.updateMany({ active: true }, { active: false });

            const pollOptions = options.map((text: string) => ({ text, votes: 0 }));
            let expiresAt = undefined;

            if (durationHours) {
                expiresAt = new Date();
                expiresAt.setHours(expiresAt.getHours() + durationHours);
            }

            const newPoll = await Poll.create({
                question,
                options: pollOptions,
                active: true,
                expiresAt
            });

            res.status(201).json({ poll: newPoll });
        } catch (err) {
            console.error("Error creating poll:", err);
            res.status(500).json({ detail: "Internal server error" });
        }
    }
);

// DELETE /admin/polls/:id
// Close a poll (Admin only)
router.delete("/:id", adminAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await Poll.findByIdAndUpdate(id, { active: false });
        res.json({ status: "closed" });
    } catch (err) {
        console.error("Error closing poll:", err);
        res.status(500).json({ detail: "Internal server error" });
    }
});

export default router;

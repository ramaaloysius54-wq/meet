import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { createClient } from "@supabase/supabase-js";

const PORT = Number(process.env.SIGNALING_PORT || 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "ramameet-signaling" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] }
});

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null;

// Verifikasi JWT Supabase saat koneksi Socket.IO
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!supabase || !token) return next();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return next(new Error("Unauthorized signaling token"));
  }
  socket.data.userId = data.user.id;
  return next();
});

io.on("connection", (socket) => {
  socket.on("room:join", ({ meetingCode, userName }) => {
    if (!meetingCode) return;
    socket.join(meetingCode);
    socket.to(meetingCode).emit("participant:joined", {
      userId: socket.data.userId || socket.id,
      userName
    });
  });

  socket.on("room:leave", ({ meetingCode }) => {
    if (!meetingCode) return;
    socket.leave(meetingCode);
  });

  socket.on("chat:message", ({ meetingCode, message }) => {
    if (!meetingCode || !message) return;
    socket.to(meetingCode).emit("chat:message", message);
  });

  socket.on("reaction:send", ({ meetingCode, emoji, senderName }) => {
    if (!meetingCode || !emoji) return;
    socket.to(meetingCode).emit("reaction:send", { emoji, senderName });
  });

  socket.on("host:mute-all", ({ meetingCode }) => {
    if (!meetingCode) return;
    socket.to(meetingCode).emit("host:mute-all");
  });

  socket.on("host:mute-participant", ({ meetingCode, targetUserId }) => {
    if (!meetingCode || !targetUserId) return;
    socket.to(meetingCode).emit("host:mute-participant", { targetUserId });
  });

  socket.on("host:remove-participant", ({ meetingCode, targetUserId }) => {
    if (!meetingCode || !targetUserId) return;
    socket.to(meetingCode).emit("host:remove-participant", { targetUserId });
  });

  socket.on("host:end-meeting", ({ meetingCode }) => {
    if (!meetingCode) return;
    socket.to(meetingCode).emit("host:end-meeting");
  });
});

server.listen(PORT, () => {
  console.log(`[RamaMeet Signaling] Listening on port ${PORT}`);
});

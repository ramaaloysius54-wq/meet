"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ChatMessage } from "@/types";
import { createClient } from "@/lib/supabase/client";

interface UseSignalingProps {
  meetingCode: string;
  userId: string;
  userName: string;
  enabled: boolean;
  onMessage: (msg: ChatMessage) => void;
  onReaction: (emoji: string, senderName: string) => void;
  onForceMute: () => void;
  onRemoved: () => void;
  onMeetingEnded: () => void;
}

export function useSignaling({
  meetingCode,
  userId,
  userName,
  enabled,
  onMessage,
  onReaction,
  onForceMute,
  onRemoved,
  onMeetingEnded
}: UseSignalingProps) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !meetingCode || !userId) return;

    const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_URL;
    let socket: Socket | null = null;

    const setup = async () => {
      if (!signalingUrl) return;
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      socket = io(signalingUrl, {
        transports: ["websocket", "polling"],
        auth: { token: accessToken, userId, userName },
        reconnectionAttempts: 5
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        setConnected(true);
        socket?.emit("room:join", { meetingCode, userId, userName });
      });

      socket.on("disconnect", () => setConnected(false));
      socket.on("chat:message", (msg: ChatMessage) => onMessage(msg));
      socket.on("reaction:send", (p: { emoji: string; senderName: string }) =>
        onReaction(p.emoji, p.senderName)
      );
      socket.on("host:mute-all", () => onForceMute());
      socket.on("host:mute-participant", (p: { targetUserId: string }) => {
        if (p.targetUserId === userId) onForceMute();
      });
      socket.on("host:remove-participant", (p: { targetUserId: string }) => {
        if (p.targetUserId === userId) onRemoved();
      });
      socket.on("host:end-meeting", () => onMeetingEnded());
    };

    setup();

    return () => {
      if (socket) {
        socket.emit("room:leave", { meetingCode, userId });
        socket.disconnect();
        socketRef.current = null;
      }
    };
  }, [enabled, meetingCode, userId, userName, onMessage, onReaction, onForceMute, onRemoved, onMeetingEnded]);

  return {
    connected,
    emitChat: (message: ChatMessage) =>
      socketRef.current?.emit("chat:message", { meetingCode, message }),
    emitReaction: (emoji: string) =>
      socketRef.current?.emit("reaction:send", { meetingCode, emoji, senderName: userName }),
    emitMuteAll: () => socketRef.current?.emit("host:mute-all", { meetingCode }),
    emitMuteUser: (targetUserId: string) =>
      socketRef.current?.emit("host:mute-participant", { meetingCode, targetUserId }),
    emitRemoveUser: (targetUserId: string) =>
      socketRef.current?.emit("host:remove-participant", { meetingCode, targetUserId }),
    emitEndMeeting: () => socketRef.current?.emit("host:end-meeting", { meetingCode })
  };
}

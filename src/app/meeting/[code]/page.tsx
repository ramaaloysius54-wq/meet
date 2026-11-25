"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ShieldCheck,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Users,
  MessageSquare,
  X,
  Lock
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { MeetingGrid } from "@/components/meeting/MeetingGrid";
import { MeetingControls } from "@/components/meeting/MeetingControls";
import { ParticipantPanel } from "@/components/meeting/ParticipantPanel";
import { ChatPanel } from "@/components/meeting/ChatPanel";
import { InviteModal } from "@/components/meeting/InviteModal";
import { useMeetingStore } from "@/stores/useMeetingStore";
import {
  fetchMessages,
  getMeetingByCode,
  hostActionParticipant,
  requestLiveKitToken,
  sendChatMessage,
  updateMeetingState
} from "@/services/meetingService";
import { useLiveKitRoom } from "@/hooks/useLiveKitRoom";
import { useSignaling } from "@/hooks/useSignaling";
import { createClient } from "@/lib/supabase/client";
import { formatDuration } from "@/utils/format";
import type { Meeting, MeetingParticipant } from "@/types";

export default function MeetingRoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const meetingCode = params.code;
  const stageRef = useRef<HTMLDivElement>(null);

  const profile = useMeetingStore((s) => s.profile);
  const tiles = useMeetingStore((s) => s.tiles);
  const messages = useMeetingStore((s) => s.messages);
  const setMessages = useMeetingStore((s) => s.setMessages);
  const addMessage = useMeetingStore((s) => s.addMessage);
  const unreadCount = useMeetingStore((s) => s.unreadCount);
  const rightTab = useMeetingStore((s) => s.rightTab);
  const setRightTab = useMeetingStore((s) => s.setRightTab);
  const mobileDrawerOpen = useMeetingStore((s) => s.mobileDrawerOpen);
  const setMobileDrawerOpen = useMeetingStore((s) => s.setMobileDrawerOpen);
  const viewMode = useMeetingStore((s) => s.viewMode);
  const setViewMode = useMeetingStore((s) => s.setViewMode);
  const reactions = useMeetingStore((s) => s.reactions);
  const pushReaction = useMeetingStore((s) => s.pushReaction);
  const pushNotification = useMeetingStore((s) => s.pushNotification);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [waitingList, setWaitingList] = useState<MeetingParticipant[]>([]);
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [lkUrl, setLkUrl] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [waitingApproval, setWaitingApproval] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chatBoxVisible, setChatBoxVisible] = useState(true);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  const isHost = Boolean(meeting && profile && meeting.host_id === profile.id);

  const joinRoom = useCallback(
    async (pwd?: string) => {
      try {
        setError(null);
        const { meeting: m, participants } = await getMeetingByCode(meetingCode);
        setMeeting(m);
        setWaitingList(participants.filter((p) => p.status === "waiting"));

        if (m.has_password && profile && m.host_id !== profile.id && !pwd) {
          setNeedsPassword(true);
          return;
        }

        const tokenRes = await requestLiveKitToken(meetingCode, pwd);
        setNeedsPassword(false);

        if (tokenRes.status === "waiting") {
          setWaitingApproval(true);
          return;
        }

        setLkToken(tokenRes.token);
        setLkUrl(tokenRes.livekitUrl);
        setJoined(true);

        const initialMessages = await fetchMessages(meetingCode);
        setMessages(initialMessages);
      } catch (err: any) {
        setError(err.message || "Gagal memasuki ruang meeting");
      }
    },
    [meetingCode, profile, setMessages]
  );

  useEffect(() => {
    if (profile) {
      joinRoom();
    }
  }, [profile, joinRoom]);

  useEffect(() => {
    if (!joined) return;
    const base = meeting?.started_at ? new Date(meeting.started_at).getTime() : Date.now();
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - base) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [joined, meeting?.started_at]);

  useEffect(() => {
    if (!joined || !meeting) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`meeting:${meeting.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meeting_messages",
          filter: `meeting_id=eq.${meeting.id}`
        },
        async () => {
          const latest = await fetchMessages(meetingCode);
          setMessages(latest);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_participants",
          filter: `meeting_id=eq.${meeting.id}`
        },
        async () => {
          const { participants } = await getMeetingByCode(meetingCode);
          setWaitingList(participants.filter((p) => p.status === "waiting"));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [joined, meeting, meetingCode, setMessages]);

  const lk = useLiveKitRoom({
    meetingCode,
    token: lkToken,
    serverUrl: lkUrl,
    userId: profile?.id || "local",
    userName: profile?.full_name || "RamaMeet User",
    avatarUrl: profile?.avatar_url,
    isHost,
    enabled: joined && Boolean(profile)
  });

  const signaling = useSignaling({
    meetingCode,
    userId: profile?.id || "",
    userName: profile?.full_name || "User",
    enabled: joined && Boolean(profile),
    onMessage: (msg) => addMessage(msg),
    onReaction: (emoji, senderName) =>
      pushReaction({ id: crypto.randomUUID(), emoji, senderName }),
    onForceMute: () => {
      lk.forceMute();
      pushNotification({
        title: "Mikrofon Dimatikan",
        message: "Host menonaktifkan mikrofon Anda.",
        type: "info"
      });
    },
    onRemoved: () => {
      lk.disconnect();
      router.push("/");
    },
    onMeetingEnded: () => {
      lk.disconnect();
      router.push("/");
    }
  });

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      stageRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleSendMessage = async (
    text: string,
    attachment?: { url: string; name: string; type: string }
  ) => {
    const saved = await sendChatMessage(meetingCode, {
      content: text,
      attachment_url: attachment?.url,
      attachment_name: attachment?.name,
      attachment_type: attachment?.type
    });
    addMessage(saved);
    signaling.emitChat(saved);
  };

  const handleOpenInvite = () => {
    setInviteModalOpen(true);
  };

  const handleMuteAll = async () => {
    await hostActionParticipant(meetingCode, { action: "mute_all" });
    signaling.emitMuteAll();
    pushNotification({ title: "Mute All", message: "Semua peserta di-mute.", type: "info" });
  };

  const handleMuteUser = async (targetUserId: string) => {
    await hostActionParticipant(meetingCode, { action: "mute", targetUserId });
    signaling.emitMuteUser(targetUserId);
  };

  const handleRemoveUser = async (targetUserId: string) => {
    await hostActionParticipant(meetingCode, { action: "remove", targetUserId });
    signaling.emitRemoveUser(targetUserId);
  };

  const handleAdmitUser = async (targetUserId: string) => {
    await hostActionParticipant(meetingCode, { action: "admit", targetUserId });
    setWaitingList((prev) => prev.filter((p) => p.user_id !== targetUserId));
  };

  const handleToggleLock = async () => {
    if (!meeting) return;
    const updated = await updateMeetingState(meetingCode, { is_locked: !meeting.is_locked });
    setMeeting(updated);
  };

  const handleToggleRecording = async () => {
    if (!meeting) return;
    const updated = await updateMeetingState(meetingCode, { is_recording: !meeting.is_recording });
    setMeeting(updated);
  };

  const handleLeave = () => {
    lk.disconnect();
    router.push("/");
  };

  const handleEndForAll = async () => {
    await updateMeetingState(meetingCode, { status: "ended" });
    signaling.emitEndMeeting();
    lk.disconnect();
    router.push("/");
  };

  if (needsPassword) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              joinRoom(passwordInput);
            }}
            className="w-full max-w-sm space-y-4 rounded-2xl border border-rm-border bg-rm-sidebar p-6 shadow-panel"
          >
            <div className="flex items-center gap-2 text-rm-primary">
              <Lock className="h-5 w-5" />
              <h2 className="text-base font-semibold text-white">Meeting Dilindungi Password</h2>
            </div>
            <input
              type="password"
              required
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Masukkan password meeting"
              className="h-10 w-full rounded-xl border border-rm-border bg-rm-bg px-3 text-sm text-rm-text focus:border-rm-primary focus:outline-none"
            />
            {error && <p className="text-xs text-rm-danger">{error}</p>}
            <button
              type="submit"
              className="h-10 w-full rounded-xl bg-rm-primary text-sm font-semibold text-white"
            >
              Masuk Meeting
            </button>
          </form>
        </div>
      </AppShell>
    );
  }

  if (waitingApproval) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center p-4">
          <div className="max-w-md rounded-2xl border border-rm-border bg-rm-sidebar p-8 text-center shadow-panel">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-rm-primary border-t-transparent" />
            <h2 className="text-lg font-semibold text-white">Menunggu Persetujuan Host</h2>
            <p className="mt-2 text-xs text-rm-muted">
              Anda berada di Waiting Room untuk <strong>{meeting?.title}</strong>. Anda akan otomatis masuk setelah Host menyetujui.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col gap-4 p-3 lg:flex-row lg:p-4">
        {/* CENTER: Main Video Conference Stage */}
        <section
          ref={stageRef}
          className="relative flex min-h-0 flex-1 flex-col rounded-2xl border border-rm-border/60 bg-rm-stage p-3.5 shadow-panel"
        >
          {/* Floating Reactions Overlay */}
          <div className="pointer-events-none absolute bottom-24 left-6 z-30 flex flex-col gap-1.5">
            {reactions.map((r) => (
              <div
                key={r.id}
                className="glass-pill inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-sm"
              >
                <span>{r.emoji}</span>
                <span className="text-xs text-white">{r.senderName}</span>
              </div>
            ))}
          </div>

          {/* Stage Top Header */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-rm-success" />
              <h2 className="text-sm font-semibold text-white sm:text-base">
                {meeting?.title || "RamaMeet Meeting"}
              </h2>
              <div className="flex items-center gap-1.5 rounded-full bg-rm-surface/80 px-2.5 py-0.5 text-xs text-rm-muted">
                <span
                  className={`h-2 w-2 rounded-full ${
                    meeting?.is_recording ? "bg-rm-danger animate-pulse" : "bg-rm-danger"
                  }`}
                />
                <span className="font-mono text-rm-text">{formatDuration(elapsedSeconds)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode(viewMode === "grid" ? "speaker" : "grid")}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rm-border bg-rm-sidebar px-3 text-xs font-medium text-rm-text hover:border-rm-primary"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>{viewMode === "grid" ? "View" : "Grid"}</span>
              </button>
              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-rm-border bg-rm-sidebar text-rm-muted hover:text-white"
                title="Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {lk.sfuNotice && (
            <div className="mb-2.5 rounded-xl border border-rm-primary/40 bg-rm-primary/10 px-3 py-1.5 text-[11px] text-sky-200">
              {lk.sfuNotice}
            </div>
          )}

          {error && (
            <div className="mb-2.5 rounded-xl border border-rm-danger/40 bg-rm-danger/10 px-3 py-2 text-xs text-rm-danger">
              {error}
            </div>
          )}

          {/* 2x2 Video Grid */}
          <div className="min-h-0 flex-1">
            <MeetingGrid
              tiles={tiles}
              viewMode={viewMode}
              onStopScreenShare={lk.toggleScreenShare}
            />
          </div>

          {/* Bottom Control Bar */}
          <MeetingControls
            isHost={isHost}
            isMuted={lk.isMuted}
            isVideoOff={lk.isVideoOff}
            isScreenSharing={lk.isScreenSharing}
            isScreenPaused={lk.isScreenPaused}
            cameraEffect={lk.cameraEffect}
            customBackgroundUrl={lk.customBackgroundUrl}
            micBusy={lk.micBusy}
            camBusy={lk.camBusy}
            isLocked={Boolean(meeting?.is_locked)}
            isRecording={Boolean(meeting?.is_recording)}
            participantCount={tiles.length}
            unreadChatCount={unreadCount}
            audioDevices={lk.audioDevices}
            videoDevices={lk.videoDevices}
            selectedAudioId={lk.selectedAudioId}
            selectedVideoId={lk.selectedVideoId}
            onToggleMute={lk.toggleMute}
            onToggleVideo={lk.toggleVideo}
            onToggleScreenShare={lk.toggleScreenShare}
            onTogglePauseScreenShare={lk.togglePauseScreenShare}
            onChangeCameraEffect={lk.setCameraEffect}
            onUploadBackgroundImage={lk.uploadBackgroundImage}
            onClearCustomBackground={lk.clearCustomBackground}
            onSelectAudio={lk.switchAudioDevice}
            onSelectVideo={lk.switchVideoDevice}
            onOpenParticipants={() => {
              setRightTab("participants");
              setMobileDrawerOpen(true);
            }}
            onOpenChat={() => {
              setRightTab("chat");
              setChatBoxVisible(true);
              setMobileDrawerOpen(true);
            }}
            onOpenInvite={handleOpenInvite}
            onSendReaction={(emoji) => {
              pushReaction({
                id: crypto.randomUUID(),
                emoji,
                senderName: profile?.full_name || "Anda"
              });
              signaling.emitReaction(emoji);
            }}
            onToggleLock={handleToggleLock}
            onToggleRecording={handleToggleRecording}
            onLeave={handleLeave}
            onEndForAll={handleEndForAll}
          />
        </section>

        {/* RIGHT SIDEBAR (Desktop) */}
        <aside className="hidden lg:flex w-80 shrink-0 flex-col gap-3 overflow-hidden">
          <div className="grid grid-cols-2 rounded-xl border border-rm-border/70 bg-rm-sidebar p-1">
            <button
              type="button"
              onClick={() => setRightTab("participants")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
                rightTab === "participants"
                  ? "bg-rm-surface text-white border-b-2 border-rm-primary"
                  : "text-rm-muted hover:text-rm-text"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Participants ({tiles.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRightTab("chat");
                setChatBoxVisible(true);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
                rightTab === "chat"
                  ? "bg-rm-surface text-white border-b-2 border-rm-primary"
                  : "text-rm-muted hover:text-rm-text"
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              <span>Chat</span>
            </button>
          </div>

          {rightTab === "participants" && (
            <div className="rounded-2xl border border-rm-border/70 bg-rm-sidebar p-3.5">
              <ParticipantPanel
                tiles={tiles}
                waitingList={waitingList}
                isHost={isHost}
                onInvite={handleOpenInvite}
                onMuteAll={handleMuteAll}
                onMuteUser={handleMuteUser}
                onRemoveUser={handleRemoveUser}
                onAdmitUser={handleAdmitUser}
              />
            </div>
          )}

          {(chatBoxVisible || rightTab === "chat") && (
            <div className="min-h-0 flex-1">
              <ChatPanel
                messages={messages}
                currentUserId={profile?.id || ""}
                onSendMessage={handleSendMessage}
                onClose={rightTab === "participants" ? () => setChatBoxVisible(false) : undefined}
              />
            </div>
          )}
        </aside>

        {/* MOBILE / TABLET BOTTOM SHEET DRAWER */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/65 backdrop-blur-sm lg:hidden">
            <div className="flex h-[75vh] flex-col rounded-t-3xl border-t border-rm-border bg-rm-sidebar p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRightTab("participants")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      rightTab === "participants"
                        ? "bg-rm-primary text-white"
                        : "bg-rm-surface text-rm-muted"
                    }`}
                  >
                    Participants ({tiles.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab("chat")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      rightTab === "chat"
                        ? "bg-rm-primary text-white"
                        : "bg-rm-surface text-rm-muted"
                    }`}
                  >
                    Chat
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="rounded-lg p-1.5 text-rm-muted hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {rightTab === "participants" ? (
                  <ParticipantPanel
                    tiles={tiles}
                    waitingList={waitingList}
                    isHost={isHost}
                    onInvite={handleOpenInvite}
                    onMuteAll={handleMuteAll}
                    onMuteUser={handleMuteUser}
                    onRemoveUser={handleRemoveUser}
                    onAdmitUser={handleAdmitUser}
                  />
                ) : (
                  <ChatPanel
                    messages={messages}
                    currentUserId={profile?.id || ""}
                    onSendMessage={handleSendMessage}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Undangan 2 Opsi: Link Meeting & Meeting Code */}
      <InviteModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        meetingCode={meetingCode}
        meetingTitle={meeting?.title || "RamaMeet Meeting"}
        hasPassword={Boolean(meeting?.has_password)}
        onCopied={(label) =>
          pushNotification({
            title: "Berhasil Disalin",
            message: `${label} siap dibagikan ke peserta.`,
            type: "success"
          })
        }
      />
    </AppShell>
  );
}
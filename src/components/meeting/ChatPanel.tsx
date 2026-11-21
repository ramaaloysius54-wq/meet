"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Send, X, CheckCheck, FileText } from "lucide-react";
import type { ChatMessage } from "@/types";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { formatTime } from "@/utils/format";

interface ChatPanelProps {
  messages: ChatMessage[];
  currentUserId: string;
  onSendMessage: (
    text: string,
    attachment?: { url: string; name: string; type: string }
  ) => Promise<void>;
  onClose?: () => void;
}

export function ChatPanel({
  messages,
  currentUserId,
  onSendMessage,
  onClose
}: ChatPanelProps) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    try {
      setSending(true);
      await onSendMessage(text.trim());
      setText("");
    } finally {
      setSending(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bucket", "chat-attachments");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.url) {
        await onSendMessage(`Lampiran: ${file.name}`, {
          url: data.url,
          name: data.name,
          type: data.type
        });
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-rm-border/70 bg-[#101A2F]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-rm-border/60 px-4 py-3">
        <h3 className="text-sm font-semibold text-rm-text">Chat Meeting</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-rm-muted hover:bg-rm-surface hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3.5 overflow-y-auto px-3.5 py-3">
        {messages.length === 0 && (
          <p className="py-8 text-center text-xs text-rm-muted">
            Belum ada pesan. Mulai diskusi di sini.
          </p>
        )}

        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${isMe ? "justify-end" : "justify-start"}`}
            >
              {!isMe && (
                <UserAvatar
                  name={msg.sender_name}
                  src={msg.sender_avatar}
                  size="sm"
                  className="mt-1"
                />
              )}

              <div className={`max-w-[80%] ${isMe ? "items-end text-right" : "items-start"}`}>
                {!isMe && (
                  <div className="mb-1 flex items-center gap-2 text-[11px]">
                    <span className="font-medium text-rm-text">{msg.sender_name}</span>
                    <span className="text-rm-muted">{formatTime(msg.created_at)}</span>
                  </div>
                )}

                <div
                  className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                    isMe
                      ? "rounded-tr-sm bg-rm-primary text-white"
                      : "rounded-tl-sm bg-rm-surface text-rm-text"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words text-left">{msg.content}</p>
                  {msg.attachment_url && (
                    <a
                      href={msg.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-black/25 px-2.5 py-1 text-[11px] underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>{msg.attachment_name || "Unduh Lampiran"}</span>
                    </a>
                  )}
                </div>

                {isMe && (
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-rm-muted">
                    <span>{formatTime(msg.created_at)}</span>
                    <CheckCheck className="h-3.5 w-3.5 text-sky-400" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input Footer */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-rm-border/60 p-3"
      >
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept="image/*,.pdf,.txt,.docx"
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rm-border bg-rm-surface text-rm-muted transition hover:text-white disabled:opacity-50"
          title="Lampirkan file"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={uploading ? "Mengunggah file..." : "Type a message..."}
          className="h-9 flex-1 rounded-xl border border-rm-border/80 bg-rm-bg/80 px-3 text-xs text-rm-text placeholder:text-rm-muted focus:border-rm-primary focus:outline-none"
        />

        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rm-primary text-white shadow-blue-glow transition hover:brightness-110 disabled:opacity-50"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

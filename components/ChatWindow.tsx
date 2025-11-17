"use client";

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { loadSession, UserSession } from "@/lib/session";
import { useRouter } from "next/navigation";
import { getWS, getActivityIdFromUrl, isWSOpen, subscribeWS } from "@/lib/ws";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  attachment?: {
    type: "image" | "video";
    url: string;
    fileName: string;
  };
};

type MessageBubbleProps = {
  msg: Message;
  isLast: boolean;
};

const MessageBubble = memo(
  function MessageBubble(props: MessageBubbleProps) {
    const isUser = props.msg.role === "user";
    return (
      <div
        className={`flex ${isUser ? "justify-end" : "justify-start"} ${
          props.isLast ? "message-in" : ""
        }`}
      >
        <div
          className={`max-w-[80%] md:max-w-[70%] px-4 py-3 rounded-2xl border backdrop-blur ${
            isUser
              ? "bg-primary text-white border-transparent shadow-[0_8px_20px_rgba(233,66,108,0.35)]"
              : "bg-white/5 text-white/90 border-white/10 shadow-[0_6px_18px_rgba(76,0,255,0.16)]"
          }`}
        >
          <p className="whitespace-pre-wrap">{props.msg.content}</p>
          {props.msg.attachment && (
            <div className="mt-2 space-y-1">
              {props.msg.attachment.type === "image" && (
                <img
                  src={props.msg.attachment.url}
                  alt={props.msg.attachment.fileName || "Captured image"}
                  className="max-w-full rounded-xl border border-white/10"
                />
              )}
              {props.msg.attachment.type === "video" && (
                <video
                  controls
                  src={props.msg.attachment.url}
                  className="max-w-full rounded-xl border border-white/10"
                />
              )}
              <p className="text-[11px] text-white/60 truncate">
                {props.msg.attachment.fileName}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) => prev.msg === next.msg && prev.isLast === next.isLast
);

const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="flex justify-start message-in">
      <div className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 backdrop-blur">
        <div className="flex items-center gap-1.5">
          <span className="typing-dot" />
          <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
          <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
        </div>
      </div>
    </div>
  );
});

export default function ChatWindow() {
  const router = useRouter();
  const session = useMemo<UserSession | null>(() => loadSession(), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<
    Message["attachment"] | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamMsgIdRef = useRef<string | null>(null);
  const tokenQueueRef = useRef<string[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const flushCompletePendingRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const locationText = useMemo(() => {
    if (!session?.location) return null;
    if (
      session.location.formatted &&
      session.location.formatted.trim().length > 0
    ) {
      return session.location.formatted;
    }
    const lat = session.location.latitude.toFixed(5);
    const lon = session.location.longitude.toFixed(5);
    return `${lat}, ${lon}`;
  }, [session]);
  const userMeta = useMemo(() => {
    if (!session) return undefined;
    return {
      name: session.name,
      email: session.email,
      createdAt: session.createdAt,
      location: session.location,
    };
  }, [session]);

  // Remote WS kullanılacağı için dev initializer'a gerek yok

  useEffect(() => {
    if (!session) {
      router.replace("/");
      return;
    }
    const firstName = session.name.split(" ")[0] || session.name;
    const welcome = `Hey ${firstName}! I’m your on-site concierge. How can I help you today?`;
    setMessages([
      {
        id: "m1",
        role: "assistant",
        content: welcome,
      },
    ]);
  }, [router, session]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text && !pendingAttachment) return;
    if (!isWSOpen()) {
      // bağlantı yokken gönderimi engelle
      return;
    }

    setInput("");
    const attachmentToSend = pendingAttachment;
    if (attachmentToSend) {
      setPendingAttachment(null);
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content:
        text ||
        (attachmentToSend
          ? attachmentToSend.type === "image"
            ? "Photo"
            : "Video"
          : ""),
      attachment: attachmentToSend ?? undefined,
    };
    setMessages((m) => [...m, userMsg]);

    const ws = getWS();

    const payload = {
      activity_id: getActivityIdFromUrl(),
      session_id: null,
      message: text,
      time: new Date().toISOString(),
      user_meta: userMeta,
    };
    // eslint-disable-next-line no-console
    console.log("WS send payload:", payload, "readyState:", ws.readyState);

    // Şu an için görseller sadece UI tarafında demo olarak gösteriliyor.
    // Metin yoksa backend'e herhangi bir mesaj göndermiyoruz.
    if (text) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
        setSending(true);
      } else {
        ws.onopen = () => {
          // eslint-disable-next-line no-console
          console.log("WS onopen -> sending payload now");
          ws.send(JSON.stringify(payload));
          setSending(true);
        };
      }
    }
  }

  function handleCameraClick() {
    fileInputRef.current?.click();
  }

  function handleMediaSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      e.target.value = "";
      return;
    }

    // Önceki pending görsel varsa onun URL'sini serbest bırak
    if (pendingAttachment?.url) {
      try {
        URL.revokeObjectURL(pendingAttachment.url);
      } catch {
        // ignore
      }
    }

    const objectUrl = URL.createObjectURL(file);
    const mediaType = isImage ? "image" : "video";

    setPendingAttachment({
      type: mediaType,
      url: objectUrl,
      fileName: file.name,
    });

    // Dosya sadece pending state'te tutuluyor, şu an için backend'e gönderim yok.
    e.target.value = "";
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-white/70">
        Loading…
      </div>
    );
  }

  // Keep list pinned appropriately when the virtual keyboard shows/hides
  const keyboardOpen = useRef(false);
  const lastViewportHeight = useRef<number | null>(null);
  useEffect(() => {
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (!vv) return;
    const onResize = () => {
      // Only react while keyboard is open, and ignore tiny jitters
      if (!keyboardOpen.current) {
        lastViewportHeight.current = vv.height;
        return;
      }
      const current = vv.height;
      const prev = lastViewportHeight.current;
      lastViewportHeight.current = current;
      if (prev !== null && Math.abs(current - prev) < 8) {
        return;
      }
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    };
    lastViewportHeight.current = vv.height;
    vv.addEventListener("resize", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
    };
  }, []);

  function handleFocus() {
    keyboardOpen.current = true;
    document.documentElement.classList.add("keyboard-open");
  }
  function handleBlur() {
    keyboardOpen.current = false;
    document.documentElement.classList.remove("keyboard-open");
    // ensure state snaps back
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  useEffect(() => {
    const ws = getWS();
    setConnected(ws.readyState === WebSocket.OPEN);

    const unsubscribe = subscribeWS({
      onMessage: (event) => {
        // eslint-disable-next-line no-console
        console.log("WS onmessage raw:", event.data);
        try {
          const data = JSON.parse(event.data);
          // eslint-disable-next-line no-console
          console.log("WS onmessage parsed:", data);
          if (data.type !== "message") return;
          // Ensure streaming target exists
          if (!streamMsgIdRef.current) {
            const newId = crypto.randomUUID();
            streamMsgIdRef.current = newId;
            setMessages((prev) => [
              ...prev,
              { id: newId, role: "assistant", content: "" },
            ]);
          }
          // Queue token and start smooth flush
          if (typeof data.content === "string") {
            tokenQueueRef.current.push(data.content);
            scheduleFlush();
          }
          if (data.isComplete) {
            flushCompletePendingRef.current = true;
            scheduleFlush(); // ensure we drain and then finalize
          }
        } catch {
          // düz string gelirse
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: String(event.data),
            },
          ]);
        }
      },
      onOpen: () => setConnected(true),
      onClose: () => {
        setConnected(false);
        setSending(false);
      },
      onError: () => setConnected(false),
    });

    return () => {
      unsubscribe();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, []);

  function scheduleFlush() {
    if (flushTimerRef.current !== null) return;
    const tick = () => {
      const msgId = streamMsgIdRef.current;
      if (msgId && tokenQueueRef.current.length > 0) {
        const token = tokenQueueRef.current.shift()!;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, content: m.content + token } : m
          )
        );
        // keep view pinned
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        });
        flushTimerRef.current = window.setTimeout(tick, 20);
        return;
      }
      // No tokens left; finalize if complete signaled
      if (flushCompletePendingRef.current) {
        flushCompletePendingRef.current = false;
        streamMsgIdRef.current = null;
        setSending(false);
      }
      flushTimerRef.current = null;
    };
    flushTimerRef.current = window.setTimeout(tick, 10);
  }
  return (
    <div className="relative flex flex-col h-full pb-safe">
      {/* Ambient background effects */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/30 blur-3xl animate-pulse-slow" />
        <div
          className="absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-accent/25 blur-3xl animate-pulse-slow"
          style={{ animationDelay: "400ms" }}
        />
        <div
          className="absolute bottom-[-4rem] left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-indigo/20 blur-3xl animate-pulse-slow"
          style={{ animationDelay: "800ms" }}
        />
        <div className="absolute inset-0 bg-grid opacity-[0.18]" />
      </div>

      <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? "bg-emerald-400" : "bg-red-400"
            }`}
            aria-label={connected ? "Connected" : "Disconnected"}
          />
          <div className="text-sm font-semibold">VARCA</div>
        </div>
        {(!connected || locationText) && (
          <div className="ml-auto text-xs text-white/60 truncate">
            {!connected
              ? "Reconnecting…"
              : locationText
              ? `(${locationText})`
              : ""}
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="themed-scroll overscroll-contain flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4"
      >
        {messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            msg={m}
            isLast={i === messages.length - 1}
          />
        ))}
        {sending && <TypingIndicator />}
      </div>

      <form
        onSubmit={handleSend}
        className="px-4 md:px-6 py-3 sm:py-4 border-t border-white/10 bg-[#121213] space-y-2"
      >
        {pendingAttachment && (
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl overflow-hidden border border-white/15 bg-black/40 flex items-center justify-center">
              {pendingAttachment.type === "image" && (
                <img
                  src={pendingAttachment.url}
                  alt={pendingAttachment.fileName || "Selected image"}
                  className="max-h-full max-w-full object-cover"
                />
              )}
              {pendingAttachment.type === "video" && (
                <video
                  src={pendingAttachment.url}
                  className="max-h-full max-w-full object-cover"
                  muted
                />
              )}
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
              <p className="text-xs text-white/70 truncate">
                {pendingAttachment.fileName}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (pendingAttachment?.url) {
                    try {
                      URL.revokeObjectURL(pendingAttachment.url);
                    } catch {
                      // ignore
                    }
                  }
                  setPendingAttachment(null);
                }}
                className="text-[11px] text-white/60 hover:text-white/90 px-2 py-1 rounded-full border border-white/20"
              >
                Remove
              </button>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleCameraClick}
            className="h-10 w-10 md:h-11 md:w-11 flex items-center justify-center rounded-full bg-[#141415] border border-white/15 text-white/80 hover:bg-white/5 transition-colors flex-shrink-0 touch-manipulation"
            aria-label="Open camera"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <rect
                x="3.5"
                y="6.5"
                width="17"
                height="13"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M9 6.5L10.2 4.8C10.6 4.2 11.3 3.8 12 3.8C12.7 3.8 13.4 4.2 13.8 4.8L15 6.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle
                cx="12"
                cy="13"
                r="3"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={handleMediaSelected}
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message…"
            onFocus={handleFocus}
            onBlur={handleBlur}
            className="flex-1 min-w-0 h-12 md:h-12 rounded-xl bg-[#141415] border border-white/10 px-4 py-0 outline-none appearance-none placeholder:text-white/60 text-[16px] leading-6 focus:ring-2 focus:ring-primary/30 touch-manipulation"
            aria-label="Message"
          />
          <button
            type="submit"
            disabled={
              sending || (!input.trim() && !pendingAttachment) || !connected
            }
            className="btn-primary h-12 md:h-12 inline-flex items-center justify-center px-4 md:px-5 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 touch-manipulation"
            aria-label="Send"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

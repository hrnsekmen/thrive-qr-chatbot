"use client";

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { loadSession, UserSession } from "@/lib/session";
import { useRouter } from "next/navigation";
import { getWS, getActivityIdFromUrl, isWSOpen, subscribeWS } from "@/lib/ws";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
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
    const welcome = `Hi ${
      session.name.split(" ")[0]
    }! How can I help you today?`;
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
    if (!text) return;
    if (!isWSOpen()) {
      // bağlantı yokken gönderimi engelle
      return;
    }

    setInput("");
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
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
        className="px-4 md:px-6 py-3 sm:py-4 border-t border-white/10 bg-[#121213] flex items-center gap-2 sm:gap-3"
      >
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
          disabled={sending || !input.trim() || !connected}
          className="btn-primary h-12 md:h-12 inline-flex items-center justify-center px-4 md:px-5 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 touch-manipulation"
          aria-label="Send"
        >
          Send
        </button>
      </form>
    </div>
  );
}

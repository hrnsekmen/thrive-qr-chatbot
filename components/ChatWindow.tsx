"use client";

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { loadSession, UserSession } from "@/lib/session";
import { useRouter } from "next/navigation";
import { getWS, getActivityIdFromUrl, isWSOpen, subscribeWS } from "@/lib/ws";

type MessageAttachment = {
  type: "image" | "video";
  url: string;
  fileName: string;
};

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  attachment?: MessageAttachment;
};

type PendingAttachment = MessageAttachment & {
  file: File;
  trimStartSec?: number;
  trimEndSec?: number;
};

type TrimState = {
  file: File;
  objectUrl: string;
  duration: number;
  startSec: number;
  lengthSec: number;
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
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isVideoPreview, setIsVideoPreview] = useState(false);
  const [isPhotoCapture, setIsPhotoCapture] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const recordingVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);
  const streamMsgIdRef = useRef<string | null>(null);
  const tokenQueueRef = useRef<string[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const flushCompletePendingRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const attachmentButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [trimState, setTrimState] = useState<TrimState | null>(null);
  const [alertState, setAlertState] = useState<{
    title?: string;
    message: string;
  } | null>(null);
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

  // JSON + binary paketlemek için yardımcılar
  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Unexpected FileReader result"));
          return;
        }
        const commaIndex = result.indexOf(",");
        if (commaIndex >= 0) {
          resolve(result.substring(commaIndex + 1));
        } else {
          resolve(result);
        }
      };
      reader.onerror = () =>
        reject(reader.error || new Error("FileReader error"));
      reader.readAsDataURL(file);
    });
  }

  async function sendBinaryVideoOverWS(
    ws: WebSocket,
    file: File,
    metadata: {
      message: string;
      activity_id: string;
      session_id: string | null;
      time: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user_meta?: any;
      trimStartSec?: number;
      trimEndSec?: number;
    }
  ) {
    // 1) Metadatayı + mesajı TEXT frame olarak gönder
    const textPayload = JSON.stringify({
      ...metadata,
      media: {
        type: "video",
      },
    });
    ws.send(textPayload);

    // 2) Videoyu ayrı bir BINARY frame olarak gönder
    const videoBytes = await file.arrayBuffer();
    ws.send(videoBytes);
  }

  function openAlert(message: string, title?: string) {
    setAlertState({ message, title });
  }

  function stopAndCleanupRecording() {
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    const videoEl = recordingVideoRef.current;
    if (videoEl) {
      videoEl.srcObject = null;
    }
    setIsRecording(false);
    setIsVideoPreview(false);
    setIsPhotoCapture(false);
  }

  async function startVideoPreview() {
    setRecordingError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setRecordingError("Camera access is not supported on this device.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const videoEl = recordingVideoRef.current;
      if (videoEl) {
        videoEl.srcObject = stream;
        try {
          await videoEl.play();
        } catch {
          // ignore
        }
      }

      // If there is no audio track, surface a hint to the user
      const hasAudio = stream.getAudioTracks().length > 0;
      if (!hasAudio) {
        setRecordingError(
          "No microphone audio detected. Please check browser permissions."
        );
      } else {
        setRecordingError(null);
      }
      setIsVideoPreview(true);
      setIsRecording(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Camera access failed:", err);
      stopAndCleanupRecording();
      setRecordingError("Could not access the camera. Please check permissions.");
    }
  }

  async function startCustomVideoRecording() {
    setRecordingError(null);
    if (!mediaStreamRef.current) {
      await startVideoPreview();
      if (!mediaStreamRef.current) return;
    }

    try {
      const stream = mediaStreamRef.current;
      if (!stream) {
        setRecordingError("Camera stream is not available.");
        return;
      }

      let recorder: MediaRecorder;
      const preferredMime = "video/webm;codecs=vp8,opus";
      if (
        typeof (MediaRecorder as any).isTypeSupported === "function" &&
        (MediaRecorder as any).isTypeSupported(preferredMime)
      ) {
        recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      } else {
        recorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        stopAndCleanupRecording();

        if (chunks.length === 0) {
          setIsRecording(false);
          return;
        }

        const mimeType =
          (mediaRecorderRef.current && mediaRecorderRef.current.mimeType) ||
          "video/webm;codecs=vp8,opus";
        const blob = new Blob(chunks, { type: mimeType });
        const MAX_BYTES = 10 * 1024 * 1024;
        if (blob.size > MAX_BYTES) {
          openAlert(
            "Recorded video exceeds the 10MB limit. Please record a shorter or lower-resolution video.",
            "Video too large"
          );
          setIsRecording(false);
          return;
        }

        const fileName = `recorded-${Date.now()}.webm`;
        const file = new File([blob], fileName, {
          type: blob.type || "video/webm",
        });
        const url = URL.createObjectURL(blob);

        setPendingAttachment((prev) => {
          if (prev?.url) {
            try {
              URL.revokeObjectURL(prev.url);
            } catch {
              // ignore
            }
          }
          return {
            type: "video",
            url,
            fileName,
            file,
          };
        });
        setIsPreviewOpen(true);
        setIsRecording(false);
        setIsVideoPreview(false);
      };

      recorder.start();
      setIsRecording(true);

      if (recordingTimeoutRef.current !== null) {
        window.clearTimeout(recordingTimeoutRef.current);
      }
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          try {
            mediaRecorderRef.current.stop();
          } catch {
            // ignore
          }
        }
      }, 4000);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Camera access failed:", err);
      stopAndCleanupRecording();
      setIsRecording(false);
      setRecordingError("Could not access the camera. Please check permissions.");
    }
  }

  async function startPhotoCapture() {
    setRecordingError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setRecordingError("Camera access is not supported on this device.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      mediaStreamRef.current = stream;

      const videoEl = recordingVideoRef.current;
      if (videoEl) {
        videoEl.srcObject = stream;
        try {
          await videoEl.play();
        } catch {
          // ignore
        }
      }

      setIsPhotoCapture(true);
      setIsVideoPreview(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Camera access failed:", err);
      stopAndCleanupRecording();
      setIsPhotoCapture(false);
      setRecordingError("Could not access the camera. Please check permissions.");
    }
  }

  async function handleCapturePhoto() {
    const videoEl = recordingVideoRef.current;
    if (!videoEl) return;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoEl.videoWidth || 640;
      canvas.height = videoEl.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas not supported");
      }
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to capture photo"));
          },
          "image/jpeg",
          0.9
        );
      });

      const fileName = `photo-${Date.now()}.jpg`;
      const file = new File([blob], fileName, {
        type: blob.type || "image/jpeg",
      });
      const url = URL.createObjectURL(blob);

      setPendingAttachment((prev) => {
        if (prev?.url) {
          try {
            URL.revokeObjectURL(prev.url);
          } catch {
            // ignore
          }
        }
        return {
          type: "image",
          url,
          fileName,
          file,
        };
      });

      setIsPreviewOpen(true);
      setIsPhotoCapture(false);
      stopAndCleanupRecording();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Photo capture failed:", err);
      setRecordingError("Failed to capture photo. Please try again.");
    }
  }

  function handleCancelPhotoCapture() {
    setIsPhotoCapture(false);
    stopAndCleanupRecording();
  }

  function getVideoDuration(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";

      const cleanup = () => {
        video.removeAttribute("src");
        video.load();
      };

      video.onloadedmetadata = () => {
        const duration = video.duration;
        cleanup();
        resolve(duration);
      };

      video.onerror = () => {
        cleanup();
        reject(new Error("Failed to load video metadata"));
      };

      video.src = url;
    });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text && !pendingAttachment) return;
    if (!isWSOpen()) {
      // prevent sending while disconnected
      return;
    }

    setInput("");
    const attachmentToSend = pendingAttachment;
    if (attachmentToSend) {
      setPendingAttachment(null);
    }

    const attachmentForMessage: MessageAttachment | undefined =
      attachmentToSend
        ? {
            type: attachmentToSend.type,
            url: attachmentToSend.url,
            fileName: attachmentToSend.fileName,
          }
        : undefined;

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
      attachment: attachmentForMessage,
    };
    setMessages((m) => [...m, userMsg]);

    const ws = getWS();

    const basePayload = {
      activity_id: getActivityIdFromUrl(),
      session_id: null,
      message: text,
      time: new Date().toISOString(),
      user_meta: userMeta,
    };
    // eslint-disable-next-line no-console
    console.log("WS send base payload:", basePayload, {
      hasAttachment: !!attachmentToSend,
      readyState: ws.readyState,
    });

    const sendJsonPayload = (payload: unknown) => {
      const json = JSON.stringify(payload);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
        setSending(true);
      } else {
        ws.onopen = () => {
          // eslint-disable-next-line no-console
          console.log("WS onopen -> sending JSON payload now");
          ws.send(json);
          setSending(true);
        };
      }
    };

    try {
      if (attachmentToSend && attachmentToSend.type === "image") {
        // For images: send base64 inside JSON
        const base64 = await fileToBase64(attachmentToSend.file);
        const payload = {
          ...basePayload,
          media: {
            type: "image",
            content: base64,
          },
        };
        sendJsonPayload(payload);
      } else if (attachmentToSend && attachmentToSend.type === "video") {
        // For video: JSON + binary packing like sample.js
        const sendBinary = async () => {
          await sendBinaryVideoOverWS(ws, attachmentToSend.file, {
            ...basePayload,
            trimStartSec: attachmentToSend.trimStartSec,
            trimEndSec: attachmentToSend.trimEndSec,
          });
          setSending(true);
        };

        if (ws.readyState === WebSocket.OPEN) {
          await sendBinary();
        } else {
          ws.onopen = () => {
            // eslint-disable-next-line no-console
            console.log("WS onopen -> sending binary video payload now");
            sendBinary().catch((err) => {
              // eslint-disable-next-line no-console
              console.error("Failed to send binary video:", err);
            });
          };
        }
      } else if (text) {
        // Sadece metin
        sendJsonPayload(basePayload);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to send message:", err);
    }
  }

  function toggleAttachmentMenu() {
    setIsAttachmentMenuOpen((open) => !open);
  }

  function handleRecordVideoClick() {
    setIsAttachmentMenuOpen(false);
    void startVideoPreview();
  }

  function handleTakePhotoClick() {
    setIsAttachmentMenuOpen(false);
    const canUseCustomCamera =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;

    if (canUseCustomCamera) {
      void startPhotoCapture();
      return;
    }

    // Fallback: native file picker with camera
    photoInputRef.current?.click();
  }

  function handleUploadMediaClick() {
    setIsAttachmentMenuOpen(false);
    fileInputRef.current?.click();
  }

  function handleCancelVideoPreview() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    } else {
      stopAndCleanupRecording();
    }
    setIsRecording(false);
    setIsVideoPreview(false);
  }

  function handleStopVideoRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
  }

  function handleTrimCancel() {
    setTrimState((prev) => {
      if (prev?.objectUrl) {
        try {
          URL.revokeObjectURL(prev.objectUrl);
        } catch {
          // ignore
        }
      }
      return null;
    });
  }

  function handleTrimConfirm() {
    if (!trimState) return;
    const { file, objectUrl, duration, startSec, lengthSec } = trimState;
    const endSec = Math.min(startSec + lengthSec, duration);

    setPendingAttachment((prev) => {
      if (prev?.url && prev.url !== objectUrl) {
        try {
          URL.revokeObjectURL(prev.url);
        } catch {
          // ignore
        }
      }
      return {
        type: "video",
        url: objectUrl,
        fileName: file.name,
        file,
        trimStartSec: startSec,
        trimEndSec: endSec,
      };
    });

    setTrimState(null);
    setIsPreviewOpen(true);
  }

  function handleTrimStartChange(newStart: number) {
    setTrimState((prev) => {
      if (!prev) return prev;
      const maxStart = Math.max(0, prev.duration - prev.lengthSec);
      const clampedStart = Math.min(Math.max(0, newStart), maxStart);
      return { ...prev, startSec: clampedStart };
    });
  }

  function handleTrimLengthChange(newLength: number) {
    setTrimState((prev) => {
      if (!prev) return prev;
      const maxLength = Math.min(4, prev.duration);
      const clampedLength = Math.min(Math.max(0.5, newLength), maxLength);
      const maxStart = Math.max(0, prev.duration - clampedLength);
      const clampedStart = Math.min(prev.startSec, maxStart);
      return {
        ...prev,
        startSec: clampedStart,
        lengthSec: clampedLength,
      };
    });
  }

  async function handleMediaSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      e.target.value = "";
      return;
    }

    // Size limit: 10MB
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      openAlert(
        "Maximum file size is 10MB. Please select a smaller file.",
        "File too large"
      );
      e.target.value = "";
      return;
    }

    // Release previous preview URL if there was one
    if (pendingAttachment?.url) {
      try {
        URL.revokeObjectURL(pendingAttachment.url);
      } catch {
        // ignore
      }
    }

    const objectUrl = URL.createObjectURL(file);
    const mediaType = isImage ? "image" : "video";

    if (mediaType === "video") {
      try {
        const duration = await getVideoDuration(objectUrl);
        if (duration > 4) {
          setTrimState({
            file,
            objectUrl,
            duration,
            startSec: 0,
            lengthSec: Math.min(4, duration),
          });
          // Do not keep file input value; allow selecting again later
          e.target.value = "";
          return;
        }
      } catch {
        // eslint-disable-next-line no-console
        console.error("Video duration could not be read. Selected video was rejected.");
        URL.revokeObjectURL(objectUrl);
        e.target.value = "";
        return;
      }
    }

    setPendingAttachment({
      type: mediaType,
      url: objectUrl,
      fileName: file.name,
      file,
    });

    // Open preview modal immediately for both photo and video
    setIsPreviewOpen(true);

    // File is only kept in pending state; it is sent to backend during send.
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

  useEffect(() => {
    if (!isAttachmentMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const menuEl = attachmentMenuRef.current;
      const buttonEl = attachmentButtonRef.current;
      const target = event.target as Node | null;
      if (!target || !menuEl || !buttonEl) return;
      if (menuEl.contains(target) || buttonEl.contains(target)) return;
      setIsAttachmentMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isAttachmentMenuOpen]);

  useEffect(() => {
    if (!pendingAttachment && isPreviewOpen) {
      setIsPreviewOpen(false);
    }
  }, [pendingAttachment, isPreviewOpen]);

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

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current !== null) {
        window.clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []);
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
        <div
          className={`space-y-2 ${
            isVideoPreview || isPhotoCapture ? "block" : "hidden"
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span>
              {isPhotoCapture
                ? "Camera is active – tap Take photo to capture."
                : isRecording
                ? "Recording video… (maximum 4 seconds)"
                : "Camera is active – tap Record video to start."}
            </span>
          </div>
          <div className="w-full rounded-xl overflow-hidden border border-red-500/40 bg-black/60">
            <video
              ref={recordingVideoRef}
              className="w-full h-40 object-contain"
              muted
              autoPlay
              playsInline
            />
          </div>
          <div className="flex justify-end gap-2">
            {isPhotoCapture ? (
              <>
                <button
                  type="button"
                  onClick={handleCancelPhotoCapture}
                  className="px-3 py-1.5 rounded-full border border-white/20 text-[11px] text-white/70 hover:text-white hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCapturePhoto}
                  className="px-3 py-1.5 rounded-full bg-primary text-[11px] text-white hover:bg-primary/90"
                >
                  Take photo
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCancelVideoPreview}
                  className="px-3 py-1.5 rounded-full border border-white/20 text-[11px] text-white/70 hover:text-white hover:bg-white/5"
                >
                  Cancel
                </button>
                {isRecording ? (
                  <button
                    type="button"
                    onClick={handleStopVideoRecording}
                    className="px-3 py-1.5 rounded-full bg-primary text-[11px] text-white hover:bg-primary/90"
                  >
                    Stop recording
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startCustomVideoRecording()}
                    className="px-3 py-1.5 rounded-full bg-primary text-[11px] text-white hover:bg-primary/90"
                  >
                    Record video
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {recordingError && !isRecording && !isPhotoCapture && (
          <p className="text-xs text-red-400">{recordingError}</p>
        )}
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
                  playsInline
                />
              )}
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
              <p className="text-xs text-white/70 truncate">
                {pendingAttachment.fileName}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="text-[11px] text-white/70 hover:text-white px-2 py-1 rounded-full border border-white/25"
                >
                  Preview
                </button>
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
          </div>
        )}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative">
            <button
              type="button"
              ref={attachmentButtonRef}
              onClick={toggleAttachmentMenu}
              className="h-10 w-10 md:h-11 md:w-11 flex items-center justify-center rounded-full bg-[#141415] border border-white/15 text-white/80 hover:bg-white/5 transition-colors flex-shrink-0 touch-manipulation"
              aria-label="Open attachment menu"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <circle cx="5" cy="12" r="1.7" fill="currentColor" />
                <circle cx="12" cy="12" r="1.7" fill="currentColor" />
                <circle cx="19" cy="12" r="1.7" fill="currentColor" />
              </svg>
            </button>
            {isAttachmentMenuOpen && (
              <div
                ref={attachmentMenuRef}
                className="absolute bottom-full mb-2 left-0 w-48 rounded-xl bg-[#18181a] border border-white/15 shadow-xl z-20 py-1"
              >
                <button
                  type="button"
                  onClick={handleRecordVideoClick}
                  className="w-full px-3 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                >
                  Record video
                </button>
                <button
                  type="button"
                  onClick={handleTakePhotoClick}
                  className="w-full px-3 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                >
                  Take photo
                </button>
                <button
                  type="button"
                  onClick={handleUploadMediaClick}
                  className="w-full px-3 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                >
                  Upload media
                </button>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleMediaSelected}
          />
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
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

      {isPreviewOpen && pendingAttachment && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md sm:max-w-lg md:max-w-2xl rounded-2xl bg-[#111112] border border-white/15 shadow-2xl p-4 sm:p-6 space-y-4 relative">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="absolute right-3 top-3 text-white/70 hover:text-white text-sm"
              aria-label="Close preview"
            >
              ✕
            </button>
            <div className="space-y-1 pr-6">
              <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">
                {pendingAttachment.type === "video" ? "Video preview" : "Photo preview"}
              </p>
              <p className="text-xs text-white/60 truncate">
                {pendingAttachment.fileName}
              </p>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/15 bg-black/70 max-h-[70vh] flex items-center justify-center">
              {pendingAttachment.type === "video" ? (
                <video
                  src={pendingAttachment.url}
                  controls
                  autoPlay
                  className="w-full h-full max-h-[70vh] object-contain"
                />
              ) : (
                <img
                  src={pendingAttachment.url}
                  alt={pendingAttachment.fileName || "Captured photo"}
                  className="w-full h-full max-h-[70vh] object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {trimState && (
        <div className="fixed inset-0 z-45 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md sm:max-w-lg rounded-2xl bg-[#111112] border border-white/15 shadow-2xl p-4 sm:p-6 space-y-4 relative">
            <button
              type="button"
              onClick={handleTrimCancel}
              className="absolute right-3 top-3 text-white/70 hover:text-white text-sm"
              aria-label="Close trim"
            >
              ✕
            </button>
            <div className="space-y-1 pr-6">
              <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">
                Trim video
              </p>
              <p className="text-xs text-white/60">
                Choose up to 4 seconds to send (total duration{" "}
                {trimState.duration.toFixed(1)}s).
              </p>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/15 bg-black/70">
              <video
                src={trimState.objectUrl}
                controls
                className="w-full max-h-[40vh] object-contain"
              />
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-white/60">
                  <span>Start time: {trimState.startSec.toFixed(1)}s</span>
                  <span>
                    End:{" "}
                    {Math.min(
                      trimState.startSec + trimState.lengthSec,
                      trimState.duration
                    ).toFixed(1)}
                    s
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(
                    0,
                    trimState.duration - trimState.lengthSec
                  )}
                  step={0.1}
                  value={trimState.startSec}
                  onChange={(e) =>
                    handleTrimStartChange(parseFloat(e.target.value))
                  }
                  className="w-full accent-primary"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-white/60">
                  <span>Clip length</span>
                  <span>{trimState.lengthSec.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={Math.min(4, trimState.duration)}
                  step={0.1}
                  value={trimState.lengthSec}
                  onChange={(e) =>
                    handleTrimLengthChange(parseFloat(e.target.value))
                  }
                  className="w-full accent-primary"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleTrimCancel}
                className="px-3 py-1.5 rounded-full border border-white/20 text-xs text-white/70 hover:text-white hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTrimConfirm}
                className="px-4 py-1.5 rounded-full bg-primary text-xs text-white hover:bg-primary/90"
              >
                Use this clip
              </button>
            </div>
          </div>
        </div>
      )}

      {alertState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#111112] border border-white/15 shadow-2xl p-5 space-y-4">
            {alertState.title && (
              <h3 className="text-sm font-semibold text-white">
                {alertState.title}
              </h3>
            )}
            <p className="text-sm text-white/80">{alertState.message}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setAlertState(null)}
                className="px-4 py-1.5 rounded-full bg-primary text-sm text-white hover:bg-primary/90"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
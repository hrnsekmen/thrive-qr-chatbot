 "use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { checkActivityValidity, ActivityStatus } from "@/lib/activity";

const ChatWindow = dynamic(() => import("@/components/ChatWindow"), {
  ssr: false,
});

export default function ChatPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ActivityStatus | "checking">("checking");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const act = (searchParams.get("activity") || "").trim();
      if (!act) {
        if (!cancelled) setStatus("invalid");
        return;
      }
      const result = await checkActivityValidity(act);
      if (!cancelled) {
        setStatus(result);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <main className="h-screen-fixed flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0">
        <div className="max-w-5xl mx-auto px-0 md:px-4 py-0 h-full min-h-0">
          <div className="h-full overflow-hidden relative rounded-none border border-white/10 md:border-0 md:rounded-2xl md:gradient-border md:bg-[#1b1b1c] flex items-center justify-center">
            {status === "checking" && (
              <div className="text-white/70 text-sm">Checking event status…</div>
            )}
            {status === "active" && <ChatWindow />}
            {status === "not_active" && (
              <div className="card mx-4 p-6 md:p-8 text-center space-y-3">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-200">
                  <span className="text-lg leading-none">!</span>
                </div>
                <div className="space-y-1">
                  <h2 className="text-base md:text-lg font-semibold text-white">
                    This event is not currently active
                  </h2>
                  <p className="text-xs md:text-sm text-white/70">
                    Please contact the event organizer or try again later.
                  </p>
                </div>
              </div>
            )}
            {status === "invalid" && (
              <div className="card mx-4 p-6 md:p-8 text-center space-y-3">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 text-red-200">
                  <span className="text-lg leading-none">!</span>
                </div>
                <div className="space-y-1">
                  <h2 className="text-base md:text-lg font-semibold text-white">
                    There’s no such event.
                  </h2>
                  <p className="text-xs md:text-sm text-white/70">
                    The link or QR code seems incorrect. Please check it and try again.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

import dynamic from "next/dynamic";
const ChatWindow = dynamic(() => import("@/components/ChatWindow"), {
  ssr: false,
});

export default function ChatPage() {
  return (
    <main className="h-screen-fixed flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0">
        <div className="max-w-5xl mx-auto px-0 md:px-4 py-0 h-full min-h-0">
          <div className="h-full overflow-hidden relative rounded-none border border-white/10 md:border-0 md:rounded-2xl md:gradient-border md:bg-[#1b1b1c]">
            <ChatWindow />
          </div>
        </div>
      </div>
    </main>
  );
}

import ChatWindow from '@/components/ChatWindow';

export default function ChatPage() {
  return (
    <main className="h-screen-fixed flex flex-col overflow-hidden">
      <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-black/20 border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-sm text-white/80">Chat</span>
          </div>
        </div>
      </header>
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




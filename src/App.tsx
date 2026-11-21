import { useState } from "react";
import { LumaAssistantView } from "./components/assistant/LumaAssistantView.js";
import { ComputerControlCenter } from "./components/computer/ComputerControlCenter.js";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

type ViewMode = "assistant" | "developer" | "chat";

function App() {
  // Phase 1: Unified Assistant is the primary and default view
  const [viewMode, setViewMode] = useState<ViewMode>("assistant");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      content:
        "Hello! I'm Luma. How can I help you today? 🚀 You can switch to the primary LUMA Assistant or inspect tools in Developer Studio anytime!",
    },
  ]);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    const trimmedInput = input.trim();

    if (!trimmedInput || isLoading) {
      return;
    }

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: trimmedInput,
    };

    setMessages((previousMessages) => [...previousMessages, userMessage]);

    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: trimmedInput }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response from assistant.");
      }

      const assistantMessage: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content: data.response || "No response received.",
      };

      setMessages((previousMessages) => [...previousMessages, assistantMessage]);
    } catch (error: unknown) {
      console.error("[Chat Request Error]:", error);

      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred.";

      const fallbackAssistantMessage: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content:
          errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")
            ? "Unable to reach Luma backend. Please make sure the server is running."
            : errorMessage || "Sorry, I couldn't process that request right now.",
      };

      setMessages((previousMessages) => [
        ...previousMessages,
        fallbackAssistantMessage,
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !isLoading) {
      handleSend();
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#08090d] text-gray-100 font-sans antialiased overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0c0e13] md:flex md:flex-col">
        {/* Logo */}
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black font-bold shadow-lg">
            L
          </div>

          <div>
            <h1 className="text-lg font-semibold tracking-wide text-white">Luma</h1>
            <p className="text-xs text-gray-500">Autonomous Assistant</p>
          </div>
        </div>

        {/* Primary Assistant Navigation */}
        <div className="p-4 space-y-1.5 border-b border-white/10">
          <p className="px-2 pb-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-gray-500">
            Assistant
          </p>

          <button
            onClick={() => setViewMode("assistant")}
            className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-medium transition cursor-pointer ${
              viewMode === "assistant"
                ? "bg-white text-black font-semibold shadow-md"
                : "text-gray-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span>⚡</span>
            <span>LUMA Assistant</span>
          </button>
        </div>

        {/* Developer & Testing Navigation */}
        <div className="p-4 space-y-1.5 border-b border-white/10">
          <p className="px-2 pb-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-gray-500">
            Developer & Testing
          </p>

          <button
            onClick={() => setViewMode("developer")}
            className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-medium transition cursor-pointer ${
              viewMode === "developer"
                ? "bg-white text-black font-semibold shadow-md"
                : "text-gray-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span>🛠️</span>
            <span>Developer Tools</span>
          </button>

          <button
            onClick={() => setViewMode("chat")}
            className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-medium transition cursor-pointer ${
              viewMode === "chat"
                ? "bg-white text-black font-semibold shadow-md"
                : "text-gray-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span>💬</span>
            <span>AI Chat (Groq)</span>
          </button>
        </div>

        {/* Status / Session details */}
        <div className="flex-1 px-4 py-4 overflow-y-auto">
          <p className="px-2 py-2 text-[10px] font-mono font-medium uppercase tracking-wider text-gray-600">
            Project Phase
          </p>

          <div className="rounded-xl px-3.5 py-3 text-xs bg-white/5 border border-white/5 space-y-1.5">
            <div className="flex items-center justify-between font-medium text-gray-200">
              <span>Phase 1</span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Active
              </span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Unified Command Interface & Router Architecture
            </p>
          </div>
        </div>

        {/* Assistant & OS Bridge Status */}
        <div className="border-t border-white/10 p-4 space-y-2">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <div className="relative">
              <div className="h-3 w-3 rounded-full bg-emerald-400" />
              <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-30" />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-200">OS Bridge Active</p>
              <p className="text-[10px] text-gray-500">Direct Windows Control</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        {/* Top Header */}
        <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/10 px-5 md:px-8 bg-[#08090d]">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-base font-semibold text-white tracking-wide flex items-center gap-2">
                Luma
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/10 text-gray-400">
                  {viewMode === "assistant"
                    ? "Unified Command Interface"
                    : viewMode === "developer"
                    ? "Developer Tools • Testing Studio"
                    : "AI Chat Assistant"}
                </span>
              </h2>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Ready • Local Computer Bridge Connected
              </div>
            </div>
          </div>

          {/* Mode Switcher Tabs (Header) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl bg-white/5 p-1 border border-white/10">
              <button
                onClick={() => setViewMode("assistant")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                  viewMode === "assistant"
                    ? "bg-white text-black font-semibold shadow"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                ⚡ LUMA Assistant
              </button>
              <button
                onClick={() => setViewMode("developer")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                  viewMode === "developer"
                    ? "bg-white text-black font-semibold shadow"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                🛠️ Developer Tools
              </button>
              <button
                onClick={() => setViewMode("chat")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                  viewMode === "chat"
                    ? "bg-white text-black font-semibold shadow"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                💬 AI Chat
              </button>
            </div>
          </div>
        </header>

        {/* View Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* 1. LUMA Assistant (Primary & Default) */}
          {viewMode === "assistant" && (
            <div className="flex flex-col h-full w-full">
              <LumaAssistantView
                onOpenDeveloperTools={() => setViewMode("developer")}
              />
            </div>
          )}

          {/* 2. Developer Studio (Testing Tools, HUD, Screen Preview, Action Logs) */}
          {viewMode === "developer" && (
            <div className="flex flex-col h-full w-full">
              <ComputerControlCenter />
            </div>
          )}

          {/* 3. AI Chat Pane */}
          {viewMode === "chat" && (
            <div className="flex flex-col h-full w-full">
              {/* Messages */}
              <section className="flex-1 overflow-y-auto px-4 py-6 md:px-8 custom-scrollbar">
                <div className="mx-auto flex max-w-3xl flex-col gap-5">
                  {messages.map((message) => {
                    const isUser = message.role === "user";

                    return (
                      <div
                        key={message.id}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-sm leading-6 shadow-md ${
                            isUser
                              ? "bg-white text-black font-normal"
                              : "border border-white/10 bg-[#111319] text-gray-200"
                          }`}
                        >
                          {!isUser && (
                            <div className="mb-1 text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              Luma
                            </div>
                          )}

                          {message.content}
                        </div>
                      </div>
                    );
                  })}

                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-2xl border border-white/10 bg-[#111319] px-5 py-3.5 text-sm leading-6 text-gray-200">
                        <div className="mb-1 text-xs font-semibold text-gray-500">
                          Luma
                        </div>
                        <div className="flex items-center gap-1.5 py-1">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Input Box */}
              <div className="shrink-0 border-t border-white/10 bg-[#08090d] p-4">
                <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-white/10 bg-[#111319] p-2 shadow-2xl">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    placeholder={isLoading ? "Luma is thinking..." : "Ask Luma anything..."}
                    className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 disabled:opacity-50"
                  />

                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer shadow"
                  >
                    {isLoading ? "Thinking..." : "Send"}
                  </button>
                </div>

                <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-gray-600">
                  Luma AI Assistant • Powered by Groq
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
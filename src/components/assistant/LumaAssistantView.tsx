import React, { useState, useRef, useEffect } from "react";
import { CommandInput } from "./CommandInput.js";
import { ComputerActivityPanel } from "./ComputerActivityPanel.js";
import { AgentExecutionPanel } from "./AgentExecutionPanel.js";
import { AgentStateManager } from "../../agent/agentStateManager.js";
import { processUserCommand } from "../../services/commandHandler.js";
import { useVoiceAssistant } from "../../hooks/useVoiceAssistant.js";
import type { UserCommand, CommandStatus } from "../../types/command.js";

interface LumaAssistantViewProps {
  onOpenDeveloperTools?: () => void;
}

export const LumaAssistantView: React.FC<LumaAssistantViewProps> = ({
  onOpenDeveloperTools,
}) => {
  const [commands, setCommands] = useState<UserCommand[]>([]);
  const [status, setStatus] = useState<CommandStatus>("idle");
  const [statusText, setStatusText] = useState("LUMA is ready");
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [startupEnabled, setStartupEnabled] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Hook into live Always-On voice assistant
  const {
    status: voiceStatus,
    toggleMute,
    toggleTtsMute,
    triggerWakeWord,
  } = useVoiceAssistant((voiceCmd, voiceResp) => {
    // Automatically render voice execution in the chat viewport
    const voiceId = `voice_${Date.now()}`;
    const newCmd: UserCommand = {
      id: voiceId,
      text: voiceCmd,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      status: "completed",
      response: voiceResp || "Voice command completed.",
      activities: [
        {
          id: `act_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          message: `Spoken response: "${voiceResp || 'Completed'}"`,
          status: "completed",
        },
      ],
    };
    setCommands((prev) => [...prev, newCmd]);
  });

  // Query startup configuration
  useEffect(() => {
    fetch("/api/system/startup")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStartupEnabled(data.enabled);
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleStartup = async () => {
    const nextState = !startupEnabled;
    try {
      const res = await fetch("/api/system/startup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable: nextState }),
      });
      const data = await res.json();
      if (data.success) {
        setStartupEnabled(nextState);
      }
    } catch (err) {
      console.error("Failed to update startup configuration:", err);
    }
  };

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [commands, status]);

  const handleCommandSubmit = async (text: string) => {
    setStatus("processing");
    setStatusText("Understanding your command...");

    // Create temporary optimistic command
    const tempId = `cmd_${Date.now()}`;
    const initialCmd: UserCommand = {
      id: tempId,
      text,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      status: "processing",
      activities: [
        {
          id: `act_${Date.now()}_0`,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          message: "Command received",
          status: "completed",
        },
      ],
    };

    setCommands((prev) => [...prev, initialCmd]);

    try {
      const finalCmd = await processUserCommand(text, (updated) => {
        setCommands((prev) =>
          prev.map((c) => (c.id === tempId || c.id === updated.id ? updated : c))
        );
      });

      setCommands((prev) =>
        prev.map((c) => (c.id === tempId || c.id === finalCmd.id ? finalCmd : c))
      );
      setStatus(finalCmd.status);
      setStatusText(
        finalCmd.status === "completed"
          ? (finalCmd.response || "Command completed")
          : "Unable to process command"
      );

      // Reset status indicator back to ready after a short pause
      setTimeout(() => {
        setStatus("idle");
        setStatusText("LUMA is ready");
      }, 5000);
    } catch (err) {
      console.error("[Command Execution Error]:", err);
      setStatus("failed");
      setStatusText("Unable to process command");

      setCommands((prev) =>
        prev.map((c) =>
          c.id === tempId
            ? {
                ...c,
                status: "failed",
                error: "Failed to handle command.",
                response: "Unable to process command at this time.",
              }
            : c
        )
      );

      setTimeout(() => {
        setStatus("idle");
        setStatusText("LUMA is ready");
      }, 4000);
    }
  };

  const statusConfig = {
    idle: {
      dot: "bg-emerald-400",
      ping: "bg-emerald-400/30",
      border: "border-emerald-500/30",
      bg: "bg-emerald-950/30 text-emerald-400",
    },
    processing: {
      dot: "bg-cyan-400",
      ping: "bg-cyan-400/50 animate-ping",
      border: "border-cyan-500/30",
      bg: "bg-cyan-950/30 text-cyan-300",
    },
    completed: {
      dot: "bg-emerald-400",
      ping: "bg-emerald-400/30",
      border: "border-emerald-500/30",
      bg: "bg-emerald-950/30 text-emerald-400",
    },
    failed: {
      dot: "bg-rose-400",
      ping: "bg-rose-400/30",
      border: "border-rose-500/30",
      bg: "bg-rose-950/30 text-rose-400",
    },
  }[status];

  return (
    <div className="flex h-full w-full flex-col bg-[#08090d] text-gray-100 antialiased overflow-hidden">
      {/* Top Assistant Status Ribbon */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0c0e14]/60 px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white font-bold text-xs shadow-inner">
            L
          </div>
          <div>
            <span className="text-xs font-semibold text-white tracking-wide">
              LUMA Assistant
            </span>
            <span className="hidden sm:inline-block ml-2 text-[10px] text-gray-500 font-mono">
              Unified Command Mode
            </span>
          </div>
        </div>

        {/* Right Actions: Voice Assistant Status & Settings */}
        <div className="flex items-center gap-2.5">
          {/* Engine Status Badge */}
          <div
            className={`hidden sm:flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-mono transition-all duration-300 ${statusConfig.border} ${statusConfig.bg}`}
          >
            <div className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${statusConfig.ping}`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${statusConfig.dot}`}
              />
            </div>
            <span>{statusText}</span>
          </div>

          {/* Always-On Voice Status Indicator */}
          <button
            type="button"
            onClick={triggerWakeWord}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-mono transition-all duration-300 cursor-pointer ${
              voiceStatus.isMuted
                ? "border-red-500/30 bg-red-950/30 text-red-400 hover:bg-red-900/40"
                : voiceStatus.state === "RECORDING" || voiceStatus.state === "AWAKE"
                ? "border-rose-500 bg-rose-950/50 text-rose-300 ring-2 ring-rose-500/30 animate-pulse"
                : "border-emerald-500/30 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40"
            }`}
            title="Click to trigger 'Hey Luma' wake word"
          >
            <span className={`h-2 w-2 rounded-full ${
              voiceStatus.isMuted
                ? "bg-red-400"
                : voiceStatus.state === "RECORDING" || voiceStatus.state === "AWAKE"
                ? "bg-rose-400 animate-ping"
                : "bg-emerald-400"
            }`} />
            <span>
              {voiceStatus.isMuted
                ? "Mic Muted"
                : voiceStatus.state === "RECORDING"
                ? "Listening..."
                : voiceStatus.state === "AWAKE"
                ? "Awake"
                : "Say 'Hey Luma'"}
            </span>
          </button>

          {/* Settings Toggle Button */}
          <button
            type="button"
            onClick={() => setShowVoiceSettings(!showVoiceSettings)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Voice & Background Runtime Settings"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Voice & Runtime Settings Drawer / Popover */}
      {showVoiceSettings && (
        <div className="border-b border-white/10 bg-[#0c0e14]/95 px-6 py-4 backdrop-blur-lg">
          <div className="mx-auto max-w-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-semibold text-white tracking-wide">
                LUMA Background & Always-On Voice Runtime
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Local wake-word detection ("Hey Luma") via Windows Speech API. Zero cloud audio streaming.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Windows Startup Toggle */}
              <button
                type="button"
                onClick={handleToggleStartup}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                  startupEnabled
                    ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                    : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
                }`}
              >
                <span>{startupEnabled ? "✓ Startup: On" : "Startup: Off"}</span>
              </button>

              {/* TTS Mute Toggle */}
              <button
                type="button"
                onClick={toggleTtsMute}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                  voiceStatus.isTtsMuted
                    ? "border-amber-500/40 bg-amber-950/40 text-amber-300"
                    : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
                }`}
              >
                <span>{voiceStatus.isTtsMuted ? "🔇 Speech Muted" : "🔊 Speech Active"}</span>
              </button>

              {/* Mic Mute Toggle */}
              <button
                type="button"
                onClick={toggleMute}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                  voiceStatus.isMuted
                    ? "border-red-500/40 bg-red-950/40 text-red-300"
                    : "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                }`}
              >
                <span>{voiceStatus.isMuted ? "Unmute Mic" : "Mute Mic"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Conversation & Task Viewport */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 custom-scrollbar">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {/* Hero Branding Header */}
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-white/20 to-white/5 border border-white/15 text-white font-black text-2xl shadow-xl backdrop-blur-md">
              L
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              LUMA
            </h1>
            <p className="text-xs text-gray-400 font-medium">
              Autonomous Desktop Assistant
            </p>

            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-gray-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{statusText}</span>
            </div>
          </div>

          {/* Empty State / Welcome Screen */}
          {commands.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-[#0e1118]/70 p-7 text-center backdrop-blur-xl shadow-2xl">
              <h2 className="text-base font-semibold text-white sm:text-lg">
                What can I do for you?
              </h2>
              <p className="mx-auto mt-1.5 max-w-md text-xs text-gray-400 leading-relaxed">
                Tell LUMA what you want to do. Type a natural command below to control your computer, open applications, or run tasks.
              </p>

              {/* Suggestions / Examples */}
              <div className="mt-6">
                <p className="text-[10px] font-mono font-medium uppercase tracking-wider text-gray-500 mb-2.5">
                  Try a command
                </p>
                {/* Featured Multi-step Autonomous Agent Goal */}
                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() =>
                      handleCommandSubmit(
                        "Open Chrome, search Amazon for wireless keyboards, open the first result and tell me its price."
                      )
                    }
                    className="w-full rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-blue-950/20 to-purple-950/30 p-3 text-left transition hover:border-cyan-400 hover:bg-cyan-950/60 cursor-pointer shadow-lg group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        Autonomous Agent Execution Loop
                      </span>
                      <span className="text-[10px] font-mono text-cyan-300/70 group-hover:text-cyan-200">
                        Try goal ➔
                      </span>
                    </div>
                    <p className="text-xs text-white font-medium">
                      "Open Chrome, search Amazon for wireless keyboards, open the first result and tell me its price."
                    </p>
                  </button>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "Luma, inspect my current computer state.",
                    "Chrome kholo aur Amazon pe keyboard search karo",
                    "search Amazon for keyboards",
                    "open downloads",
                    "create folder called Luma",
                    "take a screenshot",
                    "what window is active?",
                  ].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => handleCommandSubmit(example)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/25 hover:bg-white/10 hover:text-white cursor-pointer"
                    >
                      "{example}"
                    </button>
                  ))}
                </div>
              </div>

              {/* Notice of separation */}
              <div className="mt-6 border-t border-white/5 pt-4 text-center">
                <p className="text-[11px] text-gray-500">
                  Direct tool testing & telemetry HUD available in{" "}
                  <button
                    type="button"
                    onClick={onOpenDeveloperTools}
                    className="text-gray-300 underline underline-offset-2 hover:text-white cursor-pointer"
                  >
                    Developer Tools
                  </button>
                  .
                </p>
              </div>
            </div>
          ) : (
            /* Conversation & Activity History */
            <div className="space-y-6">
              {commands.map((cmd) => (
                <div key={cmd.id} className="space-y-3">
                  {/* User Command Bubble */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-white px-5 py-3.5 text-sm text-black shadow-lg">
                      <div className="mb-1 flex items-center justify-between gap-4 text-[10px] font-mono text-gray-500">
                        <span className="font-semibold uppercase">You</span>
                        <span>{cmd.timestamp}</span>
                      </div>
                      <p className="font-normal text-sm leading-relaxed whitespace-pre-wrap">
                        {cmd.text}
                      </p>
                    </div>
                  </div>

                  {/* LUMA Assistant Response Bubble */}
                  <div className="flex justify-start">
                    <div className="w-full max-w-[85%] rounded-2xl border border-white/10 bg-[#0e1118]/90 px-5 py-3.5 text-sm text-gray-200 shadow-xl backdrop-blur-md">
                      <div className="mb-1.5 flex items-center justify-between text-[10px] font-mono text-gray-400">
                        <div className="flex items-center gap-1.5 font-semibold text-white">
                          <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          <span>LUMA</span>
                        </div>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-gray-300">
                          {cmd.status === "processing"
                            ? "Processing..."
                            : cmd.status === "completed"
                            ? "Command received"
                            : "Failed"}
                        </span>
                      </div>

                      {cmd.response?.startsWith("COMPUTER OBSERVATION") ? (
                        <div className="mt-2 rounded-xl border border-cyan-500/20 bg-[#0a0d14] p-4 font-mono text-xs leading-relaxed text-gray-200 whitespace-pre-wrap shadow-inner border-l-4 border-l-cyan-400">
                          {cmd.response}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                          {cmd.response ||
                            (cmd.status === "processing"
                              ? "Understanding your command..."
                              : "Command registered.")}
                        </p>
                      )}

                      {/* Autonomous Agent Execution Panel if taskPlan is present */}
                      {cmd.taskPlan ? (
                        <AgentExecutionPanel
                          plan={cmd.taskPlan}
                          onStop={() => AgentStateManager.stopTask()}
                        />
                      ) : (
                        /* Computer Activity Panel for single-shot / standard commands */
                        <ComputerActivityPanel
                          activities={cmd.activities}
                          debugInfo={cmd.debugInfo}
                          defaultOpen={true}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>
          )}
        </div>
      </div>

      {/* Docked Command Input Area */}
      <div className="shrink-0 border-t border-white/10 bg-[#08090d]/90 p-4 md:p-6 backdrop-blur-lg">
        <div className="mx-auto max-w-3xl">
          <CommandInput
            onSubmit={handleCommandSubmit}
            disabled={status === "processing"}
            placeholder="Tell LUMA what you want to do... (e.g., 'Amazon pe keyboard search karo', 'open downloads')"
            voiceStatus={voiceStatus}
            onTriggerVoice={triggerWakeWord}
            onToggleMute={toggleMute}
          />
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-gray-600 px-1">
            <span>LUMA Autonomous Desktop Agent • General Desktop Control</span>
            <span className="font-mono text-emerald-400/80">Deterministic Engine Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from "react";
import { CommandInput } from "./CommandInput.js";
import { ComputerActivityPanel } from "./ComputerActivityPanel.js";
import { AgentExecutionPanel } from "./AgentExecutionPanel.js";
import { AgentStateManager } from "../../agent/agentStateManager.js";
import { processUserCommand } from "../../services/commandHandler.js";
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
  const chatBottomRef = useRef<HTMLDivElement>(null);

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

        {/* Real-time Status Badge */}
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-mono transition-all duration-300 ${statusConfig.border} ${statusConfig.bg}`}
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
      </div>

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

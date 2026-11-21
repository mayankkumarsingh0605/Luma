import React from "react";
import type { ComputerState } from "../../types/computer.js";

interface LiveStateHudProps {
  state: ComputerState | null;
  isLoading: boolean;
  isExecuting: boolean;
  lastStatus?: "IDLE" | "EXECUTING" | "SUCCESS" | "ERROR";
  onRefresh: () => void;
}

export const LiveStateHud: React.FC<LiveStateHudProps> = ({
  state,
  isLoading,
  isExecuting,
  lastStatus = "IDLE",
  onRefresh,
}) => {
  const currentStatus = isExecuting ? "EXECUTING" : lastStatus;

  const statusConfig = {
    IDLE: {
      color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      dot: "bg-emerald-400",
      label: "SYSTEM READY",
    },
    EXECUTING: {
      color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
      dot: "bg-cyan-400 animate-ping",
      label: "EXECUTING ACTION",
    },
    SUCCESS: {
      color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      dot: "bg-emerald-400",
      label: "ACTION COMPLETED",
    },
    ERROR: {
      color: "bg-rose-500/20 text-rose-400 border-rose-500/30",
      dot: "bg-rose-400",
      label: "EXECUTION ERROR",
    },
  }[currentStatus];

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e1118]/80 p-5 backdrop-blur-md shadow-xl">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white shadow-inner">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
              LIVE COMPUTER STATE
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-white/10 text-gray-300">
                Direct OS Bridge
              </span>
            </h3>
            <p className="text-xs text-gray-400">
              Real-time hardware & operating system telemetry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Badge */}
          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-mono font-medium transition-all ${statusConfig.color}`}
          >
            <span className={`h-2 w-2 rounded-full ${statusConfig.dot}`} />
            {statusConfig.label}
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh System State"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 transition hover:bg-white/10 disabled:opacity-50"
          >
            <svg
              className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{isLoading ? "Syncing..." : "Sync"}</span>
          </button>
        </div>
      </div>

      {/* Grid of metrics */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Metric 1: OS */}
        <div className="rounded-xl border border-white/5 bg-black/30 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Operating System
          </div>
          <div className="mt-1 font-mono text-sm font-semibold text-gray-100 truncate">
            {state?.os ? `${state.os.platform} (${state.os.arch})` : "Windows x64"}
          </div>
          <div className="text-[10px] text-gray-400 truncate">
            Host: {state?.os?.hostname || "Local Machine"}
          </div>
        </div>

        {/* Metric 2: Active Window */}
        <div className="rounded-xl border border-white/5 bg-black/30 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Active Window
          </div>
          <div
            className="mt-1 font-mono text-sm font-semibold text-cyan-300 truncate"
            title={state?.activeWindow?.title || "No Window"}
          >
            {state?.activeWindow?.title || "Desktop / Background"}
          </div>
          <div className="text-[10px] text-gray-400 truncate">
            Proc: {state?.activeWindow?.processName || "System"} (PID:{" "}
            {state?.activeWindow?.processId ?? 0})
          </div>
        </div>

        {/* Metric 3: Display */}
        <div className="rounded-xl border border-white/5 bg-black/30 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Display Resolution
          </div>
          <div className="mt-1 font-mono text-sm font-semibold text-gray-100">
            {state?.screen ? `${state.screen.width} × ${state.screen.height}` : "1920 × 1080"}
          </div>
          <div className="text-[10px] text-emerald-400/80">Primary Screen Active</div>
        </div>

        {/* Metric 4: Mouse Pos */}
        <div className="rounded-xl border border-white/5 bg-black/30 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Cursor Position
          </div>
          <div className="mt-1 font-mono text-sm font-semibold text-emerald-400">
            {state?.mouse ? `X: ${state.mouse.x}  Y: ${state.mouse.y}` : "X: 0  Y: 0"}
          </div>
          <div className="text-[10px] text-gray-400">Pixel Coordinates</div>
        </div>
      </div>
    </div>
  );
};

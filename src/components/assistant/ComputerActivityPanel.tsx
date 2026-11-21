import React, { useState } from "react";
import type { ActivityEvent, RouterDebugInfo } from "../../types/command.js";

interface ComputerActivityPanelProps {
  activities?: ActivityEvent[];
  debugInfo?: RouterDebugInfo;
  defaultOpen?: boolean;
}

export const ComputerActivityPanel: React.FC<ComputerActivityPanelProps> = ({
  activities = [],
  debugInfo,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [showDebug, setShowDebug] = useState(false);

  if ((!activities || activities.length === 0) && !debugInfo) {
    return null;
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-[#0a0d14]/70 p-3.5 backdrop-blur-md">
      {/* Accordion header */}
      <div className="flex w-full items-center justify-between">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 text-left cursor-pointer group"
        >
          <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-gray-400 group-hover:text-gray-200 transition">
            Computer Activity
          </span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">
            {activities.length} event{activities.length === 1 ? "" : "s"}
          </span>
          <svg
            className={`h-3.5 w-3.5 text-gray-500 transition-transform duration-200 group-hover:text-gray-300 ${
              isOpen ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {debugInfo && (
          <button
            type="button"
            onClick={() => setShowDebug(!showDebug)}
            className="text-[10px] font-mono px-2 py-0.5 rounded border border-white/10 bg-white/5 text-gray-400 hover:text-white transition cursor-pointer"
          >
            {showDebug ? "Hide Telemetry" : "Show Telemetry"}
          </button>
        )}
      </div>

      {/* Activity items */}
      {isOpen && (
        <div className="mt-3 space-y-2 border-t border-white/5 pt-2.5">
          {activities.map((act) => {
            const statusColor =
              act.status === "completed"
                ? "bg-emerald-400 text-emerald-400"
                : act.status === "in-progress"
                ? "bg-cyan-400 text-cyan-400 animate-ping"
                : act.status === "failed"
                ? "bg-rose-400 text-rose-400"
                : "bg-amber-400 text-amber-400";

            return (
              <div
                key={act.id}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2">
                  <div className="relative mt-1">
                    <div className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
                  </div>
                  <span className="text-gray-300 font-mono text-[11px]">
                    {act.message}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-gray-600 shrink-0">
                  {act.timestamp}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Debug Telemetry Details */}
      {showDebug && debugInfo && (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[11px] text-gray-300 space-y-1.5">
          <div className="flex items-center justify-between border-b border-white/5 pb-1">
            <span className="text-gray-500 font-semibold uppercase text-[9px] tracking-wider">
              Command Router Debug Info
            </span>
            <span
              className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                debugInfo.result === "success"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : debugInfo.result === "failure"
                  ? "bg-rose-500/20 text-rose-400"
                  : "bg-amber-500/20 text-amber-400"
              }`}
            >
              {debugInfo.result || "unknown"}
            </span>
          </div>
          <div>
            <span className="text-gray-500">RAW COMMAND:    </span>
            <span className="text-gray-200 font-semibold">"{debugInfo.rawCommand}"</span>
          </div>
          <div>
            <span className="text-gray-500">NORMALIZED:     </span>
            <span className="text-gray-200">"{debugInfo.normalizedCommand}"</span>
          </div>
          {debugInfo.matchedRule && (
            <div>
              <span className="text-gray-500">MATCHED RULE:   </span>
              <span className="text-yellow-400">{debugInfo.matchedRule}</span>
            </div>
          )}
          <div>
            <span className="text-gray-500">MATCHED INTENT: </span>
            <span className="text-cyan-400">{debugInfo.matchedIntent}</span>
          </div>
          <div>
            <span className="text-gray-500">ARGUMENTS:      </span>
            <span className="text-emerald-300">{JSON.stringify(debugInfo.arguments)}</span>
          </div>
          <div>
            <span className="text-gray-500">TOOL:           </span>
            <span className="text-purple-300">{debugInfo.tool || "none"}</span>
          </div>
        </div>
      )}
    </div>
  );
};

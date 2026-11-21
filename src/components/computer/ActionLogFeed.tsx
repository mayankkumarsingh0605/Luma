import React, { useState } from "react";
import type { ActionLogEntry } from "../../types/computer.js";

interface ActionLogFeedProps {
  logs: ActionLogEntry[];
  isLoading: boolean;
  onClearLogs: () => void;
  onRefreshLogs: () => void;
}

export const ActionLogFeed: React.FC<ActionLogFeedProps> = ({
  logs,
  isLoading,
  onClearLogs,
  onRefreshLogs,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e1118]/80 p-5 backdrop-blur-md shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
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
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
              ACTION EXECUTION LOG
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-mono text-gray-300">
                {logs.length} {logs.length === 1 ? "entry" : "entries"}
              </span>
            </h3>
            <p className="text-xs text-gray-400">
              Audit trail of all operating system actions triggered by LUMA
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshLogs}
            disabled={isLoading}
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-gray-300 hover:bg-white/10 disabled:opacity-50"
            title="Refresh logs"
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
          </button>

          {logs.length > 0 && (
            <button
              onClick={onClearLogs}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/10 hover:text-rose-300"
            >
              Clear Log
            </button>
          )}
        </div>
      </div>

      {/* Log Feed List */}
      <div className="mt-4 max-h-[320px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {logs.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-center">
            <p className="text-xs text-gray-500 font-mono">
              No actions recorded yet.
            </p>
            <p className="text-[11px] text-gray-600 mt-1">
              Trigger a tool from the Testing Studio to view execution history.
            </p>
          </div>
        ) : (
          logs.map((entry) => {
            const isSuccess = entry.status === "SUCCESS";
            const isExpanded = expandedId === entry.id;
            const timeStr = new Date(entry.timestamp).toLocaleTimeString();

            return (
              <div
                key={entry.id}
                onClick={() => toggleExpand(entry.id)}
                className={`group rounded-xl border transition cursor-pointer ${
                  isExpanded
                    ? "border-white/20 bg-black/60 shadow-lg"
                    : "border-white/5 bg-black/30 hover:border-white/15 hover:bg-black/40"
                }`}
              >
                {/* Summary Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        isSuccess
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                      }`}
                    >
                      {isSuccess ? "✓" : "✕"}
                    </span>

                    <span className="font-mono text-xs font-semibold text-gray-200">
                      {entry.tool}
                    </span>

                    {/* Arguments snippet */}
                    {Object.keys(entry.arguments).length > 0 && (
                      <span className="hidden sm:inline-block truncate font-mono text-[11px] text-gray-400 max-w-[200px]">
                        {JSON.stringify(entry.arguments)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-gray-400">
                      {entry.durationMs}ms
                    </span>
                    <span className="font-mono text-[10px] text-gray-400">
                      {timeStr}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                        isSuccess
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-rose-500/10 text-rose-400"
                      }`}
                    >
                      {entry.status}
                    </span>
                  </div>
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div className="border-t border-white/10 bg-black/50 p-3 text-xs font-mono">
                    <div className="mb-2">
                      <span className="text-gray-400 font-semibold uppercase text-[10px]">
                        Arguments:
                      </span>
                      <pre className="mt-1 rounded-lg bg-black/60 p-2 text-gray-300 overflow-x-auto">
                        {JSON.stringify(entry.arguments, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <span className="text-gray-400 font-semibold uppercase text-[10px]">
                        {isSuccess ? "Result:" : "Error:"}
                      </span>
                      <pre
                        className={`mt-1 rounded-lg p-2 overflow-x-auto ${
                          isSuccess
                            ? "bg-emerald-950/20 text-emerald-300 border border-emerald-900/30"
                            : "bg-rose-950/20 text-rose-300 border border-rose-900/30"
                        }`}
                      >
                        {isSuccess
                          ? typeof entry.result === "string"
                            ? entry.result
                            : JSON.stringify(entry.result, null, 2)
                          : entry.error}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

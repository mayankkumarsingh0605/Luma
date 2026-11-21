import React, { useEffect, useState } from "react";
import { AgentStateManager } from "../../agent/agentStateManager.js";
import type { AgentState, TaskPlan } from "../../agent/agentTypes.js";

interface AgentExecutionPanelProps {
  plan?: TaskPlan | null;
  state?: AgentState | null;
  onStop?: () => void;
}

export const AgentExecutionPanel: React.FC<AgentExecutionPanelProps> = ({
  plan: propPlan,
  state: propState,
  onStop,
}) => {
  const [liveState, setLiveState] = useState<AgentState>(propState || AgentStateManager.getState());
  const [livePlan, setLivePlan] = useState<TaskPlan | null>(propPlan || AgentStateManager.getPlan());

  useEffect(() => {
    const unsubscribe = AgentStateManager.subscribe((state, plan) => {
      setLiveState(state);
      setLivePlan(plan);
    });
    return unsubscribe;
  }, []);

  const plan = propPlan || livePlan;
  const state = propState || liveState;

  if (!plan) return null;

  const isCurrentTask = state.task_id === plan.id;
  const isRunning = isCurrentTask && state.status === "running";
  const isStopped = isCurrentTask && state.status === "stopped";
  const isCompleted =
    plan.finalResult != null ||
    (isCurrentTask && state.status === "completed") ||
    plan.steps.every((s) => s.status === "success");
  const isFailed =
    !isCompleted &&
    !isRunning &&
    !isStopped &&
    ((isCurrentTask && state.status === "failed") || plan.steps.some((s) => s.status === "failed"));

  const handleStop = () => {
    AgentStateManager.stopTask();
    if (onStop) onStop();
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0f17]/80 backdrop-blur-xl shadow-2xl">
      {/* Top Banner: Status + Stop Button */}
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-2.5 w-2.5">
            {isRunning && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                isRunning
                  ? "bg-cyan-400"
                  : isCompleted
                  ? "bg-emerald-400"
                  : isStopped
                  ? "bg-amber-400"
                  : "bg-rose-400"
              }`}
            />
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-wide text-white uppercase font-mono">
              Computer Agent Execution Loop
            </h4>
            <p className="text-[10px] text-gray-400">
              {isRunning
                ? `Executing step ${state.current_step} of ${state.total_steps}`
                : isCompleted
                ? "All goals executed and verified"
                : isStopped
                ? "Execution stopped by user"
                : isFailed
                ? "Execution stopped due to error"
                : "Ready"}
            </p>
          </div>
        </div>

        {/* Stop Task Action Button */}
        {isRunning && (
          <button
            type="button"
            onClick={handleStop}
            className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 transition hover:bg-rose-500 hover:text-white cursor-pointer active:scale-95 shadow-sm"
          >
            <span className="h-2 w-2 rounded-xs bg-rose-500" />
            <span>Stop Task</span>
          </button>
        )}
      </div>

      {/* Current Action Callout */}
      {plan.currentAction && isRunning && (
        <div className="border-b border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-transparent px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 animate-pulse">
              ⚡ CURRENT ACTION:
            </span>
            <span className="text-gray-100 font-medium">{plan.currentAction}</span>
          </div>
        </div>
      )}

      {/* High-level Task Plan Steps */}
      <div className="p-4 space-y-2.5">
        <div className="flex items-center justify-between pb-1 border-b border-white/5 text-[10px] font-mono uppercase tracking-wider text-gray-500">
          <span>Agent Plan & Goals</span>
          <span>Status</span>
        </div>

        {plan.steps.map((step) => {
          const isCurrent = step.status === "running";
          const isDone = step.status === "success";
          const isRetrying = step.status === "retrying";
          const isStepFailed = step.status === "failed";

          return (
            <div
              key={step.step}
              className={`flex items-start justify-between gap-3 rounded-xl p-2.5 text-xs transition-all duration-200 ${
                isCurrent
                  ? "border border-cyan-500/30 bg-cyan-950/20 shadow-sm"
                  : isDone
                  ? "bg-white/[0.02]"
                  : "opacity-70"
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="mt-0.5 shrink-0">
                  {isDone ? (
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : isCurrent ? (
                    <div className="flex h-4 w-4 items-center justify-center">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                    </div>
                  ) : isRetrying ? (
                    <div className="flex h-4 w-4 items-center justify-center text-amber-400 font-mono text-[10px]">
                      ⟳
                    </div>
                  ) : isStepFailed ? (
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 font-bold text-[10px]">
                      ✗
                    </div>
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-white/20 text-center font-mono text-[9px] text-gray-500 leading-4">
                      {step.step}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <p
                    className={`font-medium text-xs truncate ${
                      isDone ? "text-gray-300" : isCurrent ? "text-white font-semibold" : "text-gray-400"
                    }`}
                  >
                    {step.goal}
                  </p>
                  {step.resultMessage && (
                    <p className="mt-0.5 text-[11px] text-emerald-400/90 font-mono truncate">
                      {step.resultMessage}
                    </p>
                  )}
                  {step.error && (
                    <p className="mt-0.5 text-[11px] text-rose-400 font-mono truncate">
                      {step.error}
                    </p>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-wider ${
                    isDone
                      ? "bg-emerald-500/10 text-emerald-400"
                      : isCurrent
                      ? "bg-cyan-500/20 text-cyan-300 animate-pulse"
                      : isRetrying
                      ? "bg-amber-500/20 text-amber-400"
                      : isStepFailed
                      ? "bg-rose-500/20 text-rose-400"
                      : "bg-white/5 text-gray-500"
                  }`}
                >
                  {step.status}
                </span>
                {step.durationMs && isDone && (
                  <p className="mt-0.5 text-[9px] font-mono text-gray-600">
                    {(step.durationMs / 1000).toFixed(1)}s
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Final Result Card */}
      {plan.finalResult && (
        <div className="border-t border-emerald-500/30 bg-emerald-950/20 p-4">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider font-mono">
            <span>✓ TASK COMPLETE</span>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-black/40 p-3.5 space-y-2">
            {plan.finalResult.productTitle && (
              <div>
                <p className="text-[10px] uppercase font-mono text-gray-500">Product</p>
                <p className="text-xs font-semibold text-gray-100">{plan.finalResult.productTitle}</p>
              </div>
            )}

            {plan.finalResult.price && (
              <div className="flex items-baseline gap-2 pt-1 border-t border-white/5">
                <span className="text-[10px] uppercase font-mono text-gray-500">Price:</span>
                <span className="text-base font-bold text-emerald-400 font-mono">
                  {plan.finalResult.price}
                </span>
                {plan.finalResult.currency && (
                  <span className="text-[10px] font-mono text-gray-500">
                    ({plan.finalResult.currency})
                  </span>
                )}
              </div>
            )}

            {plan.finalResult.url && (
              <div className="pt-1 text-[10px] font-mono text-gray-500 truncate">
                <span>URL: </span>
                <a
                  href={plan.finalResult.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 underline hover:text-cyan-300"
                >
                  {plan.finalResult.url}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

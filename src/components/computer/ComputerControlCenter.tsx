import React, { useState, useEffect, useCallback } from "react";
import { LiveStateHud } from "./LiveStateHud.js";
import { ToolTestingStudio } from "./ToolTestingStudio.js";
import { ScreenPreview } from "./ScreenPreview.js";
import { ActionLogFeed } from "./ActionLogFeed.js";
import type {
  AppDefinition,
  ToolDefinition,
  ComputerState,
  ActionLogEntry,
  ScreenshotData,
} from "../../types/computer.js";

interface ComputerControlCenterProps {
  onNotify?: (message: string, type: "success" | "error" | "info") => void;
}

export const ComputerControlCenter: React.FC<ComputerControlCenterProps> = ({
  onNotify,
}) => {
  // State
  const [computerState, setComputerState] = useState<ComputerState | null>(null);
  const [apps, setApps] = useState<AppDefinition[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [screenshot, setScreenshot] = useState<ScreenshotData | null>(null);

  // Loading states
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [isCapturingScreen, setIsCapturingScreen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastStatus, setLastStatus] = useState<"IDLE" | "EXECUTING" | "SUCCESS" | "ERROR">("IDLE");

  // Inline feedback toast
  const [feedback, setFeedback] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showFeedback = useCallback(
    (text: string, type: "success" | "error" | "info") => {
      setFeedback({ text, type });
      if (onNotify) onNotify(text, type);
      setTimeout(() => setFeedback(null), 4000);
    },
    [onNotify]
  );

  // Fetch Live State
  const fetchState = useCallback(async () => {
    setIsLoadingState(true);
    try {
      const res = await fetch("/api/computer/state");
      if (!res.ok) throw new Error("Failed to fetch state");
      const data = await res.json();
      setComputerState(data);
    } catch (err: any) {
      console.error("[Fetch State Error]:", err);
    } finally {
      setIsLoadingState(false);
    }
  }, []);

  // Fetch Tools and Apps
  const fetchMetadata = useCallback(async () => {
    try {
      const [toolsRes, appsRes] = await Promise.all([
        fetch("/api/computer/tools"),
        fetch("/api/computer/apps"),
      ]);

      if (toolsRes.ok) {
        const toolsData = await toolsRes.json();
        setTools(toolsData.tools || []);
      }
      if (appsRes.ok) {
        const appsData = await appsRes.json();
        setApps(appsData.apps || []);
      }
    } catch (err) {
      console.error("[Fetch Metadata Error]:", err);
    }
  }, []);

  // Fetch Logs
  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/computer/logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error("[Fetch Logs Error]:", err);
    }
  }, []);

  // Capture Screenshot
  const captureScreen = useCallback(async () => {
    setIsCapturingScreen(true);
    try {
      const res = await fetch("/api/computer/screenshot");
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to capture screenshot.");
      }

      setScreenshot(data.screenshot);
      showFeedback("Screen capture updated successfully.", "success");
    } catch (err: any) {
      console.error("[Screenshot Error]:", err);
      showFeedback(err?.message || "Failed to capture screenshot.", "error");
    } finally {
      setIsCapturingScreen(false);
    }
  }, [showFeedback]);

  // Execute Tool
  const handleExecuteTool = async (
    toolName: string,
    args: Record<string, any> = {}
  ): Promise<any> => {
    setIsExecuting(true);
    setLastStatus("EXECUTING");

    try {
      const res = await fetch("/api/computer/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolName, arguments: args }),
      });

      const data = await res.json();

      if (data.success) {
        setLastStatus("SUCCESS");
        const msg =
          typeof data.result === "string"
            ? data.result
            : data.result?.message || `Executed ${toolName} successfully.`;
        showFeedback(msg, "success");

        // Refresh state and screenshot if relevant
        if (toolName === "take_screenshot" && data.result) {
          setScreenshot(data.result);
        } else {
          setTimeout(() => {
            fetchState();
            fetchLogs();
          }, 300);
        }

        return data.result;
      } else {
        setLastStatus("ERROR");
        showFeedback(data.error || `Execution failed for tool ${toolName}.`, "error");
        setTimeout(fetchLogs, 300);
        return null;
      }
    } catch (err: any) {
      setLastStatus("ERROR");
      const errMsg = err?.message || "Network error while executing tool.";
      showFeedback(errMsg, "error");
      return null;
    } finally {
      setIsExecuting(false);
    }
  };

  // Clear Logs
  const handleClearLogs = async () => {
    try {
      await fetch("/api/computer/logs/clear", { method: "POST" });
      setLogs([]);
      showFeedback("Action logs cleared.", "info");
    } catch (err) {
      console.error("[Clear Logs Error]:", err);
    }
  };

  // Initial load
  useEffect(() => {
    fetchState();
    fetchMetadata();
    fetchLogs();
  }, [fetchState, fetchMetadata, fetchLogs]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 custom-scrollbar">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Floating feedback alert */}
        {feedback && (
          <div
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-3 shadow-2xl backdrop-blur-xl transition-all duration-300 animate-slide-up ${
              feedback.type === "success"
                ? "border-emerald-500/30 bg-emerald-950/80 text-emerald-200"
                : feedback.type === "error"
                ? "border-rose-500/30 bg-rose-950/80 text-rose-200"
                : "border-white/20 bg-black/80 text-gray-200"
            }`}
          >
            <span className="text-base">
              {feedback.type === "success" ? "✓" : feedback.type === "error" ? "✕" : "ℹ"}
            </span>
            <span className="text-xs font-mono font-medium">{feedback.text}</span>
          </div>
        )}

        {/* 1. Live Telemetry HUD */}
        <LiveStateHud
          state={computerState}
          isLoading={isLoadingState}
          isExecuting={isExecuting}
          lastStatus={lastStatus}
          onRefresh={fetchState}
        />

        {/* 2. Tool Testing Studio */}
        <ToolTestingStudio
          apps={apps}
          tools={tools}
          isExecuting={isExecuting}
          onExecuteTool={handleExecuteTool}
        />

        {/* 3. Screen Monitor & Action Log Feed Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: Screen Preview */}
          <ScreenPreview
            screenshot={screenshot}
            isLoading={isCapturingScreen}
            onRefresh={captureScreen}
          />

          {/* Right: Action History */}
          <ActionLogFeed
            logs={logs}
            isLoading={false}
            onClearLogs={handleClearLogs}
            onRefreshLogs={fetchLogs}
          />
        </div>
      </div>
    </div>
  );
};

import { useState, useEffect, useCallback } from "react";

export type VoiceState =
  | "INITIALIZING"
  | "LISTENING"
  | "AWAKE"
  | "RECORDING"
  | "PROCESSING"
  | "RESPONDING"
  | "MUTED"
  | "ERROR";

export interface VoiceStatus {
  state: VoiceState;
  isMuted: boolean;
  isTtsMuted: boolean;
  activeVoice: string;
  lastWakeWord?: string;
  lastCommand?: string;
  lastResponse?: string;
  lastError?: string;
}

export function useVoiceAssistant(onCommandExecuted?: (cmd: string, response?: string) => void) {
  const [status, setStatus] = useState<VoiceStatus>({
    state: "INITIALIZING",
    isMuted: false,
    isTtsMuted: false,
    activeVoice: "Default",
  });

  // Fetch initial status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/voice/status");
      if (res.ok) {
        const data = await res.json();
        setStatus((prev) => ({ ...prev, ...data }));
      }
    } catch {
      // Backend may be starting
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Connect to Server-Sent Events stream for real-time voice updates
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/voice/events");

      eventSource.addEventListener("state", (e) => {
        try {
          const data = JSON.parse(e.data);
          setStatus((prev) => ({ ...prev, ...data }));
        } catch {}
      });

      eventSource.addEventListener("wake", (e) => {
        try {
          const data = JSON.parse(e.data);
          setStatus((prev) => ({ ...prev, state: "AWAKE", lastWakeWord: data.keyword }));
        } catch {}
      });

      eventSource.addEventListener("command", (e) => {
        try {
          const data = JSON.parse(e.data);
          setStatus((prev) => ({ ...prev, state: "PROCESSING", lastCommand: data.text }));
        } catch {}
      });

      eventSource.addEventListener("response", (e) => {
        try {
          const data = JSON.parse(e.data);
          setStatus((prev) => ({
            ...prev,
            state: "RESPONDING",
            lastResponse: data.response,
          }));
          if (onCommandExecuted) {
            onCommandExecuted(data.command, data.response);
          }
        } catch {}
      });

      eventSource.addEventListener("mute", (e) => {
        try {
          const data = JSON.parse(e.data);
          setStatus((prev) => ({
            ...prev,
            isMuted: data.isMuted,
            state: data.isMuted ? "MUTED" : "LISTENING",
          }));
        } catch {}
      });

      eventSource.addEventListener("ttsMute", (e) => {
        try {
          const data = JSON.parse(e.data);
          setStatus((prev) => ({ ...prev, isTtsMuted: data.isTtsMuted }));
        } catch {}
      });

      eventSource.onerror = () => {
        eventSource?.close();
      };
    } catch {
      // Fallback: poll every 3s if SSE unsupported
      const interval = setInterval(fetchStatus, 3000);
      return () => clearInterval(interval);
    }

    return () => {
      eventSource?.close();
    };
  }, [fetchStatus, onCommandExecuted]);

  const toggleMute = async () => {
    const nextMuted = !status.isMuted;
    try {
      await fetch("/api/voice/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muted: nextMuted }),
      });
      setStatus((prev) => ({
        ...prev,
        isMuted: nextMuted,
        state: nextMuted ? "MUTED" : "LISTENING",
      }));
    } catch (err) {
      console.error("Failed to toggle mute:", err);
    }
  };

  const toggleTtsMute = async () => {
    const nextMuted = !status.isTtsMuted;
    try {
      await fetch("/api/voice/tts-mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muted: nextMuted }),
      });
      setStatus((prev) => ({ ...prev, isTtsMuted: nextMuted }));
    } catch (err) {
      console.error("Failed to toggle voice response mute:", err);
    }
  };

  const triggerWakeWord = async () => {
    try {
      await fetch("/api/voice/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: "Hey Luma" }),
      });
      setStatus((prev) => ({ ...prev, state: "AWAKE" }));
    } catch (err) {
      console.error("Failed to trigger wake word:", err);
    }
  };

  return {
    status,
    toggleMute,
    toggleTtsMute,
    triggerWakeWord,
    fetchStatus,
  };
}

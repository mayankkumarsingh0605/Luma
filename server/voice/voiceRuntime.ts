import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import path from "path";
import { EventEmitter } from "events";
import { routeCommand } from "../../src/router/commandRouter.js";
import { WorkflowEngine } from "../../src/workflows/workflowEngine.js";
import { ComputerStateManager } from "../../src/state/computerState.js";
import { TaskPlanner } from "../../src/agent/taskPlanner.js";
import { AgentExecutionLoop } from "../../src/agent/agentExecutionLoop.js";
import type { WorkflowContext, WorkflowResult } from "../../src/workflows/types.js";

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

export class VoiceRuntimeManager extends EventEmitter {
  private static instance: VoiceRuntimeManager | null = null;
  private workerProcess: ChildProcessWithoutNullStreams | null = null;
  private state: VoiceState = "INITIALIZING";
  private isMuted: boolean = false;
  private isTtsMuted: boolean = false;
  private activeVoice: string = "Default";
  private lastWakeWord?: string;
  private lastCommand?: string;
  private lastResponse?: string;
  private lastError?: string;
  private followUpTimer?: NodeJS.Timeout;
  private wakeTimeoutTimer?: NodeJS.Timeout;
  private sseClients: Set<(event: string, data: any) => void> = new Set();
  private autoRestart: boolean = true;
  private activeContextualTarget?: string;

  private constructor() {
    super();
  }

  static getInstance(): VoiceRuntimeManager {
    if (!this.instance) {
      this.instance = new VoiceRuntimeManager();
    }
    return this.instance;
  }

  /**
   * Starts the background voice worker process.
   */
  async start(): Promise<void> {
    if (this.workerProcess) {
      return;
    }

    console.log("[VoiceRuntime] Starting Windows native voice engine worker...");
    const scriptPath = path.resolve(process.cwd(), "server/voice/scripts/voiceWorker.ps1");

    try {
      this.workerProcess = spawn("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
      ]);

      this.workerProcess.stdout.on("data", (data: Buffer) => {
        const lines = data.toString("utf-8").split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          this.handleWorkerOutput(line);
        }
      });

      this.workerProcess.stderr.on("data", (data: Buffer) => {
        const errStr = data.toString("utf-8").trim();
        if (errStr) {
          console.error("[VoiceWorker Error]:", errStr);
        }
      });

      this.workerProcess.on("close", (code: number) => {
        console.log(`[VoiceRuntime] Worker process exited with code ${code}.`);
        this.workerProcess = null;
        if (this.autoRestart && this.state !== "MUTED") {
          console.log("[VoiceRuntime] Reconnecting worker in 2 seconds...");
          setTimeout(() => this.start(), 2000);
        }
      });
    } catch (err: any) {
      this.setState("ERROR", `Failed to spawn voice worker: ${err?.message}`);
    }
  }

  /**
   * Handles incoming JSON lines from the PowerShell worker.
   */
  private handleWorkerOutput(rawLine: string): void {
    try {
      const evt = JSON.parse(rawLine);
      switch (evt.event) {
        case "READY":
          this.activeVoice = evt.voice || "Microsoft David / Zira";
          this.setState("LISTENING");
          console.log(`[VoiceRuntime] Engine ready! Listening for 'Hey Luma' (Voice: ${this.activeVoice}).`);
          break;

        case "WAKE_WORD_DETECTED":
          this.handleWakeWord(evt.keyword, evt.embeddedCommand);
          break;

        case "COMMAND_RECORDED":
          this.handleCommand(evt.text);
          break;

        case "STATUS_CHANGED":
          if (evt.state) {
            this.setState(evt.state);
          }
          if (typeof evt.isMuted === "boolean") {
            this.isMuted = evt.isMuted;
          }
          break;

        case "TTS_MUTE_CHANGED":
          if (typeof evt.isTtsMuted === "boolean") {
            this.isTtsMuted = evt.isTtsMuted;
          }
          break;

        case "ERROR":
          console.error("[VoiceWorker Internal Error]:", evt.message);
          this.lastError = evt.message;
          this.broadcast("error", { message: evt.message });
          break;
      }
    } catch {
      // Non-json stdout (e.g. system banner)
    }
  }

  /**
   * Triggered when the wake word ("Hey Luma") is detected locally.
   */
  async handleWakeWord(keyword: string = "Hey Luma", embeddedCommand?: string): Promise<void> {
    if (this.isMuted) return;

    console.log(`[VoiceRuntime] 🔔 Wake word detected: "${keyword}"`);
    this.lastWakeWord = keyword;
    this.setState("AWAKE");
    this.broadcast("wake", { keyword, timestamp: new Date().toISOString() });

    // Clear any previous conversation timers
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer);
      this.followUpTimer = undefined;
    }

    // If command was spoken in one breath (e.g. "Hey Luma, search keyboard on Amazon")
    const cleanEmbedded = embeddedCommand
      ? embeddedCommand.replace(/^(?:hey\s+)?(?:luma|luna)[,.]?\s*/i, "").trim()
      : "";

    if (cleanEmbedded) {
      console.log(`[VoiceRuntime] One-shot command detected in wake utterance: "${cleanEmbedded}"`);
      await this.handleCommand(cleanEmbedded);
      return;
    }

    // Audible confirmation that LUMA is ready
    this.speak("Yes, how can I help you?");
    this.setState("RECORDING");

    // Enable dictation for user command
    this.sendCommand({ command: "ENABLE_DICTATION" });

    // Set 8-second timeout for user to speak
    this.wakeTimeoutTimer = setTimeout(() => {
      if (this.state === "RECORDING" || this.state === "AWAKE") {
        console.log("[VoiceRuntime] Wake word session timed out waiting for command.");
        this.returnToStandby();
      }
    }, 8000);
  }

  /**
   * Executes a speech command through LUMA's deterministic routing & workflow engine.
   */
  async handleCommand(rawText: string): Promise<WorkflowResult> {
    if (this.wakeTimeoutTimer) {
      clearTimeout(this.wakeTimeoutTimer);
      this.wakeTimeoutTimer = undefined;
    }

    // Clean text and strip any leading wake words
    let text = rawText.trim();
    text = text.replace(/^(?:hey\s+)?(?:luma|luna)[,.]?\s*/i, "").trim();

    if (!text) {
      this.returnToStandby();
      return { success: false, message: "Empty speech command." };
    }

    console.log(`[VoiceRuntime] 🎙️ Processing speech command: "${text}"`);
    this.lastCommand = text;
    this.setState("PROCESSING");
    this.broadcast("command", { text, timestamp: new Date().toISOString() });

    // Check for conversation termination phrases
    if (/^(?:stop|cancel|nevermind|never\s*mind|bye|goodbye|bas|chup|khatam)$/i.test(text)) {
      this.speak("Returning to standby.");
      this.returnToStandby();
      return { success: true, message: "Returned to standby." };
    }

    // Check if user command is a multi-step autonomous agent goal (e.g. search + open first result + extract price)
    if (TaskPlanner.isAgentGoal(text)) {
      console.log(`[VoiceRuntime] Identified autonomous multi-step agent goal: "${text}"`);
      this.speak("Executing your request.");
      const plan = TaskPlanner.planTask(text);

      try {
        const loopResult = await AgentExecutionLoop.run(plan);
        this.setState("RESPONDING");

        const finalPrice = loopResult.finalResult?.price || loopResult.plan?.finalResult?.price;
        const finalTitle = loopResult.finalResult?.productTitle || loopResult.plan?.finalResult?.productTitle;

        const result: WorkflowResult = {
          success: loopResult.success,
          message: loopResult.message,
          data: {
            price: finalPrice,
            title: finalTitle,
            url: loopResult.finalResult?.url || loopResult.plan?.finalResult?.url,
          },
        };

        const spokenResponse = this.generateSpokenResponse(
          { intent: finalPrice ? "SEARCH_PRODUCT" : "COMPOUND_GOAL", arguments: {} },
          result
        );
        this.lastResponse = spokenResponse;
        console.log(`[VoiceRuntime] 🔊 Spoken Response: "${spokenResponse}"`);

        this.broadcast("response", {
          command: text,
          response: spokenResponse,
          success: result.success,
          data: result.data,
        });

        this.speak(spokenResponse);
        this.startFollowUpWindow();
        return result;
      } catch (loopErr: any) {
        const errorMsg = `Sorry, I encountered an error executing that task.`;
        this.speak(errorMsg);
        this.returnToStandby();
        return { success: false, message: errorMsg, error: loopErr?.message };
      }
    }

    // Determine target context (either active from previous step or active window URL)
    const effectiveTarget = this.activeContextualTarget || ComputerStateManager.getCurrentTarget();
    const routed = routeCommand(text, effectiveTarget);

    console.log(`[VoiceRuntime] Routed to intent: ${routed.intent} (rule: ${routed.matchedRule})`);

    // Contextual target propagation
    if (routed.intent === "OPEN_APP" && routed.arguments?.app === "chrome") {
      this.activeContextualTarget = "google";
    } else if (routed.arguments?.target && routed.arguments.target !== "chrome") {
      this.activeContextualTarget = routed.arguments.target;
    } else if (routed.arguments?.site && routed.arguments.site !== "chrome") {
      this.activeContextualTarget = routed.arguments.site;
    }

    // Initial spoken acknowledgment for high-latency actions
    this.speakInitialAcknowledgment(routed);

    // Workflow execution context
    const context: WorkflowContext = {
      commandId: `voice_cmd_${Date.now()}`,
      rawCommand: text,
      onProgress: (msg: string, status: any) => {
        console.log(`  [Voice Progress] (${status}) ${msg}`);
        this.broadcast("progress", { message: msg, status });
      },
    };

    try {
      const result = await WorkflowEngine.execute(routed, context);
      this.setState("RESPONDING");

      // Build spoken response using actual verified results
      const spokenResponse = this.generateSpokenResponse(routed, result);
      this.lastResponse = spokenResponse;
      console.log(`[VoiceRuntime] 🔊 Spoken Response: "${spokenResponse}"`);

      this.broadcast("response", {
        command: text,
        response: spokenResponse,
        success: result.success,
        data: result.data,
      });

      // Speak final verified response
      this.speak(spokenResponse);

      // Start follow-up window (6 seconds) for continuous conversation
      this.startFollowUpWindow();

      return result;
    } catch (err: any) {
      const errorMsg = `Sorry, I encountered an error executing that command.`;
      this.speak(errorMsg);
      this.returnToStandby();
      return { success: false, message: errorMsg, error: err?.message };
    }
  }

  /**
   * Speaks immediate conversational feedback based on the detected intent.
   */
  private speakInitialAcknowledgment(routed: any): void {
    const { intent, arguments: args } = routed;

    switch (intent) {
      case "SEARCH_PRODUCT":
      case "SEARCH_WEB":
      case "OPEN_OR_SEARCH_WEBSITE": {
        const site = args.siteDisplayName || args.target || "the web";
        const query = args.query;
        if (query) {
          this.speak(`Searching ${site} for ${query}.`);
        } else {
          this.speak(`Opening ${site}.`);
        }
        break;
      }
      case "OPEN_WEBSITE": {
        this.speak(`Opening ${args.displayName || "website"}.`);
        break;
      }
      case "OPEN_APP": {
        this.speak(`Opening ${args.appDisplayName || args.app}.`);
        break;
      }
      case "PLAY_FIRST_RESULT": {
        this.speak("Playing the first video result.");
        break;
      }
      case "YOUTUBE_CREATE_PLAYLIST": {
        this.speak(`Creating playlist ${args.name}.`);
        break;
      }
      case "YOUTUBE_PLAY_PLAYLIST": {
        this.speak(`Playing playlist ${args.name}.`);
        break;
      }
      case "COMPOUND_GOAL": {
        this.speak("Executing your request.");
        break;
      }
    }
  }

  /**
   * Generates natural speech feedback using actual verified execution results.
   */
  private generateSpokenResponse(routed: any, result: WorkflowResult): string {
    if (!result.success) {
      return result.message || "I was unable to complete that request.";
    }

    const { intent } = routed;

    // Price extraction on Amazon/Flipkart
    if (result.data?.price) {
      const title = result.data.title || "the product";
      const cleanTitle = title.length > 50 ? title.substring(0, 48) + "..." : title;
      const cleanPrice = result.data.price.replace(/[^\d,.]/g, "");
      return `I found ${cleanTitle}. Its displayed price is ${cleanPrice} rupees.`;
    }

    // Video playback
    if (intent === "PLAY_FIRST_RESULT" || intent === "YOUTUBE_PLAY_PLAYLIST") {
      const title = result.data?.title;
      if (title) {
        return `Now playing ${title}.`;
      }
      return result.message || "Video playback started.";
    }

    // General completion message
    return result.message || "Command completed successfully.";
  }

  /**
   * Keeps conversation open for 6 seconds to allow hands-free follow-up commands.
   */
  private startFollowUpWindow(): void {
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer);
    }

    // Enable dictation for follow-up
    this.sendCommand({ command: "ENABLE_DICTATION" });

    this.followUpTimer = setTimeout(() => {
      console.log("[VoiceRuntime] Follow-up conversation window expired. Returning to standby.");
      this.returnToStandby();
    }, 6000);
  }

  /**
   * Returns LUMA to idle wake-word monitoring state.
   */
  returnToStandby(): void {
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer);
      this.followUpTimer = undefined;
    }
    if (this.wakeTimeoutTimer) {
      clearTimeout(this.wakeTimeoutTimer);
      this.wakeTimeoutTimer = undefined;
    }

    this.activeContextualTarget = undefined;
    this.setState("LISTENING");
    this.sendCommand({ command: "ENABLE_WAKE_WORD" });
  }

  /**
   * Mutes or unmutes the microphone input.
   */
  setMute(muted: boolean): void {
    this.isMuted = muted;
    this.sendCommand({ command: "SET_MUTE", muted });
    if (muted) {
      this.setState("MUTED");
      console.log("[VoiceRuntime] 🔇 Microphone MUTED. Wake-word detection stopped.");
    } else {
      this.setState("LISTENING");
      console.log("[VoiceRuntime] 🎙️ Microphone UNMUTED. Wake-word detection active.");
    }
    this.broadcast("mute", { isMuted: muted });
  }

  /**
   * Mutes or unmutes spoken TTS responses.
   */
  setTtsMute(muted: boolean): void {
    this.isTtsMuted = muted;
    this.sendCommand({ command: "SET_TTS_MUTE", muted });
    this.broadcast("ttsMute", { isTtsMuted: muted });
  }

  /**
   * Speaks text using Windows Native Speech Synthesis (TTS).
   */
  speak(text: string): void {
    if (this.isTtsMuted || !text || !text.trim()) return;
    this.sendCommand({ command: "SPEAK", text: text.trim() });
  }

  /**
   * Sends an IPC command to the background worker on stdin.
   */
  private sendCommand(cmd: Record<string, any>): void {
    if (this.workerProcess && this.workerProcess.stdin.writable) {
      try {
        this.workerProcess.stdin.write(JSON.stringify(cmd) + "\n");
      } catch (err: any) {
        console.error("[VoiceRuntime] Error writing to worker stdin:", err.message);
      }
    }
  }

  /**
   * Updates state and notifies subscribers.
   */
  private setState(newState: VoiceState, error?: string): void {
    this.state = newState;
    if (error) this.lastError = error;
    this.emit("stateChange", this.getStatus());
    this.broadcast("state", this.getStatus());
  }

  /**
   * Retrieves a snapshot of the voice runtime status.
   */
  getStatus(): VoiceStatus {
    return {
      state: this.state,
      isMuted: this.isMuted,
      isTtsMuted: this.isTtsMuted,
      activeVoice: this.activeVoice,
      lastWakeWord: this.lastWakeWord,
      lastCommand: this.lastCommand,
      lastResponse: this.lastResponse,
      lastError: this.lastError,
    };
  }

  /**
   * Subscribes a client to Server-Sent Events (SSE).
   */
  addSseClient(callback: (event: string, data: any) => void): () => void {
    this.sseClients.add(callback);
    return () => {
      this.sseClients.delete(callback);
    };
  }

  private broadcast(event: string, data: any): void {
    for (const client of this.sseClients) {
      try {
        client(event, data);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Shuts down the voice runtime and terminates worker process.
   */
  shutdown(): void {
    this.autoRestart = false;
    this.sendCommand({ command: "EXIT" });
    if (this.workerProcess) {
      try {
        this.workerProcess.kill();
      } catch {}
      this.workerProcess = null;
    }
    this.setState("MUTED");
  }
}

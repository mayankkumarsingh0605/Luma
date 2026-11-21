import React, { useState } from "react";
import type { AppDefinition, ToolDefinition } from "../../types/computer.js";

interface ToolTestingStudioProps {
  apps: AppDefinition[];
  tools: ToolDefinition[];
  isExecuting: boolean;
  onExecuteTool: (toolName: string, args?: Record<string, any>) => Promise<any>;
}

export const ToolTestingStudio: React.FC<ToolTestingStudioProps> = ({
  apps,
  isExecuting,
  onExecuteTool,
}) => {
  // App Control state
  const [selectedApp, setSelectedApp] = useState<string>("vscode");
  const [appArgs, setAppArgs] = useState<string>("");

  // Keyboard state
  const [textToType, setTextToType] = useState<string>("Hello from LUMA 🚀");
  const [selectedKey, setSelectedKey] = useState<string>("enter");

  // Mouse state
  const [mouseX, setMouseX] = useState<number>(500);
  const [mouseY, setMouseY] = useState<number>(500);
  const [scrollAmount, setScrollAmount] = useState<number>(3);

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<"apps" | "keyboard" | "mouse" | "system">("apps");

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e1118]/80 p-5 backdrop-blur-md shadow-xl">
      {/* Header with category tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
            MANUAL TOOL TESTING STUDIO
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              No LLM Required
            </span>
          </h3>
          <p className="text-xs text-gray-400">
            Execute and verify individual computer-control tools directly
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center rounded-xl bg-white/5 p-1 border border-white/10">
          <button
            onClick={() => setActiveTab("apps")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              activeTab === "apps"
                ? "bg-white text-black font-semibold shadow"
                : "text-gray-400 hover:text-white"
            }`}
          >
            🖥️ Apps
          </button>
          <button
            onClick={() => setActiveTab("keyboard")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              activeTab === "keyboard"
                ? "bg-white text-black font-semibold shadow"
                : "text-gray-400 hover:text-white"
            }`}
          >
            ⌨️ Keyboard
          </button>
          <button
            onClick={() => setActiveTab("mouse")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              activeTab === "mouse"
                ? "bg-white text-black font-semibold shadow"
                : "text-gray-400 hover:text-white"
            }`}
          >
            🖱️ Mouse
          </button>
          <button
            onClick={() => setActiveTab("system")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              activeTab === "system"
                ? "bg-white text-black font-semibold shadow"
                : "text-gray-400 hover:text-white"
            }`}
          >
            ⚙️ System
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="mt-5">
        {/* 1. APPS TAB */}
        {activeTab === "apps" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  Select Application:
                </label>
                <select
                  value={selectedApp}
                  onChange={(e) => setSelectedApp(e.target.value)}
                  disabled={isExecuting}
                  className="w-full rounded-xl border border-white/15 bg-[#12151e] px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/30"
                >
                  {apps.length > 0 ? (
                    apps.map((app) => (
                      <option key={app.name} value={app.name}>
                        {app.displayName} ({app.name})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="vscode">Visual Studio Code</option>
                      <option value="chrome">Google Chrome</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="notepad">Notepad</option>
                      <option value="calc">Calculator</option>
                      <option value="explorer">File Explorer</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  Optional Arguments / Flags:
                </label>
                <input
                  type="text"
                  value={appArgs}
                  onChange={(e) => setAppArgs(e.target.value)}
                  placeholder="e.g. . (for current folder in code)"
                  disabled={isExecuting}
                  className="w-full rounded-xl border border-white/15 bg-[#12151e] px-3 py-2.5 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                onClick={() =>
                  onExecuteTool("open_app", {
                    app: selectedApp,
                    args: appArgs.trim() ? appArgs.trim().split(" ") : undefined,
                  })
                }
                disabled={isExecuting}
                className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-semibold text-black transition hover:bg-gray-200 disabled:opacity-40 cursor-pointer shadow-md"
              >
                <span>🚀</span>
                <span>Open App</span>
              </button>

              <button
                onClick={() => onExecuteTool("focus_app", { app: selectedApp })}
                disabled={isExecuting}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-gray-200 transition hover:bg-white/10 disabled:opacity-40 cursor-pointer"
              >
                <span>👁️</span>
                <span>Focus Window</span>
              </button>

              <button
                onClick={() => onExecuteTool("is_app_running", { app: selectedApp })}
                disabled={isExecuting}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-gray-200 transition hover:bg-white/10 disabled:opacity-40 cursor-pointer"
              >
                <span>⚡</span>
                <span>Check Status</span>
              </button>

              <button
                onClick={() => onExecuteTool("close_app", { app: selectedApp, force: true })}
                disabled={isExecuting}
                className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-40 cursor-pointer"
              >
                <span>✕</span>
                <span>Close App</span>
              </button>
            </div>
          </div>
        )}

        {/* 2. KEYBOARD TAB */}
        {activeTab === "keyboard" && (
          <div className="space-y-4">
            {/* Type Text */}
            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <label className="block text-xs font-medium text-gray-300 mb-2">
                Type Text into Focused Window:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={textToType}
                  onChange={(e) => setTextToType(e.target.value)}
                  placeholder="Enter text to type..."
                  disabled={isExecuting}
                  className="flex-1 rounded-xl border border-white/15 bg-[#12151e] px-3 py-2.5 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                />
                <button
                  onClick={() => onExecuteTool("type_text", { text: textToType })}
                  disabled={isExecuting || !textToType.trim()}
                  className="rounded-xl bg-white px-5 py-2.5 text-xs font-semibold text-black transition hover:bg-gray-200 disabled:opacity-40 cursor-pointer"
                >
                  Type Text
                </button>
              </div>
            </div>

            {/* Press Key */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <label className="block text-xs font-medium text-gray-300 mb-2">
                  Press Single Key:
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedKey}
                    onChange={(e) => setSelectedKey(e.target.value)}
                    disabled={isExecuting}
                    className="flex-1 rounded-xl border border-white/15 bg-[#12151e] px-3 py-2 text-sm text-gray-100 outline-none focus:border-white/40"
                  >
                    <option value="enter">Enter / Return</option>
                    <option value="escape">Escape</option>
                    <option value="tab">Tab</option>
                    <option value="backspace">Backspace</option>
                    <option value="space">Space</option>
                    <option value="delete">Delete</option>
                    <option value="up">Arrow Up</option>
                    <option value="down">Arrow Down</option>
                    <option value="left">Arrow Left</option>
                    <option value="right">Arrow Right</option>
                  </select>
                  <button
                    onClick={() => onExecuteTool("press_key", { key: selectedKey })}
                    disabled={isExecuting}
                    className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/20 disabled:opacity-40 cursor-pointer"
                  >
                    Press Key
                  </button>
                </div>
              </div>

              {/* Hotkeys */}
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <label className="block text-xs font-medium text-gray-300 mb-2">
                  Quick Key Combinations:
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onExecuteTool("hotkey", { keys: ["ctrl", "c"] })}
                    disabled={isExecuting}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-mono text-gray-200 transition hover:bg-white/15"
                  >
                    Ctrl + C
                  </button>
                  <button
                    onClick={() => onExecuteTool("hotkey", { keys: ["ctrl", "v"] })}
                    disabled={isExecuting}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-mono text-gray-200 transition hover:bg-white/15"
                  >
                    Ctrl + V
                  </button>
                  <button
                    onClick={() => onExecuteTool("hotkey", { keys: ["alt", "tab"] })}
                    disabled={isExecuting}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-mono text-gray-200 transition hover:bg-white/15"
                  >
                    Alt + Tab
                  </button>
                  <button
                    onClick={() => onExecuteTool("hotkey", { keys: ["ctrl", "shift", "esc"] })}
                    disabled={isExecuting}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-mono text-gray-200 transition hover:bg-white/15"
                  >
                    Task Manager
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. MOUSE TAB */}
        {activeTab === "mouse" && (
          <div className="space-y-4">
            {/* Move Mouse */}
            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <label className="block text-xs font-medium text-gray-300 mb-2">
                Move Mouse Coordinates (X, Y):
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">X:</span>
                  <input
                    type="number"
                    value={mouseX}
                    onChange={(e) => setMouseX(parseInt(e.target.value) || 0)}
                    disabled={isExecuting}
                    className="w-24 rounded-lg border border-white/15 bg-[#12151e] px-2.5 py-1.5 text-sm font-mono text-gray-100 outline-none focus:border-white/40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">Y:</span>
                  <input
                    type="number"
                    value={mouseY}
                    onChange={(e) => setMouseY(parseInt(e.target.value) || 0)}
                    disabled={isExecuting}
                    className="w-24 rounded-lg border border-white/15 bg-[#12151e] px-2.5 py-1.5 text-sm font-mono text-gray-100 outline-none focus:border-white/40"
                  />
                </div>
                <button
                  onClick={() => onExecuteTool("move_mouse", { x: mouseX, y: mouseY })}
                  disabled={isExecuting}
                  className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-gray-200 disabled:opacity-40 cursor-pointer"
                >
                  Move Cursor
                </button>
              </div>
            </div>

            {/* Click Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <label className="block text-xs font-medium text-gray-300 mb-2">
                  Mouse Click Actions:
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onExecuteTool("click", { button: "left" })}
                    disabled={isExecuting}
                    className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-white/10"
                  >
                    🖱️ Left Click
                  </button>
                  <button
                    onClick={() => onExecuteTool("right_click", {})}
                    disabled={isExecuting}
                    className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-white/10"
                  >
                    🖱️ Right Click
                  </button>
                  <button
                    onClick={() => onExecuteTool("double_click", {})}
                    disabled={isExecuting}
                    className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-white/10"
                  >
                    🖱️ Double Click
                  </button>
                </div>
              </div>

              {/* Scroll */}
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <label className="block text-xs font-medium text-gray-300 mb-2">
                  Wheel Scroll:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={scrollAmount}
                    onChange={(e) => setScrollAmount(parseInt(e.target.value) || 1)}
                    disabled={isExecuting}
                    className="w-16 rounded-lg border border-white/15 bg-[#12151e] px-2.5 py-1.5 text-sm font-mono text-gray-100 outline-none"
                  />
                  <button
                    onClick={() => onExecuteTool("scroll", { amount: Math.abs(scrollAmount) })}
                    disabled={isExecuting}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/15"
                  >
                    ▲ Scroll Up
                  </button>
                  <button
                    onClick={() => onExecuteTool("scroll", { amount: -Math.abs(scrollAmount) })}
                    disabled={isExecuting}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/15"
                  >
                    ▼ Scroll Down
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. SYSTEM TAB */}
        {activeTab === "system" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => onExecuteTool("get_active_window", {})}
                disabled={isExecuting}
                className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-black/30 p-4 text-center transition hover:border-white/20 hover:bg-white/5 cursor-pointer"
              >
                <span className="text-xl mb-1">🔍</span>
                <span className="text-xs font-semibold text-gray-200">Active Window</span>
                <span className="text-[10px] text-gray-400 mt-0.5">Foreground process</span>
              </button>

              <button
                onClick={() => onExecuteTool("get_screen_size", {})}
                disabled={isExecuting}
                className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-black/30 p-4 text-center transition hover:border-white/20 hover:bg-white/5 cursor-pointer"
              >
                <span className="text-xl mb-1">📐</span>
                <span className="text-xs font-semibold text-gray-200">Screen Bounds</span>
                <span className="text-[10px] text-gray-400 mt-0.5">Display resolution</span>
              </button>

              <button
                onClick={() => onExecuteTool("get_os_info", {})}
                disabled={isExecuting}
                className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-black/30 p-4 text-center transition hover:border-white/20 hover:bg-white/5 cursor-pointer"
              >
                <span className="text-xl mb-1">💻</span>
                <span className="text-xs font-semibold text-gray-200">OS Telemetry</span>
                <span className="text-[10px] text-gray-400 mt-0.5">Specs & uptime</span>
              </button>

              <button
                onClick={() => onExecuteTool("take_screenshot", {})}
                disabled={isExecuting}
                className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-black/30 p-4 text-center transition hover:border-white/20 hover:bg-white/5 cursor-pointer"
              >
                <span className="text-xl mb-1">📷</span>
                <span className="text-xs font-semibold text-gray-200">Take Screenshot</span>
                <span className="text-[10px] text-gray-400 mt-0.5">Full display snapshot</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

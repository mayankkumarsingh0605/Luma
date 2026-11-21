/**
 * Type definitions for LUMA Computer Control Module
 */

export type SafetyLevel = "SAFE" | "CONFIRM_REQUIRED" | "RESTRICTED";

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
  enum?: string[];
  default?: any;
}

export interface ToolDefinition {
  name: string;
  displayName: string;
  description: string;
  category: "app" | "keyboard" | "mouse" | "system";
  safetyLevel: SafetyLevel;
  parameters: ToolParameter[];
}

export interface ToolExecutionRequest {
  tool: string;
  arguments?: Record<string, any>;
}

export interface ToolExecutionResponse<T = any> {
  success: boolean;
  tool: string;
  result?: T;
  error?: string;
  durationMs: number;
  timestamp: string;
}

export interface AppDefinition {
  name: string;
  displayName: string;
  category: string;
  executableName: string;
  standardPaths?: string[];
  commandName?: string;
  protocolUri?: string;
  arguments?: string[];
  description: string;
}

export interface ActiveWindowInfo {
  title: string;
  processName: string;
  processId: number;
  hwnd?: number;
}

export interface SystemInfo {
  platform: string;
  osRelease: string;
  arch: string;
  hostname: string;
  username: string;
  uptimeSeconds: number;
}

export interface ScreenInfo {
  width: number;
  height: number;
  primary: boolean;
}

export interface MousePosition {
  x: number;
  y: number;
}

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  tool: string;
  arguments: Record<string, any>;
  status: "SUCCESS" | "ERROR";
  durationMs: number;
  result?: any;
  error?: string;
}

export interface ComputerState {
  os: SystemInfo;
  activeWindow: ActiveWindowInfo;
  screen: ScreenInfo;
  mouse: MousePosition;
  isExecuting: boolean;
  lastAction?: ActionLogEntry;
}

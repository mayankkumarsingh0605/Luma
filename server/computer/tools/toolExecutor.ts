import { ToolRegistry } from "./toolRegistry.js";
import { ActionLogger } from "../logging/actionLogger.js";
import type { ToolExecutionResponse, ToolParameter } from "../types.js";

export class ToolExecutor {
  /**
   * Executes a tool by name with arguments, validates parameters, catches errors,
   * logs the action, and returns a structured response.
   */
  static async executeTool(
    toolName: string,
    args: Record<string, any> = {}
  ): Promise<ToolExecutionResponse> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    if (!toolName || typeof toolName !== "string") {
      const durationMs = Date.now() - startTime;
      const errorMsg = "Tool name is required and must be a string.";
      ActionLogger.logAction({
        tool: toolName || "unknown",
        arguments: args,
        status: "ERROR",
        durationMs,
        error: errorMsg,
      });

      return {
        success: false,
        tool: toolName || "unknown",
        error: errorMsg,
        durationMs,
        timestamp,
      };
    }

    const tool = ToolRegistry.get(toolName);
    if (!tool) {
      const durationMs = Date.now() - startTime;
      const availableTools = ToolRegistry.getAllDefinitions()
        .map((t) => t.name)
        .join(", ");
      const errorMsg = `Tool '${toolName}' does not exist. Available tools: ${availableTools}.`;

      ActionLogger.logAction({
        tool: toolName,
        arguments: args,
        status: "ERROR",
        durationMs,
        error: errorMsg,
      });

      return {
        success: false,
        tool: toolName,
        error: errorMsg,
        durationMs,
        timestamp,
      };
    }

    // Validate parameters
    const validationError = this.validateArguments(tool.definition.parameters, args);
    if (validationError) {
      const durationMs = Date.now() - startTime;
      ActionLogger.logAction({
        tool: toolName,
        arguments: args,
        status: "ERROR",
        durationMs,
        error: validationError,
      });

      return {
        success: false,
        tool: toolName,
        error: validationError,
        durationMs,
        timestamp,
      };
    }

    try {
      // Execute the underlying OS function
      const result = await tool.handler(args);
      const durationMs = Date.now() - startTime;

      ActionLogger.logAction({
        tool: toolName,
        arguments: args,
        status: "SUCCESS",
        durationMs,
        result,
      });

      return {
        success: true,
        tool: toolName,
        result,
        durationMs,
        timestamp,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const readableError = err?.message || String(err) || "An unexpected error occurred during execution.";

      ActionLogger.logAction({
        tool: toolName,
        arguments: args,
        status: "ERROR",
        durationMs,
        error: readableError,
      });

      return {
        success: false,
        tool: toolName,
        error: readableError,
        durationMs,
        timestamp,
      };
    }
  }

  /**
   * Validates arguments against tool parameter definitions.
   */
  private static validateArguments(
    parameters: ToolParameter[],
    args: Record<string, any>
  ): string | null {
    for (const param of parameters) {
      const value = args[param.name];

      // Check required
      if (param.required && (value === undefined || value === null || value === "")) {
        return `Missing required parameter '${param.name}' for tool.`;
      }

      // Check type if provided
      if (value !== undefined && value !== null) {
        if (param.type === "number" && (typeof value !== "number" || isNaN(value))) {
          return `Parameter '${param.name}' must be a valid number.`;
        }
        if (param.type === "string" && typeof value !== "string") {
          return `Parameter '${param.name}' must be a string.`;
        }
        if (param.type === "boolean" && typeof value !== "boolean") {
          return `Parameter '${param.name}' must be a boolean.`;
        }
        if (param.type === "array" && !Array.isArray(value)) {
          return `Parameter '${param.name}' must be an array.`;
        }
        if (param.enum && !param.enum.includes(String(value).toLowerCase())) {
          return `Parameter '${param.name}' must be one of: ${param.enum.join(", ")}.`;
        }
      }
    }

    return null;
  }
}

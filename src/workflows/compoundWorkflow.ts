import { routeCommand } from "../router/commandRouter.js";
import { WorkflowEngine } from "./workflowEngine.js";
import type { WorkflowContext, WorkflowResult } from "./types.js";

/**
 * Executes a sequenced multi-step user goal (e.g. "Open Chrome and search Amazon for keyboards").
 */
export async function executeCompoundWorkflow(
  subCommands: string[],
  context: WorkflowContext
): Promise<WorkflowResult> {
  const results: string[] = [];
  let contextualTarget: string | undefined = undefined;

  for (let i = 0; i < subCommands.length; i++) {
    const subCmd = subCommands[i];
    context.onProgress(`Step ${i + 1}/${subCommands.length}: "${subCmd}"`, "in-progress");

    const routed = routeCommand(subCmd, contextualTarget);
    if (routed.intent === "UNKNOWN") {
      context.onProgress(`Could not understand step "${subCmd}"`, "failed");
      return {
        success: false,
        message: `I didn't understand the sub-command: "${subCmd}".`,
      };
    }

    // If this step targeted a specific website (e.g. amazon, youtube), propagate context
    if (routed.intent.startsWith("YOUTUBE_") || routed.intent === "PLAY_FIRST_RESULT") {
      contextualTarget = "youtube";
    } else if (routed.arguments?.target && routed.arguments.target !== "chrome") {
      contextualTarget = routed.arguments.target;
    } else if (routed.arguments?.site && routed.arguments.site !== "chrome") {
      contextualTarget = routed.arguments.site;
    }

    const res = await WorkflowEngine.execute(routed, context);
    if (!res.success) {
      return res;
    }

    results.push(res.message);
  }

  const finalMsg = results.join(" ");
  return {
    success: true,
    message: finalMsg,
  };
}

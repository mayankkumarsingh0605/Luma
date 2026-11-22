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
  let previousStepData: any = undefined;

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

    // Pass previous step's data into arguments for data flow
    if (previousStepData !== undefined) {
      routed.arguments.previousData = previousStepData;
    }

    // If this step targeted a specific website (e.g. amazon, youtube) or opened Chrome, propagate context
    if (routed.intent.startsWith("YOUTUBE_") || routed.intent === "PLAY_FIRST_RESULT" || routed.intent === "PLAY_VIDEO_RANK") {
      contextualTarget = "youtube";
    } else if (routed.intent === "OPEN_APP" && routed.arguments?.app === "chrome") {
      contextualTarget = "google";
    } else if (routed.arguments?.target && routed.arguments.target !== "chrome") {
      contextualTarget = routed.arguments.target;
    } else if (routed.arguments?.site && routed.arguments.site !== "chrome") {
      contextualTarget = routed.arguments.site;
    }

    const res = await WorkflowEngine.execute(routed, context);
    if (!res.success) {
      return res;
    }

    previousStepData = res.data;
    results.push(res.message);
  }

  const finalMsg = results.join(" ");
  return {
    success: true,
    message: finalMsg,
    data: previousStepData,
  };
}

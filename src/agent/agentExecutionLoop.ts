import { BrowserAgent } from "./browserAgent.js";
import { AgentStateManager } from "./agentStateManager.js";
import type { TaskPlan, FinalTaskResult } from "./agentTypes.js";

const MAX_STEPS = 30;
const MAX_RETRIES_PER_STEP = 2;

export interface AgentExecutionResult {
  success: boolean;
  message: string;
  plan: TaskPlan;
  finalResult?: FinalTaskResult;
  error?: string;
}

/**
 * Autonomous Agent Execution Loop
 *
 * Coordinates Plan -> Act -> Observe -> Verify -> Next Step with visual desktop feedback.
 */
export class AgentExecutionLoop {
  static async run(plan: TaskPlan): Promise<AgentExecutionResult> {
    const signal = AgentStateManager.initTask(plan);
    let stepIndex = 0;
    let totalExecutedSteps = 0;

    let targetProductUrl = "";
    let targetProductTitle = "";
    let targetPrice = "";
    let targetCurrency = "INR";

    while (
      stepIndex < plan.steps.length &&
      totalExecutedSteps < MAX_STEPS &&
      !signal.aborted &&
      !AgentStateManager.isStopRequested()
    ) {
      const step = plan.steps[stepIndex];
      totalExecutedSteps++;

      // Update Agent State
      AgentStateManager.updateState({
        current_step: step.step,
        step_goal: step.goal,
      });

      AgentStateManager.updateStep(step.step, { status: "running" });
      AgentStateManager.setCurrentAction(step.goal);

      let stepSuccess = false;
      let stepRetries = 0;
      let lastStepError: string | undefined;

      const startTime = Date.now();

      while (stepRetries <= MAX_RETRIES_PER_STEP && !stepSuccess && !AgentStateManager.isStopRequested()) {
        try {
          switch (step.actionType) {
            case "open_app": {
              AgentStateManager.setCurrentAction("Opening Google Chrome...");
              const res = await BrowserAgent.open_browser(step.params?.url);
              if (res.success) {
                stepSuccess = true;
                AgentStateManager.updateStep(step.step, {
                  status: "success",
                  resultMessage: "Google Chrome opened and ready.",
                  durationMs: Date.now() - startTime,
                });
              } else {
                throw new Error("Could not verify Chrome launch.");
              }
              break;
            }

            case "navigate": {
              const displayName = step.params?.displayName || "Website";
              const url = step.params?.url || "https://www.amazon.in";
              AgentStateManager.setCurrentAction(`Navigating to ${displayName}...`);

              const res = await BrowserAgent.navigate_to_url(url);
              if (res.success) {
                stepSuccess = true;
                AgentStateManager.updateStep(step.step, {
                  status: "success",
                  resultMessage: `${displayName} loaded successfully.`,
                  durationMs: Date.now() - startTime,
                });
              } else {
                throw new Error(`Failed to navigate to ${url}`);
              }
              break;
            }

            case "search_input": {
              const query = step.params?.query || "wireless keyboards";
              AgentStateManager.setCurrentAction(`Entering search for "${query}" in browser search input...`);

              // Visibly locate search input, fill exact query, verify, and submit
              await BrowserAgent.fill_and_submit_search(query);

              stepSuccess = true;
              AgentStateManager.updateStep(step.step, {
                status: "success",
                resultMessage: `Searched for "${query}".`,
                durationMs: Date.now() - startTime,
              });
              break;
            }

            case "wait_results": {
              const query = step.params?.query || "wireless keyboards";
              AgentStateManager.setCurrentAction("Waiting for search results page to load...");
              await BrowserAgent.wait_for_page(1000);
              await BrowserAgent.verify_search_results(query);

              stepSuccess = true;
              AgentStateManager.updateStep(step.step, {
                status: "success",
                resultMessage: "Search results loaded.",
                durationMs: Date.now() - startTime,
              });
              break;
            }

            case "open_first_result": {
              const query = step.params?.query || "wireless keyboards";
              AgentStateManager.setCurrentAction(`Identifying first product for "${query}"...`);

              const inspectRes = await BrowserAgent.find_search_results(query, "amazon.in");

              if (inspectRes.success && inspectRes.productUrl) {
                targetProductUrl = inspectRes.productUrl;
                targetProductTitle = inspectRes.productTitle || "Wireless Keyboard";
                targetPrice = inspectRes.price || "";

                AgentStateManager.setObservation({
                  firstProductUrl: targetProductUrl,
                  productTitle: targetProductTitle,
                  initialPrice: targetPrice,
                });

                AgentStateManager.setCurrentAction(`Opening first product: "${targetProductTitle}"...`);
                await BrowserAgent.open_first_result(targetProductUrl);

                stepSuccess = true;
                AgentStateManager.updateStep(step.step, {
                  status: "success",
                  resultMessage: `Opened product: ${targetProductTitle}`,
                  durationMs: Date.now() - startTime,
                });
              } else {
                throw new Error(inspectRes.error || "Could not locate first product.");
              }
              break;
            }

            case "extract_price": {
              AgentStateManager.setCurrentAction("Extracting active product price...");

              if (!targetProductUrl) {
                targetProductUrl = "https://www.amazon.in/s?k=wireless+keyboards";
              }

              const priceRes = await BrowserAgent.find_price(targetProductUrl);

              if (priceRes.success && priceRes.price) {
                targetPrice = priceRes.price;
                targetCurrency = priceRes.currency || "INR";
                if (priceRes.title) {
                  targetProductTitle = priceRes.title;
                }

                AgentStateManager.setObservation({
                  finalPrice: targetPrice,
                  currency: targetCurrency,
                  title: targetProductTitle,
                });

                stepSuccess = true;
                AgentStateManager.updateStep(step.step, {
                  status: "success",
                  resultMessage: `Price extracted: ${targetPrice}`,
                  durationMs: Date.now() - startTime,
                });
              } else if (targetPrice) {
                // Fallback to price discovered from search results
                stepSuccess = true;
                AgentStateManager.updateStep(step.step, {
                  status: "success",
                  resultMessage: `Price extracted: ${targetPrice}`,
                  durationMs: Date.now() - startTime,
                });
              } else {
                throw new Error("Could not extract price from page.");
              }
              break;
            }

            case "report_result": {
              AgentStateManager.setCurrentAction("Completing task...");
              stepSuccess = true;
              AgentStateManager.updateStep(step.step, {
                status: "success",
                resultMessage: targetPrice
                  ? `Task complete: Price is ${targetPrice}.`
                  : "Task completed successfully.",
                durationMs: Date.now() - startTime,
              });
              break;
            }

            default: {
              stepSuccess = true;
              AgentStateManager.updateStep(step.step, {
                status: "success",
                resultMessage: `Step completed: ${step.goal}`,
              });
              break;
            }
          }
        } catch (err: any) {
          lastStepError = err?.message || "Step execution error";
          stepRetries++;

          if (stepRetries <= MAX_RETRIES_PER_STEP && !AgentStateManager.isStopRequested()) {
            AgentStateManager.updateStep(step.step, { status: "retrying" });
            AgentStateManager.setCurrentAction(`Retrying step ${step.step} (${stepRetries}/${MAX_RETRIES_PER_STEP})...`);
            await BrowserAgent.wait_for_page(800);
          }
        }
      }

      if (!stepSuccess) {
        AgentStateManager.updateStep(step.step, {
          status: "failed",
          error: lastStepError,
        });
        AgentStateManager.updateState({
          status: "failed",
          last_action_status: "failed",
        });

        const activePlan = AgentStateManager.getPlan() || plan;
        return {
          success: false,
          message: `Failed at step ${step.step} (${step.goal}): ${lastStepError}`,
          plan: activePlan,
          error: lastStepError,
        };
      }

      stepIndex++;
    }

    if (AgentStateManager.isStopRequested()) {
      const stoppedPlan = AgentStateManager.getPlan() || plan;
      return {
        success: false,
        message: "Task was stopped by user.",
        plan: stoppedPlan,
      };
    }

    // Build Final Task Result
    const finalResult: FinalTaskResult = {
      productTitle: targetProductTitle || undefined,
      price: targetPrice || undefined,
      currency: targetCurrency,
      url: targetProductUrl || undefined,
      summary: targetPrice
        ? `The price of ${targetProductTitle || "the first product"} is ${targetPrice}.`
        : `Task "${plan.goal}" completed successfully.`,
    };

    AgentStateManager.setFinalResult(finalResult);
    const completedPlan = AgentStateManager.getPlan() || plan;

    return {
      success: true,
      message: finalResult.summary || "Task completed successfully.",
      plan: completedPlan,
      finalResult,
    };
  }
}

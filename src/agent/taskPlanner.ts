import type { TaskPlan, TaskStep } from "./agentTypes.js";

/**
 * LUMA Task Planner
 *
 * Decomposes complex natural language user goals into structured, high-level
 * user goals without exposing internal low-level operations.
 */
export class TaskPlanner {
  /**
   * Extracts search query directly and strictly from the user's command.
   * Returns null if no explicit search query is present.
   */
  static extractSearchQuery(rawText: string): string | null {
    const text = rawText.trim();
    const searchMatch =
      text.match(/(?:find|look\s+for)\s+([^,]+?)(?:\s+(?:on|in)\s+(?:amazon|flipkart|google|youtube)|,\s*(?:open|tell|play)|and\s+(?:open|tell|play)|\s+open|\s+tell|\s+play|$)/i) ||
      text.match(/(?:(?:on|in)\s+(?:amazon|flipkart|google|youtube)\s+)?search\s+(?:on\s+|in\s+)?(?:amazon|flipkart|google|youtube)?\s*(?:for\s+)?([^,]+?)(?:,\s*(?:open|tell|play)|and\s+(?:open|tell|play)|\s+open|\s+tell|\s+play|$)/i) ||
      text.match(/search\s+(?:amazon|flipkart|google|youtube)?\s*(?:for\s+)?([^,]+?)(?:,\s*(?:open|tell|play)|and\s+(?:open|tell|play)|\s+open|\s+tell|\s+play|$)/i) ||
      text.match(/(?:amazon|flipkart|google|youtube)?\s*(?:pe|par|mein|me)\s+([^,]+?)\s+(?:search|dhundo)/i) ||
      text.match(/(?:for\s+)([^,]+?)(?:,\s*(?:open|tell|play)|and\s+(?:open|tell|play)|\s+open|\s+tell|\s+play|$)/i) ||
      text.match(/([a-zA-Z0-9\s]+?)\s+(?:search\s*karo|dhundo)/i);

    if (searchMatch && searchMatch[1]) {
      const candidate = searchMatch[1]
        .replace(/^(?:for\s+|amazon\s+|flipkart\s+|google\s+|youtube\s+)/i, "")
        .replace(/\b(?:on\s+amazon|on\s+flipkart|on\s+google|on\s+youtube|in\s+amazon|in\s+flipkart)\b/i, "")
        .trim();
      if (candidate.length > 0 && !candidate.startsWith("new tab") && !candidate.startsWith("tab")) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Determines if a user query represents a multi-step autonomous agent goal
   * (e.g. searching, opening results, extracting prices).
   *
   * Crucial rule: Never treats ordinary sequential navigation (e.g. "Open Chrome, open a new tab, and visit GitHub")
   * as an autonomous search goal.
   */
  static isAgentGoal(rawText: string): boolean {
    const text = rawText.toLowerCase().trim();

    // Playlist and calendar commands are handled deterministically by workflows/intents — never treat as search agent goals
    if ((text.includes("playlist") || text.includes("watch later") || text.includes("calendar") || text.includes("meeting")) && !/(?:price|cost|buy)/i.test(text)) {
      return false;
    }

    // Check for price search goal: "search Amazon for ..., open the first result and tell me its price"
    const hasPriceGoal =
      /(?:tell\s+me\s+(?:its\s+)?price|get\s+(?:the\s+)?price|find\s+(?:the\s+)?price|price\s+kya\s+hai|price\s+batao|what\s+is\s+(?:the\s+)?price)/i.test(
        text
      );
    const hasFirstResult = /(?:first\s+result|first\s+product|pehla\s+result|pehla\s+product|open\s+(?:the\s+)?first)/i.test(text);
    const hasSearch = /(?:search|dhundo|find)/i.test(text);

    // Require an explicit extractable search query for agent search goals
    const extractedQuery = this.extractSearchQuery(rawText);

    if ((hasPriceGoal || (hasFirstResult && hasSearch)) && extractedQuery !== null) {
      return true;
    }

    // Check if both opening browser, searching with an explicit query, and acting on results are requested
    if (
      (text.includes("chrome") || text.includes("browser")) &&
      hasSearch &&
      extractedQuery !== null &&
      (hasFirstResult || hasPriceGoal || text.includes("result") || text.includes("product"))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Validates a planned task before execution to guarantee every action is traceable.
   */
  static validatePlan(plan: TaskPlan): { valid: boolean; error?: string } {
    if (!plan || !plan.steps || plan.steps.length === 0) {
      return { valid: false, error: "Plan contains no execution steps." };
    }
    for (const step of plan.steps) {
      if (!step.goal || !step.actionType) {
        return { valid: false, error: `Step #${step.step} is missing goal or actionType.` };
      }
      if (step.actionType === "search_input") {
        const q = step.params?.query?.trim();
        if (!q || q.length === 0) {
          return { valid: false, error: `Step #${step.step} (search) is missing an explicit search query.` };
        }
      }
      if (step.actionType === "navigate" && !step.params?.url) {
        return { valid: false, error: `Step #${step.step} (navigate) is missing a target destination URL.` };
      }
    }
    return { valid: true };
  }

  /**
   * Plans a complex user goal into sequential TaskSteps strictly traceable to user instructions.
   */
  static planTask(userGoal: string, _context?: any): TaskPlan {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const text = userGoal.toLowerCase().trim();

    // Check if price extraction is requested
    const needsPrice =
      /(?:price|cost|price\s+batao|tell\s+me\s+its\s+price|price\s+kya\s+hai)/i.test(text);

    const isTabGoal = text.includes("new tab") || text.includes("naya tab");

    // 1. Extract Target Site (Google, YouTube, Amazon, Flipkart, etc.)
    // DEFAULT IS ALWAYS GOOGLE FOR GENERAL SEARCHES — NEVER DEFAULT TO AMAZON
    let site = "google";
    let siteDisplayName = "Google";
    let siteUrl = "https://www.google.com";

    if (text.includes("flipkart") || text.includes("flipkart.com")) {
      site = "flipkart";
      siteDisplayName = "Flipkart";
      siteUrl = "https://www.flipkart.com";
    } else if (text.includes("youtube") || text.includes("yt")) {
      site = "youtube";
      siteDisplayName = "YouTube";
      siteUrl = "https://www.youtube.com";
    } else if (text.includes("amazon.com")) {
      site = "amazon";
      siteDisplayName = "Amazon";
      siteUrl = "https://www.amazon.com";
    } else if (text.includes("amazon")) {
      site = "amazon";
      siteDisplayName = "Amazon";
      siteUrl = "https://www.amazon.in";
    } else if (text.includes("google")) {
      site = "google";
      siteDisplayName = "Google";
      siteUrl = "https://www.google.com";
    } else if (text.includes("github")) {
      site = "github";
      siteDisplayName = "GitHub";
      siteUrl = "https://github.com";
    } else if (needsPrice || /(?:buy|price|cost|purchase|order)/i.test(text)) {
      site = "amazon";
      siteDisplayName = "Amazon";
      siteUrl = "https://www.amazon.in";
    }

    // 2. Extract Query keyword strictly — NEVER default to invented queries
    const query = this.extractSearchQuery(userGoal);
    if (!query) {
      throw new Error(`Task planning error: Could not extract a search query from "${userGoal}". Actions must be traceable to the user instruction.`);
    }

    // Build the high-level user goal steps
    const firstStep: TaskStep = isTabGoal
      ? {
          step: 1,
          goal: "Open a new tab in Chrome",
          status: "pending",
          actionType: "create_tab",
          params: { url: siteUrl },
        }
      : {
          step: 1,
          goal: "Open Chrome",
          status: "pending",
          actionType: "open_app",
          params: { app: "chrome" },
        };

    const isYouTubePlay = site === "youtube" && /(?:play|video|watch|song|1st|first)/i.test(text);

    const steps: TaskStep[] = [
      firstStep,
      {
        step: 2,
        goal: `Open ${siteDisplayName}`,
        status: "pending",
        actionType: "navigate",
        params: { site, displayName: siteDisplayName, url: siteUrl },
      },
      {
        step: 3,
        goal: `Search for ${query}`,
        status: "pending",
        actionType: "search_input",
        params: { query, site, siteUrl },
      },
      {
        step: 4,
        goal: "Wait for search results",
        status: "pending",
        actionType: "wait_results",
        params: { query, site },
      },
      {
        step: 5,
        goal: isYouTubePlay ? "Play the first video" : "Open the first search result",
        status: "pending",
        actionType: isYouTubePlay ? "play_video" : "open_first_result",
        params: { query, site, rank: 1 },
      },
    ];

    if (needsPrice) {
      steps.push({
        step: 6,
        goal: "Find the product price",
        status: "pending",
        actionType: "extract_price",
        params: { site },
      });
      steps.push({
        step: 7,
        goal: "Return the price to the user",
        status: "pending",
        actionType: "report_result",
        params: {},
      });
    } else {
      steps.push({
        step: 6,
        goal: "Verify target page and complete task",
        status: "pending",
        actionType: "report_result",
        params: {},
      });
    }

    return {
      id: taskId,
      goal: userGoal,
      steps,
      createdAt: new Date().toISOString(),
      currentAction: `Planning task for "${userGoal}"`,
    };
  }
}

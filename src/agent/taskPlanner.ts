import type { TaskPlan, TaskStep } from "./agentTypes.js";

/**
 * LUMA Task Planner
 *
 * Decomposes complex natural language user goals into structured, high-level
 * user goals without exposing internal low-level operations.
 */
export class TaskPlanner {
  /**
   * Determines if a user query represents a multi-step autonomous agent goal
   * (e.g. searching, opening results, extracting prices).
   */
  static isAgentGoal(rawText: string): boolean {
    const text = rawText.toLowerCase().trim();

    // Check for price search goal: "search Amazon for ..., open the first result and tell me its price"
    const hasPriceGoal =
      /(?:tell\s+me\s+(?:its\s+)?price|get\s+(?:the\s+)?price|find\s+(?:the\s+)?price|price\s+kya\s+hai|price\s+batao|what\s+is\s+(?:the\s+)?price)/i.test(
        text
      );
    const hasFirstResult = /(?:first\s+result|first\s+product|pehla\s+result|pehla\s+product|open\s+(?:the\s+)?first)/i.test(text);
    const hasSearch = /(?:search|dhundo|find)/i.test(text);

    if (hasPriceGoal || (hasFirstResult && hasSearch)) {
      return true;
    }

    // Check for multi-step browser sequences with 3+ stages: "Open Chrome, search ..., open ..."
    if (text.includes(",") && (text.includes("search") || text.includes("open"))) {
      const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        return true;
      }
    }

    // Check if both opening Chrome and searching and opening results are requested
    if (
      (text.includes("chrome") || text.includes("browser")) &&
      hasSearch &&
      (hasFirstResult || hasPriceGoal || text.includes("result"))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Plans a complex user goal into sequential TaskSteps.
   */
  static planTask(userGoal: string): TaskPlan {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const text = userGoal.toLowerCase().trim();

    // Check if price extraction is requested
    const needsPrice =
      /(?:price|cost|price\s+batao|tell\s+me\s+its\s+price|price\s+kya\s+hai)/i.test(text);

    // 1. Extract Target Site (Google, YouTube, Amazon, etc.)
    // DEFAULT IS ALWAYS GOOGLE FOR GENERAL SEARCHES — NEVER DEFAULT TO AMAZON
    let site = "google";
    let siteDisplayName = "Google";
    let siteUrl = "https://www.google.com";

    if (text.includes("youtube") || text.includes("yt")) {
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

    // 2. Extract Query keyword (e.g. "wireless keyboards")
    let query = "wireless keyboards";
    const searchMatch =
      text.match(/(?:(?:on|in)\s+(?:amazon|google|youtube)\s+)?search\s+(?:on\s+|in\s+)?(?:amazon|google|youtube)?\s*(?:for\s+)?([^,]+?)(?:,\s*(?:open|tell)|and\s+(?:open|tell)|\s+open|\s+tell|$)/i) ||
      text.match(/search\s+(?:amazon|google|youtube)?\s*(?:for\s+)?([^,]+?)(?:,\s*(?:open|tell)|and\s+(?:open|tell)|\s+open|\s+tell|$)/i) ||
      text.match(/(?:amazon|google|youtube)?\s*(?:pe|par|mein|me)\s+([^,]+?)\s+(?:search|dhundo)/i) ||
      text.match(/(?:for\s+)([^,]+?)(?:,\s*(?:open|tell)|and\s+(?:open|tell)|\s+open|\s+tell|$)/i) ||
      text.match(/([a-zA-Z0-9\s]+?)\s+(?:search\s*karo|dhundo)/i);

    if (searchMatch && searchMatch[1]) {
      const candidate = searchMatch[1]
        .replace(/^(?:for\s+|amazon\s+|google\s+|youtube\s+)/i, "")
        .replace(/\b(?:on\s+amazon|on\s+google|on\s+youtube|in\s+amazon)\b/i, "")
        .trim();
      if (candidate.length > 0) {
        query = candidate;
      }
    }

    // Build the high-level user goal steps
    const steps: TaskStep[] = [
      {
        step: 1,
        goal: "Open Chrome",
        status: "pending",
        actionType: "open_app",
        params: { app: "chrome" },
      },
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
        goal: "Open the first search result",
        status: "pending",
        actionType: "open_first_result",
        params: { query, site },
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

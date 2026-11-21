import type { WorkflowContext, WorkflowResult } from "./types.js";
import { getSearchAdapter } from "./searchAdapters/adapterRegistry.js";

/**
 * Reusable Browser Search & Website Navigation Workflow
 * Dispatches through target-specific adapters (Google, YouTube, Amazon, etc.)
 */
export async function executeBrowserSearchWorkflow(
  siteKey: string,
  _siteDisplayName: string,
  query: string | null | undefined,
  _searchUrlTemplate: string | undefined,
  context: WorkflowContext
): Promise<WorkflowResult> {
  const adapter = getSearchAdapter(siteKey);

  try {
    if (!query || !query.trim()) {
      // User requested opening or navigating to the search target without a search query (e.g. "search YouTube")
      return await adapter.open(context);
    }

    // User requested a targeted or web search with an explicit query
    return await adapter.search(query, context);
  } catch (err: any) {
    context.onProgress(`Failed to search ${adapter.displayName}`, "failed");
    return {
      success: false,
      message: `Failed to search ${adapter.displayName}: ${err?.message || "Unknown error"}`,
      error: err?.message,
    };
  }
}


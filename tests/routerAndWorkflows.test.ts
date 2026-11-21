import { routeCommand } from "../src/router/commandRouter.js";
import { ConfirmationManager } from "../src/confirmation/confirmationManager.js";
import { ComputerStateManager } from "../src/state/computerState.js";

interface SubCommandExpectation {
  expectedIntent: string;
  expectedApp?: string;
  expectedTarget?: string;
  expectedQuerySnippet?: string;
}

interface TestCase {
  input: string;
  expectedIntent: string;
  expectedSite?: string;
  expectedTarget?: string;
  expectedBrowser?: string;
  expectedQuerySnippet?: string;
  expectedApp?: string;
  expectedFolderSnippet?: string;
  isCompound?: boolean;
  expectedSubCommands?: SubCommandExpectation[];
}

const TEST_CASES: TestCase[] = [
  // Application Control (English & Hindi)
  { input: "open chrome", expectedIntent: "OPEN_APP", expectedApp: "chrome" },
  { input: "Chrome kholo", expectedIntent: "OPEN_APP", expectedApp: "chrome" },
  { input: "launch Google Chrome", expectedIntent: "OPEN_APP", expectedApp: "chrome" },
  { input: "Google Chrome start karo", expectedIntent: "OPEN_APP", expectedApp: "chrome" },
  { input: "close chrome", expectedIntent: "CLOSE_APP", expectedApp: "chrome" },
  { input: "Chrome band karo", expectedIntent: "CLOSE_APP", expectedApp: "chrome" },
  { input: "open VS Code", expectedIntent: "OPEN_APP", expectedApp: "vscode" },
  { input: "VS Code kholo", expectedIntent: "OPEN_APP", expectedApp: "vscode" },
  { input: "close VS Code", expectedIntent: "CLOSE_APP", expectedApp: "vscode" },
  { input: "open calculator", expectedIntent: "OPEN_APP", expectedApp: "calc" },
  { input: "calculator kholo", expectedIntent: "OPEN_APP", expectedApp: "calc" },
  { input: "switch to Chrome", expectedIntent: "FOCUS_APP", expectedApp: "chrome" },
  { input: "bring VS Code to front", expectedIntent: "FOCUS_APP", expectedApp: "vscode" },

  // Website Commands (English & Hindi)
  { input: "open Google", expectedIntent: "OPEN_WEBSITE", expectedSite: "google", expectedTarget: "google" },
  { input: "Google kholo", expectedIntent: "OPEN_WEBSITE", expectedSite: "google", expectedTarget: "google" },
  { input: "open Amazon", expectedIntent: "OPEN_WEBSITE", expectedSite: "amazon", expectedTarget: "amazon" },
  { input: "Amazon kholo", expectedIntent: "OPEN_WEBSITE", expectedSite: "amazon", expectedTarget: "amazon" },
  { input: "Open YouTube", expectedIntent: "OPEN_WEBSITE", expectedSite: "youtube", expectedTarget: "youtube" },
  { input: "YT kholo", expectedIntent: "OPEN_WEBSITE", expectedSite: "youtube", expectedTarget: "youtube" },
  { input: "Open Gmail", expectedIntent: "OPEN_WEBSITE", expectedSite: "gmail", expectedTarget: "gmail" },
  { input: "mail kholo", expectedIntent: "OPEN_WEBSITE", expectedSite: "gmail", expectedTarget: "gmail" },
  { input: "Open GitHub", expectedIntent: "OPEN_WEBSITE", expectedSite: "github", expectedTarget: "github" },
  { input: "GitHub open karo", expectedIntent: "OPEN_WEBSITE", expectedSite: "github", expectedTarget: "github" },
  { input: "Open ChatGPT", expectedIntent: "OPEN_WEBSITE", expectedSite: "chatgpt", expectedTarget: "chatgpt" },
  { input: "on chrome open amazon", expectedIntent: "OPEN_WEBSITE", expectedSite: "amazon", expectedTarget: "amazon" },

  // Product & Web Searches (English & Hindi)
  {
    input: "on amazon search for keyboards under Rs 1500",
    expectedIntent: "SEARCH_PRODUCT",
    expectedSite: "amazon",
    expectedTarget: "amazon",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "keyboards under Rs 1500",
  },
  {
    input: "search on amazon for keyboards under Rs 1500",
    expectedIntent: "SEARCH_PRODUCT",
    expectedSite: "amazon",
    expectedTarget: "amazon",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "keyboards under Rs 1500",
  },
  {
    input: "on youtube search for lofi beats",
    expectedIntent: "SEARCH_WEB",
    expectedSite: "youtube",
    expectedTarget: "youtube",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "lofi beats",
  },
  {
    input: "on google search for python decorators",
    expectedIntent: "SEARCH_WEB",
    expectedSite: "google",
    expectedTarget: "google",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "python decorators",
  },
  {
    input: "search Amazon for keyboards",
    expectedIntent: "SEARCH_PRODUCT",
    expectedSite: "amazon",
    expectedTarget: "amazon",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "keyboards",
  },
  {
    input: "Amazon pe keyboard search karo",
    expectedIntent: "SEARCH_PRODUCT",
    expectedSite: "amazon",
    expectedTarget: "amazon",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "keyboard",
  },
  {
    input: "Amazon pe keyboard search kro",
    expectedIntent: "SEARCH_PRODUCT",
    expectedSite: "amazon",
    expectedTarget: "amazon",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "keyboard",
  },
  {
    input: "Amazon par keyboards dhundo",
    expectedIntent: "SEARCH_PRODUCT",
    expectedSite: "amazon",
    expectedTarget: "amazon",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "keyboards",
  },
  {
    input: "Amazon me keyboard search karna",
    expectedIntent: "SEARCH_PRODUCT",
    expectedSite: "amazon",
    expectedTarget: "amazon",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "keyboard",
  },
  {
    input: "Amazon me wireless mouse dhundo",
    expectedIntent: "SEARCH_PRODUCT",
    expectedSite: "amazon",
    expectedTarget: "amazon",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "wireless mouse",
  },
  {
    input: "search keyboards on Amazon",
    expectedIntent: "SEARCH_PRODUCT",
    expectedSite: "amazon",
    expectedTarget: "amazon",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "keyboards",
  },
  {
    input: "Google pe Python decorators search karo",
    expectedIntent: "SEARCH_WEB",
    expectedSite: "google",
    expectedTarget: "google",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "python decorators",
  },
  {
    input: "Google par Python search karo",
    expectedIntent: "SEARCH_WEB",
    expectedSite: "google",
    expectedTarget: "google",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "python",
  },
  {
    input: "YouTube pe music search karo",
    expectedIntent: "SEARCH_WEB",
    expectedSite: "youtube",
    expectedTarget: "youtube",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "music",
  },
  {
    input: "search Google for Python decorators",
    expectedIntent: "SEARCH_WEB",
    expectedSite: "google",
    expectedTarget: "google",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "python decorators",
  },
  {
    input: "Search the web for best laptops under 50000",
    expectedIntent: "SEARCH_WEB",
    expectedSite: "google",
    expectedTarget: "google",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "best laptops under 50000",
  },
  {
    input: "Search Python tutorials",
    expectedIntent: "SEARCH_WEB",
    expectedSite: "google",
    expectedTarget: "google",
    expectedBrowser: "chrome",
    expectedQuerySnippet: "python tutorials",
  },

  // File & Folder Operations
  { input: "open my Downloads folder", expectedIntent: "OPEN_FOLDER", expectedFolderSnippet: "downloads" },
  { input: "open downloads", expectedIntent: "OPEN_FOLDER", expectedFolderSnippet: "downloads" },
  { input: "open Documents", expectedIntent: "OPEN_FOLDER", expectedFolderSnippet: "documents" },
  { input: "Take me to Desktop", expectedIntent: "OPEN_FOLDER", expectedFolderSnippet: "desktop" },
  { input: "Create a folder called Luma", expectedIntent: "CREATE_FOLDER", expectedFolderSnippet: "Luma" },
  { input: "Create a folder named Projects on Desktop", expectedIntent: "CREATE_FOLDER", expectedFolderSnippet: "Projects on Desktop" },
  { input: "open report.pdf", expectedIntent: "OPEN_FILE" },
  { input: "delete report.pdf", expectedIntent: "DELETE" },
  { input: "delete the folder", expectedIntent: "DELETE" },

  // Media Controls
  { input: "Play", expectedIntent: "PLAY_MEDIA" },
  { input: "Pause", expectedIntent: "PAUSE_MEDIA" },
  { input: "Resume", expectedIntent: "RESUME_MEDIA" },
  { input: "Stop", expectedIntent: "STOP_MEDIA" },
  { input: "Play the next video", expectedIntent: "NEXT_MEDIA" },
  { input: "Pause the music", expectedIntent: "PAUSE_MEDIA" },
  { input: "volume up", expectedIntent: "VOLUME_UP" },
  { input: "volume down", expectedIntent: "VOLUME_DOWN" },
  { input: "mute", expectedIntent: "MUTE_MEDIA" },

  // System Awareness
  { input: "Take a screenshot", expectedIntent: "TAKE_SCREENSHOT" },
  { input: "what window is active?", expectedIntent: "GET_ACTIVE_WINDOW" },
  { input: "check system", expectedIntent: "CHECK_SYSTEM" },
  { input: "Luma, inspect my current computer state.", expectedIntent: "INSPECT_COMPUTER" },
  { input: "inspect my current computer state", expectedIntent: "INSPECT_COMPUTER" },
  { input: "computer observation", expectedIntent: "INSPECT_COMPUTER" },

  // Multi-step Compound Goals
  {
    input: "Open Chrome and search YouTube",
    expectedIntent: "COMPOUND_GOAL",
    isCompound: true,
    expectedSubCommands: [
      { expectedIntent: "OPEN_APP", expectedApp: "chrome" },
      { expectedIntent: "OPEN_OR_SEARCH_WEBSITE", expectedTarget: "youtube" },
    ],
  },
  {
    input: "Open Chrome and search YouTube for Python tutorials",
    expectedIntent: "COMPOUND_GOAL",
    isCompound: true,
    expectedSubCommands: [
      { expectedIntent: "OPEN_APP", expectedApp: "chrome" },
      { expectedIntent: "SEARCH_WEB", expectedTarget: "youtube", expectedQuerySnippet: "python tutorials" },
    ],
  },
  {
    input: "Open Chrome and search keyboard in Amazon",
    expectedIntent: "COMPOUND_GOAL",
    isCompound: true,
    expectedSubCommands: [
      { expectedIntent: "OPEN_APP", expectedApp: "chrome" },
      { expectedIntent: "SEARCH_PRODUCT", expectedTarget: "amazon", expectedQuerySnippet: "keyboard" },
    ],
  },
  {
    input: "Open Chrome and search Amazon for wireless keyboards",
    expectedIntent: "COMPOUND_GOAL",
    isCompound: true,
    expectedSubCommands: [
      { expectedIntent: "OPEN_APP", expectedApp: "chrome" },
      { expectedIntent: "SEARCH_PRODUCT", expectedTarget: "amazon", expectedQuerySnippet: "wireless keyboards" },
    ],
  },
  {
    input: "on chrome open amazon and on amazon search for keyboards under Rs 1500",
    expectedIntent: "COMPOUND_GOAL",
    isCompound: true,
    expectedSubCommands: [
      { expectedIntent: "OPEN_WEBSITE", expectedTarget: "amazon" },
      { expectedIntent: "SEARCH_PRODUCT", expectedTarget: "amazon", expectedQuerySnippet: "keyboards under rs 1500" },
    ],
  },
  {
    input: "Open Chrome and search Amazon for keyboards",
    expectedIntent: "COMPOUND_GOAL",
    isCompound: true,
    expectedSubCommands: [
      { expectedIntent: "OPEN_APP", expectedApp: "chrome" },
      { expectedIntent: "SEARCH_PRODUCT", expectedTarget: "amazon", expectedQuerySnippet: "keyboards" },
    ],
  },
  {
    input: "Chrome kholo aur Amazon pe keyboard search karo",
    expectedIntent: "COMPOUND_GOAL",
    isCompound: true,
    expectedSubCommands: [
      { expectedIntent: "OPEN_APP", expectedApp: "chrome" },
      { expectedIntent: "SEARCH_PRODUCT", expectedTarget: "amazon", expectedQuerySnippet: "keyboard" },
    ],
  },
  {
    input: "Chrome kholo aur Amazon pe keyboard search kro",
    expectedIntent: "COMPOUND_GOAL",
    isCompound: true,
    expectedSubCommands: [
      { expectedIntent: "OPEN_APP", expectedApp: "chrome" },
      { expectedIntent: "SEARCH_PRODUCT", expectedTarget: "amazon", expectedQuerySnippet: "keyboard" },
    ],
  },
  {
    input: "Amazon kholo aur keyboard search karo",
    expectedIntent: "COMPOUND_GOAL",
    isCompound: true,
    expectedSubCommands: [
      { expectedIntent: "OPEN_WEBSITE", expectedTarget: "amazon" },
      { expectedIntent: "SEARCH_PRODUCT", expectedTarget: "amazon", expectedQuerySnippet: "keyboard" },
    ],
  },
  {
    input: "Open VS Code and create a new file",
    expectedIntent: "COMPOUND_GOAL",
    isCompound: true,
  },

  // Confirmation Responses
  { input: "yes", expectedIntent: "CONFIRM_ACTION" },
  { input: "confirm", expectedIntent: "CONFIRM_ACTION" },
  { input: "kardo", expectedIntent: "CONFIRM_ACTION" },
  { input: "no", expectedIntent: "CANCEL_ACTION" },
  { input: "cancel", expectedIntent: "CANCEL_ACTION" },
  { input: "mat karo", expectedIntent: "CANCEL_ACTION" },

  // Unknown commands (must not crash)
  { input: "make me a cup of tea", expectedIntent: "UNKNOWN" },
  { input: "supercalifragilisticexpialidocious", expectedIntent: "UNKNOWN" },
];

async function runTestSuite() {
  console.log("=================================================");
  console.log("🧪 LUMA General Desktop Agent Test Suite");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    try {
      const routed = routeCommand(tc.input);

      let isMatch = routed.intent === tc.expectedIntent;

      if (isMatch && tc.expectedApp && routed.arguments.app !== tc.expectedApp) {
        isMatch = false;
        console.error(
          `❌ [App Mismatch] "${tc.input}" -> expected app "${tc.expectedApp}", got "${routed.arguments.app}"`
        );
      }

      if (isMatch && tc.expectedSite && (routed.arguments.site || routed.arguments.siteKey) !== tc.expectedSite) {
        isMatch = false;
        console.error(
          `❌ [Site Mismatch] "${tc.input}" -> expected site "${tc.expectedSite}", got "${routed.arguments.site || routed.arguments.siteKey}"`
        );
      }

      if (isMatch && tc.expectedTarget) {
        const actualTarget = routed.arguments.target || routed.arguments.site || routed.arguments.siteKey;
        if (actualTarget !== tc.expectedTarget) {
          isMatch = false;
          console.error(
            `❌ [Target Mismatch] "${tc.input}" -> expected target "${tc.expectedTarget}", got "${actualTarget}"`
          );
        }
      }

      if (isMatch && tc.expectedBrowser && routed.arguments.browser !== tc.expectedBrowser) {
        isMatch = false;
        console.error(
          `❌ [Browser Mismatch] "${tc.input}" -> expected browser "${tc.expectedBrowser}", got "${routed.arguments.browser}"`
        );
      }

      if (
        isMatch &&
        tc.expectedQuerySnippet &&
        !routed.arguments.query?.toLowerCase().includes(tc.expectedQuerySnippet.toLowerCase())
      ) {
        isMatch = false;
        console.error(
          `❌ [Query Mismatch] "${tc.input}" -> expected query snippet "${tc.expectedQuerySnippet}", got "${routed.arguments.query}"`
        );
      }

      if (isMatch && tc.isCompound && (!routed.subCommands || routed.subCommands.length < 2)) {
        isMatch = false;
        console.error(
          `❌ [Compound Split Mismatch] "${tc.input}" -> expected subCommands >= 2, got: ${JSON.stringify(routed.subCommands)}`
        );
      }

      if (isMatch && tc.expectedSubCommands && routed.subCommands) {
        let contextualTarget: string | undefined = undefined;
        for (let idx = 0; idx < tc.expectedSubCommands.length; idx++) {
          const expectedSub = tc.expectedSubCommands[idx];
          const actualSubInput = routed.subCommands[idx];
          if (!actualSubInput) {
            isMatch = false;
            console.error(`❌ [Missing Subcommand ${idx}] in "${tc.input}"`);
            break;
          }
          const routedSub = routeCommand(actualSubInput, contextualTarget);
          if (routedSub.arguments?.target && routedSub.arguments.target !== "chrome") {
            contextualTarget = routedSub.arguments.target;
          } else if (routedSub.arguments?.site && routedSub.arguments.site !== "chrome") {
            contextualTarget = routedSub.arguments.site;
          }
          if (routedSub.intent !== expectedSub.expectedIntent) {
            isMatch = false;
            console.error(
              `❌ [Subcommand ${idx} Intent Mismatch] "${actualSubInput}" -> expected ${expectedSub.expectedIntent}, got ${routedSub.intent}`
            );
            break;
          }
          if (expectedSub.expectedApp && routedSub.arguments.app !== expectedSub.expectedApp) {
            isMatch = false;
            console.error(
              `❌ [Subcommand ${idx} App Mismatch] "${actualSubInput}" -> expected app ${expectedSub.expectedApp}, got ${routedSub.arguments.app}`
            );
            break;
          }
          if (expectedSub.expectedTarget) {
            const actualSubTarget = routedSub.arguments.target || routedSub.arguments.site || routedSub.arguments.siteKey;
            if (actualSubTarget !== expectedSub.expectedTarget) {
              isMatch = false;
              console.error(
                `❌ [Subcommand ${idx} Target Mismatch] "${actualSubInput}" -> expected target ${expectedSub.expectedTarget}, got ${actualSubTarget}`
              );
              break;
            }
          }
          if (
            expectedSub.expectedQuerySnippet &&
            !routedSub.arguments.query?.toLowerCase().includes(expectedSub.expectedQuerySnippet.toLowerCase())
          ) {
            isMatch = false;
            console.error(
              `❌ [Subcommand ${idx} Query Mismatch] "${actualSubInput}" -> expected query ${expectedSub.expectedQuerySnippet}, got ${routedSub.arguments.query}`
            );
            break;
          }
        }
      }

      if (isMatch) {
        passed++;
        console.log(`✓ [PASS] "${tc.input}" -> ${routed.intent}`);
      } else {
        failed++;
        console.error(`✗ [FAIL] "${tc.input}" -> Expected ${tc.expectedIntent}, Got ${routed.intent}`);
      }
    } catch (err: any) {
      failed++;
      console.error(`💥 [CRASH] "${tc.input}" threw error:`, err?.message);
    }
  }

  // Safety Confirmation Manager Test
  console.log("\n--- Testing Safety Confirmation Gates ---");
  try {
    const { prompt } = ConfirmationManager.createConfirmationPrompt(
      "test_report.pdf",
      "delete",
      "delete_path",
      { path: "test_report.pdf" }
    );
    if (prompt.includes("test_report.pdf") && ComputerStateManager.getPendingConfirmation()?.target === "test_report.pdf") {
      console.log(`✓ [PASS] Confirmation gate created for test_report.pdf`);
      passed++;
    } else {
      console.error(`✗ [FAIL] Confirmation gate failed to set pending state`);
      failed++;
    }

    const cancelRes = ConfirmationManager.cancelPending();
    if (ComputerStateManager.getPendingConfirmation() === null && cancelRes.success) {
      console.log(`✓ [PASS] Confirmation safely cancelled`);
      passed++;
    } else {
      console.error(`✗ [FAIL] Confirmation cancellation failed`);
      failed++;
    }
  } catch (err: any) {
    console.error(`💥 [CRASH in Confirmation]:`, err?.message);
    failed++;
  }

  console.log("\n=================================================");
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();

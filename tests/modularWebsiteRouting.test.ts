import { ModuleRegistry } from "../server/computer/browser/modules/moduleRegistry.js";
import { AmazonModule } from "../server/computer/browser/modules/amazonModule.js";
import { FlipkartModule } from "../server/computer/browser/modules/flipkartModule.js";
import { YouTubeModule } from "../server/computer/browser/modules/youtubeModule.js";
import { GoogleModule } from "../server/computer/browser/modules/googleModule.js";
import { GenericBrowserModule } from "../server/computer/browser/modules/genericModule.js";
import { routeCommand } from "../src/router/commandRouter.js";
import { TaskPlanner } from "../src/agent/taskPlanner.js";
import { getSearchAdapter, FlipkartSearchAdapter, AmazonSearchAdapter, YouTubeSearchAdapter, GoogleSearchAdapter } from "../src/workflows/searchAdapters/adapterRegistry.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✓ [PASS] ${message}`);
}

async function runTests() {
  console.log("=================================================");
  console.log("🌐 LUMA Modular Website Routing & Modules Test Suite");
  console.log("=================================================");

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      passed++;
    } catch (err: any) {
      failed++;
      console.error(`Test failed: ${name} - ${err.message}`);
    }
  }

  // 1. Module Registry Resolution Tests
  console.log("\n--- 1. Testing: ModuleRegistry Resolution & Isolation ---");

  test("ModuleRegistry resolves Amazon by site key", () => {
    const mod = ModuleRegistry.resolve("amazon");
    assert(mod instanceof AmazonModule, "Resolves to AmazonModule");
    assert(mod.id === "amazon", "Module id is 'amazon'");
    assert(mod.displayName === "Amazon", "Display name is 'Amazon'");
  });

  test("ModuleRegistry resolves Flipkart by site key", () => {
    const mod = ModuleRegistry.resolve("flipkart");
    assert(mod instanceof FlipkartModule, "Resolves to FlipkartModule");
    assert(mod.id === "flipkart", "Module id is 'flipkart'");
    assert(mod.displayName === "Flipkart", "Display name is 'Flipkart'");
  });

  test("ModuleRegistry resolves YouTube by site key", () => {
    const mod = ModuleRegistry.resolve("youtube");
    assert(mod instanceof YouTubeModule, "Resolves to YouTubeModule");
    assert(mod.id === "youtube", "Module id is 'youtube'");
  });

  test("ModuleRegistry resolves Google by site key", () => {
    const mod = ModuleRegistry.resolve("google");
    assert(mod instanceof GoogleModule, "Resolves to GoogleModule");
    assert(mod.id === "google", "Module id is 'google'");
  });

  test("ModuleRegistry resolves Generic by site key", () => {
    const mod = ModuleRegistry.resolve("generic");
    assert(mod instanceof GenericBrowserModule, "Resolves to GenericBrowserModule");
    assert(mod.id === "generic", "Module id is 'generic'");
  });

  test("ModuleRegistry resolves by URL pattern when siteKey is omitted", () => {
    const flipkartMod = ModuleRegistry.resolve(undefined, "https://www.flipkart.com/search?q=kurti");
    assert(flipkartMod instanceof FlipkartModule, "Resolves Flipkart by URL");

    const amazonMod = ModuleRegistry.resolve(undefined, "https://www.amazon.in/s?k=keyboards");
    assert(amazonMod instanceof AmazonModule, "Resolves Amazon by URL");

    const ytMod = ModuleRegistry.resolve(undefined, "https://www.youtube.com/results?search_query=music");
    assert(ytMod instanceof YouTubeModule, "Resolves YouTube by URL");

    const googleMod = ModuleRegistry.resolve(undefined, "https://www.google.com/search?q=laptops");
    assert(googleMod instanceof GoogleModule, "Resolves Google by URL");
  });

  test("Explicit site key takes absolute priority over active URL", () => {
    // User explicitly selected Flipkart even if current page is still on Amazon
    const mod = ModuleRegistry.resolve("flipkart", "https://www.amazon.in/s?k=keyboards");
    assert(mod instanceof FlipkartModule, "Explicit site key overrides active page URL");
  });

  test("Generic searches NEVER silently default to Amazon", () => {
    const fallbackMod = ModuleRegistry.resolve(undefined, "about:blank");
    assert(!(fallbackMod instanceof AmazonModule), "Blank URL does NOT resolve to AmazonModule");
    assert(fallbackMod instanceof GenericBrowserModule, "Blank URL resolves to GenericBrowserModule");

    const unknownMod = ModuleRegistry.resolve("unknown_target", "https://example.com");
    assert(!(unknownMod instanceof AmazonModule), "Unknown target does NOT resolve to AmazonModule");
  });

  // 2. Adapter Registry Factory Tests
  console.log("\n--- 2. Testing: Search Adapter Factory ---");

  test("getSearchAdapter returns FlipkartSearchAdapter for 'flipkart'", () => {
    const adapter = getSearchAdapter("flipkart");
    assert(adapter instanceof FlipkartSearchAdapter, "Returns FlipkartSearchAdapter");
    assert(adapter.displayName === "Flipkart", "Adapter displayName is Flipkart");
  });

  test("getSearchAdapter returns AmazonSearchAdapter for 'amazon'", () => {
    const adapter = getSearchAdapter("amazon");
    assert(adapter instanceof AmazonSearchAdapter, "Returns AmazonSearchAdapter");
    assert(adapter.displayName === "Amazon", "Adapter displayName is Amazon");
  });

  test("getSearchAdapter returns YouTubeSearchAdapter for 'youtube'", () => {
    const adapter = getSearchAdapter("youtube");
    assert(adapter instanceof YouTubeSearchAdapter, "Returns YouTubeSearchAdapter");
  });

  test("getSearchAdapter returns GoogleSearchAdapter for 'google' and fallback", () => {
    const googleAdapter = getSearchAdapter("google");
    assert(googleAdapter instanceof GoogleSearchAdapter, "Returns GoogleSearchAdapter");

    const fallbackAdapter = getSearchAdapter("random_unregistered_site_123");
    assert(fallbackAdapter instanceof GoogleSearchAdapter, "Fallback is Google, never Amazon");
  });

  // 3. Deterministic Command Routing Tests
  console.log("\n--- 3. Testing: Deterministic Command Routing ---");

  test("'Open Flipkart and search kurti' routes strictly to Flipkart", () => {
    const routed = routeCommand("Open Flipkart and search kurti");
    assert(routed.intent === "COMPOUND_GOAL", "Routes to COMPOUND_GOAL");
    assert(routed.subCommands?.length === 2, "Splits into 2 subcommands");
    assert(routed.subCommands![0] === "open flipkart", "Subcommand 1 is 'open flipkart'");
    assert(routed.subCommands![1] === "search kurti", "Subcommand 2 is 'search kurti'");

    // Step 2 routing with propagated context "flipkart"
    const step2Routed = routeCommand("search kurti", "flipkart");
    assert(step2Routed.intent === "SEARCH_PRODUCT", "Step 2 is SEARCH_PRODUCT");
    assert(step2Routed.arguments.target === "flipkart", "Step 2 target is 'flipkart' (never Amazon)");
    assert(step2Routed.arguments.query === "kurti", "Step 2 query is 'kurti'");
  });

  test("'Search keyboard on Amazon' routes strictly to Amazon", () => {
    const routed = routeCommand("Search keyboard on Amazon");
    assert(routed.intent === "SEARCH_PRODUCT", "Routes to SEARCH_PRODUCT");
    assert(routed.arguments.target === "amazon", "Target is 'amazon'");
    assert(routed.arguments.query === "keyboard", "Query is 'keyboard'");
  });

  test("'Open YouTube and search music' routes strictly to YouTube", () => {
    const routed = routeCommand("Open YouTube and search music");
    assert(routed.intent === "COMPOUND_GOAL", "Routes to COMPOUND_GOAL");

    const step2Routed = routeCommand("search music", "youtube");
    assert(step2Routed.intent === "SEARCH_WEB", "Step 2 is SEARCH_WEB");
    assert(step2Routed.arguments.target === "youtube", "Target is 'youtube'");
    assert(step2Routed.arguments.query === "music", "Query is 'music'");
  });

  test("'Open Chrome and search Chrome Web Store' uses generic Google, NEVER Amazon", () => {
    const routed = routeCommand("Open Chrome and search Chrome Web Store");
    assert(routed.intent === "COMPOUND_GOAL", "Routes to COMPOUND_GOAL");

    const step2Routed = routeCommand("search chrome web store", undefined);
    assert(step2Routed.intent === "SEARCH_WEB", "Step 2 is SEARCH_WEB");
    assert(step2Routed.arguments.target === "google", "Target is 'google' (NEVER Amazon)");
    assert(step2Routed.arguments.query === "chrome web store", "Query is 'chrome web store'");
  });

  test("'Open Chrome and search YouTube' uses YouTube navigation, NEVER Amazon", () => {
    const routed = routeCommand("Open Chrome and search YouTube");
    assert(routed.intent === "COMPOUND_GOAL", "Routes to COMPOUND_GOAL");

    const step2Routed = routeCommand("search youtube", undefined);
    assert(step2Routed.arguments.target === "youtube", "Target is 'youtube' (NEVER Amazon)");
  });

  test("Hindi/Hinglish: 'Flipkart pe kurti search karo' routes to Flipkart", () => {
    const routed = routeCommand("Flipkart pe kurti search karo");
    assert(routed.intent === "SEARCH_PRODUCT", "Routes to SEARCH_PRODUCT");
    assert(routed.arguments.target === "flipkart", "Target is 'flipkart'");
    assert(routed.arguments.query === "kurti", "Query is 'kurti'");
  });

  // 4. Task Planner Tests
  console.log("\n--- 4. Testing: TaskPlanner Multi-Step Autonomous Goal Planning ---");

  test("Flipkart autonomous goal creates Flipkart steps, NEVER Amazon", () => {
    const plan = TaskPlanner.planTask("Open Flipkart, search for kurti, open the first result and tell me its price");
    assert(plan.steps.length === 7, "Plan contains 7 steps");
    assert(plan.steps[1].params?.site === "flipkart", "Step 2 targets Flipkart");
    assert(plan.steps[1].params?.url === "https://www.flipkart.com", "Step 2 URL is Flipkart");
    assert(plan.steps[2].params?.site === "flipkart", "Step 3 targets Flipkart");
    assert(plan.steps[2].params?.query === "kurti", "Step 3 query is 'kurti'");
    assert(plan.steps[3].params?.site === "flipkart", "Step 4 targets Flipkart");
    assert(plan.steps[4].params?.site === "flipkart", "Step 5 targets Flipkart");
    assert(plan.steps[5].params?.site === "flipkart", "Step 6 targets Flipkart");
  });

  test("Amazon autonomous goal creates Amazon steps (100% backward compatible)", () => {
    const plan = TaskPlanner.planTask("Open Chrome, search Amazon for wireless keyboards, open the first result and tell me its price");
    assert(plan.steps.length === 7, "Plan contains 7 steps");
    assert(plan.steps[1].params?.site === "amazon", "Step 2 targets Amazon");
    assert(plan.steps[1].params?.url === "https://www.amazon.in", "Step 2 URL is Amazon");
    assert(plan.steps[2].params?.site === "amazon", "Step 3 targets Amazon");
    assert(plan.steps[2].params?.query === "wireless keyboards", "Step 3 query is 'wireless keyboards'");
    assert(plan.steps[5].params?.site === "amazon", "Step 6 targets Amazon");
  });

  test("Flipkart command immediately after Amazon command isolates state", () => {
    const plan1 = TaskPlanner.planTask("search Amazon for mechanical keyboards, open the first result and tell me its price");
    const plan2 = TaskPlanner.planTask("search Flipkart for kurti, open the first result and tell me its price");

    assert(plan1.steps[1].params?.site === "amazon", "Plan 1 strictly targets Amazon");
    assert(plan2.steps[1].params?.site === "flipkart", "Plan 2 strictly targets Flipkart");
  });

  console.log("\n=================================================");
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log("=================================================");

  if (failed > 0) process.exit(1);
}

runTests();

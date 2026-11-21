import { TaskPlanner } from "../src/agent/taskPlanner.js";
import { AgentStateManager } from "../src/agent/agentStateManager.js";
import { BrowserInspectController } from "../server/computer/system/browserInspectController.js";

async function runTests() {
  console.log("=================================================");
  console.log("🤖 LUMA Autonomous Agent Execution Loop Test Suite");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Test TaskPlanner.isAgentGoal
  console.log("--- 1. Testing TaskPlanner.isAgentGoal ---");

  const targetGoal =
    "Open Chrome, search Amazon for wireless keyboards, open the first result and tell me its price.";
  assert(
    TaskPlanner.isAgentGoal(targetGoal) === true,
    `Identifies primary user goal as agent goal: "${targetGoal}"`
  );

  assert(
    TaskPlanner.isAgentGoal("search Amazon for wireless keyboards, open the first result and tell me its price") === true,
    "Identifies price goal without leading Chrome mention"
  );

  assert(
    TaskPlanner.isAgentGoal("Chrome kholo, Amazon pe wireless keyboard search karo, pehla product open karke price batao") === true,
    "Identifies Hinglish price search and open goal"
  );

  assert(
    TaskPlanner.isAgentGoal("Open Chrome, search Amazon for mechanical keyboards, open the first result") === true,
    "Identifies 3-stage open + search + open first result"
  );

  assert(
    TaskPlanner.isAgentGoal("open chrome") === false,
    "Single-shot 'open chrome' is not an agent goal"
  );

  assert(
    TaskPlanner.isAgentGoal("open downloads") === false,
    "Single-shot 'open downloads' is not an agent goal"
  );

  assert(
    TaskPlanner.isAgentGoal("take a screenshot") === false,
    "Single-shot 'take a screenshot' is not an agent goal"
  );

  // 2. Test TaskPlanner.planTask
  console.log("\n--- 2. Testing TaskPlanner.planTask Generation ---");

  const plan = TaskPlanner.planTask(targetGoal);
  assert(plan.steps.length === 7, `Plan has exactly 7 steps (got ${plan.steps.length})`);
  assert(plan.steps[0].goal === "Open Chrome", "Step 1 is Open Chrome");
  assert(plan.steps[1].goal === "Open Amazon", "Step 2 is Open Amazon");
  assert(plan.steps[2].goal === "Search for wireless keyboards", `Step 3 is Search for wireless keyboards (got "${plan.steps[2].goal}")`);
  assert(plan.steps[3].goal === "Wait for search results", "Step 4 is Wait for search results");
  assert(plan.steps[4].goal === "Open the first search result", "Step 5 is Open the first search result");
  assert(plan.steps[5].goal === "Find the product price", "Step 6 is Find the product price");
  assert(plan.steps[6].goal === "Return the price to the user", "Step 7 is Return the price to the user");

  const planNoPrice = TaskPlanner.planTask("Open Chrome, search Amazon for gaming mouse, open the first result");
  assert(planNoPrice.steps.length === 6, `Plan without price has 6 steps (got ${planNoPrice.steps.length})`);
  assert(planNoPrice.steps[2].goal === "Search for gaming mouse", `Step 3 extracted query "gaming mouse" (got "${planNoPrice.steps[2].goal}")`);

  // 3. Test AgentStateManager
  console.log("\n--- 3. Testing AgentStateManager & State Reactivity ---");

  let receivedEventCount = 0;
  let lastActionReceived = "";
  const unsubscribe = AgentStateManager.subscribe((state, p) => {
    receivedEventCount++;
    if (p?.currentAction) {
      lastActionReceived = p.currentAction;
    }
  });

  const signal = AgentStateManager.initTask(plan);
  assert(!signal.aborted, "Task initialization returns active AbortSignal");
  assert(AgentStateManager.getState().status === "running", "State is running");
  assert(AgentStateManager.getState().total_steps === 7, "State total_steps is 7");

  AgentStateManager.setCurrentAction("Navigating to Amazon...");
  assert(lastActionReceived === "Navigating to Amazon...", `Subscriber received current action (got "${lastActionReceived}")`);

  AgentStateManager.updateStep(1, { status: "success", resultMessage: "Chrome launched." });
  assert(receivedEventCount > 0, "Subscriber was notified of state updates");
  const activePlan = AgentStateManager.getPlan();
  assert(activePlan?.steps[0].status === "success", "Step 1 status updated to success in plan");

  // Test Stop Task
  AgentStateManager.stopTask();
  assert(AgentStateManager.isStopRequested() === true, "AgentStateManager.isStopRequested() is true after stopTask()");
  assert(signal.aborted === true, "AbortSignal is aborted after stopTask()");
  assert(AgentStateManager.getState().status === "stopped", "State status is stopped");

  unsubscribe();
  AgentStateManager.reset();

  // 4. Test Live Browser Inspection (Live Amazon Search & Price)
  console.log("\n--- 4. Testing Live Browser Inspection Controller ---");

  try {
    const searchRes = await BrowserInspectController.inspectAmazonSearch("wireless keyboards", "amazon.in");
    if (!searchRes.success) {
      console.warn(`[Network Note]: Live Amazon check skipped or rate limited: ${searchRes.error}`);
    } else {
      assert(searchRes.success === true, `Live Amazon search succeeded for "wireless keyboards"`);
      assert(typeof searchRes.productUrl === "string" && searchRes.productUrl.includes("/dp/"), `First organic product URL found: ${searchRes.productUrl?.substring(0, 50)}...`);
      assert(Boolean(searchRes.productTitle), `Product title found: "${searchRes.productTitle?.substring(0, 40)}..."`);
      assert(Boolean(searchRes.price), `Initial price discovered: "${searchRes.price}"`);

      if (searchRes.productUrl) {
        const priceRes = await BrowserInspectController.inspectProductPrice(searchRes.productUrl);
        assert(priceRes.success === true, `Product page inspection succeeded`);
        assert(Boolean(priceRes.price), `Exact product price extracted: "${priceRes.price}"`);
      }
    }
  } catch (err: any) {
    console.warn(`[Network Note]: Live Amazon check skipped or rate limited: ${err?.message}`);
  }

  console.log("\n=================================================");
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

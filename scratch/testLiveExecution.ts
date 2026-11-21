import { TaskPlanner } from "../src/agent/taskPlanner.js";
import { AgentExecutionLoop } from "../src/agent/agentExecutionLoop.js";

async function main() {
  const goal = "Open Chrome, search Amazon for wireless keyboards, open the first result and tell me its price.";
  console.log(`\n======================================================`);
  console.log(`Executing Goal: "${goal}"`);
  console.log(`======================================================\n`);

  const plan = TaskPlanner.planTask(goal);
  console.log("Generated Plan Steps:", plan.steps.map(s => `Step ${s.step}: [${s.actionType}] ${s.goal}`));

  const result = await AgentExecutionLoop.run(plan);
  console.log("\nExecution Result:", JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error("Execution error:", err);
  process.exit(1);
});

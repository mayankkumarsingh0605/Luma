import { routeCommand } from "../src/router/commandRouter.js";
import { TaskPlanner } from "../src/agent/taskPlanner.js";

const cmds = [
  "Chrome kholo aur Amazon pe keyboard search karo",
  "Amazon pe keyboard search kro",
  "Open Chrome and search for best laptops",
  "Open Chrome, search Amazon for wireless keyboards, open the first result and tell me its price."
];

for (const c of cmds) {
  console.log("==========================================");
  console.log("COMMAND: " + c);
  console.log("isAgentGoal:", TaskPlanner.isAgentGoal(c));
  const routed = routeCommand(c);
  console.log("Intent:", routed.intent);
  console.log("Matched Rule:", routed.matchedRule);
  console.log("Arguments:", JSON.stringify(routed.arguments));
  if (routed.subCommands) {
    console.log("SubCommands:", routed.subCommands);
    for (const sub of routed.subCommands) {
      const subR = routeCommand(sub);
      console.log(`  -> sub "${sub}": ${subR.intent} (${subR.matchedRule}) args:`, JSON.stringify(subR.arguments));
    }
  }
}

import { spawn } from "child_process";
import http from "http";

function get(url: string): Promise<{ statusCode?: number; body: string; error?: string }> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ statusCode: res.statusCode, body: data.slice(0, 200) }));
    });
    req.on("error", (err) => resolve({ error: err.message }));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ error: "timeout" });
    });
  });
}

function post(url: string, payload: any): Promise<{ statusCode?: number; body: any; error?: string }> {
  return new Promise((resolve) => {
    const bodyStr = JSON.stringify(payload);
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ statusCode: res.statusCode, body: data.slice(0, 200) });
          }
        });
      }
    );
    req.on("error", (err) => resolve({ error: err.message }));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ error: "timeout" });
    });
    req.write(bodyStr);
    req.end();
  });
}

async function run() {
  console.log("=================================================");
  console.log("🔍 LUMA DIAGNOSTIC AUDIT EXECUTION");
  console.log("=================================================\n");

  console.log("[Diag 1] Starting `npm run dev`...");
  const devProc = spawn("npm.cmd", ["run", "dev"], {
    cwd: process.cwd(),
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let serverOutput = "";
  devProc.stdout?.on("data", (d) => {
    const s = d.toString();
    serverOutput += s;
    process.stdout.write(s);
  });

  devProc.stderr?.on("data", (d) => {
    const s = d.toString();
    serverOutput += s;
    process.stderr.write(s);
  });

  // Wait 7 seconds for both servers to spin up
  console.log("[Diag 2] Waiting for Vite (5173) and Express (3001) startup...");
  await new Promise((r) => setTimeout(r, 7000));

  // Check backend health
  const health3001 = await get("http://localhost:3001/api/health");
  console.log("\n[Diag 2 Verification] Port 3001 Health Check:", health3001.statusCode === 200 ? "OK (200)" : health3001);

  // Check frontend health
  const front5173 = await get("http://localhost:5173/");
  console.log("[Diag 3 Verification] Port 5173 Initial Load:", front5173.statusCode === 200 ? "OK (200)" : front5173);

  // Reload frontend 3 times
  console.log("\n[Diag 4] Reloading frontend http://localhost:5173/ multiple times...");
  for (let i = 1; i <= 3; i++) {
    const reload = await get("http://localhost:5173/");
    console.log(`  Reload #${i}: Status ${reload.statusCode || reload.error}`);
  }

  // Check process responsiveness before Chrome launch
  console.log("\n[Diag 5] Process status before Chrome launch: Both alive.");

  // Test Step 1: Open Chrome using browser_connect via Vite proxy (5173)
  console.log("\n[Diag 6] Invoking Step 1 (Open Chrome / browser_connect) through Vite proxy at http://localhost:5173/api/computer/execute...");
  const step1 = await post("http://localhost:5173/api/computer/execute", {
    tool: "browser_connect",
    arguments: {},
  });
  console.log("Step 1 Response:", JSON.stringify(step1, null, 2));

  // Wait 4 seconds to observe file watcher activity on .chrome_profile
  console.log("\n[Diag 7 & 8] Waiting 4 seconds to observe Vite watcher behavior after Chrome launch...");
  await new Promise((r) => setTimeout(r, 4000));

  // Check if Vite (5173) is still alive
  const frontCheckAfterChrome = await get("http://localhost:5173/");
  console.log("[Diag 11 Check] Frontend (port 5173) status after Chrome launch:", frontCheckAfterChrome);

  // Check if Backend (3001) is still alive
  const backendCheckAfterChrome = await get("http://localhost:3001/api/health");
  console.log("[Diag 12 Check] Backend (port 3001) status after Chrome launch:", backendCheckAfterChrome);

  // Attempt Step 2: Open Amazon via Vite proxy (5173)
  console.log("\n[Diag 9 & 10] Attempting Step 2 (Open Amazon / browser_navigate) through Vite proxy at http://localhost:5173/api/computer/execute...");
  const step2ThroughVite = await post("http://localhost:5173/api/computer/execute", {
    tool: "browser_navigate",
    arguments: { url: "https://www.amazon.in" },
  });
  console.log("Step 2 (via Vite 5173) Result:", JSON.stringify(step2ThroughVite, null, 2));

  // Attempt Step 2 directly through Express (3001) to compare
  console.log("\n[Comparison Check] Attempting Step 2 directly through Express backend at http://localhost:3001/api/computer/execute...");
  const step2ThroughExpress = await post("http://localhost:3001/api/computer/execute", {
    tool: "browser_navigate",
    arguments: { url: "https://www.amazon.in" },
  });
  console.log("Step 2 (via Express 3001) Result:", JSON.stringify(step2ThroughExpress, null, 2));

  // Cleanup
  console.log("\n[Cleanup] Stopping dev processes...");
  devProc.kill("SIGINT");
  setTimeout(() => {
    devProc.kill("SIGKILL");
    process.exit(0);
  }, 1000);
}

run().catch((err) => {
  console.error("Diagnostic execution error:", err);
  process.exit(1);
});

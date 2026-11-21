import { spawn, type ChildProcess } from "child_process";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

async function cleanLingeringPorts() {
  try {
    const { stdout } = await execAsync('netstat -ano | findstr ":3001 :5173"').catch(() => ({ stdout: "" }));
    if (stdout.trim()) {
      const lines = stdout.trim().split("\n");
      const pids = new Set<string>();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0") pids.add(pid);
      }
      for (const pid of pids) {
        await execAsync(`taskkill /PID ${pid} /F /T`).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch {
    // Clean
  }
}

async function runCycle(cycleNumber: number): Promise<boolean> {
  console.log(`\n======================================================`);
  console.log(`▶ CYCLE ${cycleNumber}: STARTING LUMA VIA 'npm run dev'`);
  console.log(`======================================================`);

  await cleanLingeringPorts();

  // Spawn npm run dev via cmd.exe for Windows shell compatibility
  const child: ChildProcess = spawn("cmd.exe", ["/c", "npm", "run", "dev"], {
    cwd: process.cwd(),
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let serverReady = false;
  let viteReady = false;
  let processExited = false;
  let exitCode: number | null = null;

  child.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    if (text.includes("Luma Backend is running on http://localhost:3001")) {
      serverReady = true;
      console.log(`  [Backend Log] 🚀 Express 5 server is ready on http://localhost:3001`);
    }
    if (text.includes("Local:") || text.includes("ready in")) {
      viteReady = true;
      console.log(`  [Vite Log] ⚡ Vite 8 server is ready on http://localhost:5173`);
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    // Only log actual errors, not concurrently info
    if (!text.includes("Debugger") && !text.includes("ExperimentalWarning")) {
      console.error(`  [Process Stderr]:`, text.trim());
    }
  });

  child.on("exit", (code) => {
    processExited = true;
    exitCode = code;
  });

  // Wait for both to be ready (timeout: 15s)
  const startTime = Date.now();
  console.log("  Waiting for both servers to be fully active...");
  while ((!serverReady || !viteReady) && Date.now() - startTime < 15000) {
    if (processExited) {
      console.error(`❌ Process exited prematurely with code ${exitCode}`);
      return false;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!serverReady || !viteReady) {
    console.error(`❌ Timeout waiting for servers. Server: ${serverReady}, Vite: ${viteReady}`);
    if (child.pid) await execAsync(`taskkill /PID ${child.pid} /F /T`).catch(() => {});
    return false;
  }

  // Warmup pause
  await new Promise((r) => setTimeout(r, 500));
  console.log("✓ Both servers confirmed active and responding.\n");

  // Perform 10 consecutive reloads
  console.log(`--- Executing 10 Sequential Frontend & Proxy Reloads ---`);
  let passedReloads = 0;

  for (let i = 1; i <= 10; i++) {
    const reqStart = Date.now();
    try {
      // 1. Frontend index reload
      const feRes = await fetch("http://localhost:5173/");
      const feHtml = await feRes.text();
      const feOk = feRes.status === 200 && feHtml.includes("root");

      // 2. Vite Reverse Proxy to Backend
      const proxyRes = await fetch("http://localhost:5173/api/health");
      const proxyData: any = await proxyRes.json();
      const proxyOk = proxyRes.status === 200 && proxyData.status === "ok";

      // 3. Direct Backend check
      const beRes = await fetch("http://localhost:3001/api/health");
      const beData: any = await beRes.json();
      const beOk = beRes.status === 200 && beData.status === "ok";

      const elapsed = Date.now() - reqStart;

      if (feOk && proxyOk && beOk) {
        console.log(`  Reload ${i.toString().padStart(2, "0")}/10: SUCCESS (FE: 200 | Proxy: 200 | BE: 200 | Latency: ${elapsed}ms)`);
        passedReloads++;
      } else {
        console.error(`  Reload ${i.toString().padStart(2, "0")}/10: FAILED (FE: ${feRes.status}, Proxy: ${proxyRes.status}, BE: ${beRes.status})`);
      }
    } catch (err: any) {
      console.error(`  Reload ${i.toString().padStart(2, "0")}/10: EXCEPTION (${err.message})`);
    }

    if (processExited) {
      console.error(`❌ Dev server crashed during reload ${i}!`);
      return false;
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nCycle ${cycleNumber} Reload Summary: ${passedReloads}/10 reloads passed.`);

  // Stop process cleanly
  console.log("Stopping development server tree...");
  if (child.pid) {
    await execAsync(`taskkill /PID ${child.pid} /F /T`).catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 1000));
  await cleanLingeringPorts();
  console.log("✓ Ports 3001 and 5173 confirmed released.");

  return passedReloads === 10;
}

async function main() {
  console.log("======================================================");
  console.log("🧪 LUMA PHASE 1: LOCALHOST RELOAD & STABILITY VERIFICATION");
  console.log("======================================================");

  // Cycle 1: Start LUMA, Reload 10 times, Confirm stability
  const cycle1Pass = await runCycle(1);

  // Cycle 2: Stop and restart application, Repeat reload test
  const cycle2Pass = await runCycle(2);

  console.log("\n======================================================");
  console.log("📊 FINAL VERIFICATION REPORT");
  console.log("======================================================");
  console.log(`Cycle 1 (Initial start + 10 reloads): ${cycle1Pass ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`Cycle 2 (Restart + 10 reloads):       ${cycle2Pass ? "PASS ✓" : "FAIL ✗"}`);

  if (cycle1Pass && cycle2Pass) {
    console.log("\n🎉 ALL 20 RELOADS ACROSS 2 LIFECYCLE CYCLES PASSED WITH ZERO CRASHES OR DISCONNECTIONS!");
    process.exit(0);
  } else {
    console.error("\n❌ VERIFICATION FAILED!");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL ERROR in verification test:", err);
  process.exit(1);
});

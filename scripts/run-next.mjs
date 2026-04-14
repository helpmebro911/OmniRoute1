#!/usr/bin/env node

import fs from "fs";
import path from "path";
import {
  resolveRuntimePorts,
  withRuntimePortEnv,
  spawnWithForwardedSignals,
} from "./runtime-env.mjs";
import { bootstrapEnv } from "./bootstrap-env.mjs";

// Add check for conflicting app/ directory (Issue #1206)
const rootAppDir = path.join(process.cwd(), "app");
if (fs.existsSync(rootAppDir) && fs.statSync(rootAppDir).isDirectory()) {
  console.error("\x1b[31m[FATAL ERROR]\x1b[0m Next.js App Router conflict detected!");
  console.error(`A root-level 'app/' directory was found at: ${rootAppDir}`);
  console.error("This conflicts with the 'src/app/' directory on Windows environments.");
  console.error("Next.js will serve 404s for all pages because it prefers the root 'app/' folder.");
  console.error("Please rename or delete the root 'app/' directory before starting OmniRoute.\n");
  process.exit(1);
}

const mode = process.argv[2] === "start" ? "start" : "dev";

// Load .env / server.env first so PORT / DASHBOARD_PORT from files affect --port below.
const env = bootstrapEnv();
const runtimePorts = resolveRuntimePorts(env);
const { dashboardPort } = runtimePorts;

const args = ["./node_modules/next/dist/bin/next", mode, "--port", String(dashboardPort)];
// Default: use webpack (stable). Set OMNIROUTE_USE_TURBOPACK=1 in .env for Turbopack (faster dev).
// Must read merged `env` from bootstrap — .env is not applied to process.env in the launcher.
if (mode === "dev" && env.OMNIROUTE_USE_TURBOPACK !== "1") {
  args.splice(2, 0, "--webpack");
}

spawnWithForwardedSignals(process.execPath, args, {
  stdio: "inherit",
  env: withRuntimePortEnv(env, runtimePorts),
});

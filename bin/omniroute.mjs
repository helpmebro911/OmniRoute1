#!/usr/bin/env node

// bin/omniroute.ts
import { spawn } from "node:child_process";
import { existsSync as existsSync2, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";

// scripts/native-binary-compat.mjs
import { existsSync, openSync, readSync, closeSync } from "node:fs";
var PUBLISHED_BUILD_PLATFORM = "linux";
var PUBLISHED_BUILD_ARCH = "x64";
var HEADER_SIZE = 4096;
var MAX_FAT_ARCH_COUNT = 30;
function mapElfMachine(machine) {
  switch (machine) {
    case 62:
      return "x64";
    case 183:
      return "arm64";
    default:
      return null;
  }
}
function mapMachCpuType(cpuType) {
  switch (cpuType) {
    case 16777223:
      return "x64";
    case 16777228:
      return "arm64";
    default:
      return null;
  }
}
function mapPeMachine(machine) {
  switch (machine) {
    case 34404:
      return "x64";
    case 43620:
      return "arm64";
    default:
      return null;
  }
}
function readUInt16(buffer, offset, littleEndian) {
  return littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}
function readUInt32(buffer, offset, littleEndian) {
  return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}
var ELF_MAGIC = 2135247942;
function detectElfTarget(buffer) {
  if (buffer.length < 20) return null;
  if (buffer.readUInt32BE(0) !== ELF_MAGIC) return null;
  const littleEndian = buffer[5] !== 2;
  const arch = mapElfMachine(readUInt16(buffer, 18, littleEndian));
  if (!arch) return null;
  return { platform: "linux", architectures: [arch] };
}
var THIN_MACH_MAGIC = /* @__PURE__ */ new Map([
  [4277009102, false],
  [4277009103, false],
  [3472551422, true],
  [3489328638, true],
]);
var FAT_MACH_MAGIC = /* @__PURE__ */ new Map([
  [3405691582, false],
  [3405691583, false],
  [3199925962, true],
  [3216703178, true],
]);
function detectMachTarget(buffer) {
  if (buffer.length < 8) return null;
  const magic = buffer.readUInt32BE(0);
  if (THIN_MACH_MAGIC.has(magic)) {
    const littleEndian2 = THIN_MACH_MAGIC.get(magic);
    const arch = mapMachCpuType(readUInt32(buffer, 4, littleEndian2));
    if (!arch) return null;
    return { platform: "darwin", architectures: [arch] };
  }
  if (!FAT_MACH_MAGIC.has(magic)) return null;
  const littleEndian = FAT_MACH_MAGIC.get(magic);
  const isFat64 = magic === 3405691583 || magic === 3216703178;
  const archCount = readUInt32(buffer, 4, littleEndian);
  if (archCount > MAX_FAT_ARCH_COUNT) return null;
  const entrySize = isFat64 ? 32 : 20;
  const architectures = /* @__PURE__ */ new Set();
  for (let index = 0; index < archCount; index += 1) {
    const offset = 8 + index * entrySize;
    if (offset + 4 > buffer.length) break;
    const arch = mapMachCpuType(readUInt32(buffer, offset, littleEndian));
    if (arch) architectures.add(arch);
  }
  if (architectures.size === 0) return null;
  return { platform: "darwin", architectures: [...architectures] };
}
function detectPeTarget(buffer) {
  if (buffer.length < 64) return null;
  if (buffer.readUInt16LE(0) !== 23117) return null;
  const peHeaderOffset = buffer.readUInt32LE(60);
  if (peHeaderOffset + 6 > buffer.length) return null;
  if (buffer.readUInt32LE(peHeaderOffset) !== 17744) return null;
  const arch = mapPeMachine(buffer.readUInt16LE(peHeaderOffset + 4));
  if (!arch) return null;
  return { platform: "win32", architectures: [arch] };
}
function detectNativeBinaryTarget(buffer) {
  return detectElfTarget(buffer) ?? detectMachTarget(buffer) ?? detectPeTarget(buffer);
}
function readNativeBinaryTarget(binaryPath) {
  if (!existsSync(binaryPath)) return null;
  let fd;
  try {
    fd = openSync(binaryPath, "r");
    const buffer = Buffer.alloc(HEADER_SIZE);
    const bytesRead = readSync(fd, buffer, 0, HEADER_SIZE, 0);
    return detectNativeBinaryTarget(buffer.subarray(0, bytesRead));
  } catch (err) {
    console.warn(`  \u26A0\uFE0F  Could not read native binary at ${binaryPath}: ${err.message}`);
    return null;
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
}
function isNativeBinaryCompatible(
  binaryPath,
  { runtimePlatform = process.platform, runtimeArch = process.arch, dlopen = process.dlopen } = {}
) {
  const target = readNativeBinaryTarget(binaryPath);
  if (target) {
    if (
      (target.platform !== runtimePlatform &&
        !(target.platform === "linux" && runtimePlatform === "android")) ||
      !target.architectures.includes(runtimeArch)
    ) {
      return false;
    }
  } else if (runtimePlatform !== PUBLISHED_BUILD_PLATFORM || runtimeArch !== PUBLISHED_BUILD_ARCH) {
    return false;
  }
  try {
    dlopen({ exports: {} }, binaryPath);
    return true;
  } catch (err) {
    console.warn(`  \u26A0\uFE0F  Native binary dlopen failed: ${err.message}`);
    return false;
  }
}

// src/shared/utils/nodeRuntimeSupport.ts
var SECURE_NODE_LINES = Object.freeze([
  Object.freeze({ major: 20, minor: 20, patch: 2 }),
  Object.freeze({ major: 22, minor: 22, patch: 2 }),
]);
var RECOMMENDED_NODE_VERSION = "22.22.2";
var SUPPORTED_NODE_RANGE = ">=20.20.2 <21 || >=22.22.2 <23";
var SUPPORTED_NODE_DISPLAY = "Node.js 20.20.2+ (20.x LTS) or 22.22.2+ (22.x LTS)";
function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}
function parseNodeVersion(version = process.versions.node) {
  const rawInput = String(version || process.versions.node || "0.0.0").trim();
  const normalized = rawInput.replace(/^v/i, "");
  const parts = normalized.split(".");
  const major = Number.parseInt(parts[0] || "0", 10);
  const minor = Number.parseInt(parts[1] || "0", 10);
  const patch = Number.parseInt(parts[2] || "0", 10);
  return {
    raw: normalized ? `v${normalized}` : "v0.0.0",
    normalized: normalized || "0.0.0",
    major: Number.isFinite(major) ? major : 0,
    minor: Number.isFinite(minor) ? minor : 0,
    patch: Number.isFinite(patch) ? patch : 0,
  };
}
function compareNodeVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}
function getSecureFloorForMajor(major) {
  return SECURE_NODE_LINES.find((line) => line.major === major) || null;
}
function getNodeRuntimeSupport(version = process.versions.node) {
  const parsed = parseNodeVersion(version);
  const secureFloor = getSecureFloorForMajor(parsed.major);
  const nodeCompatible = secureFloor ? compareNodeVersions(parsed, secureFloor) >= 0 : false;
  let reason = "unsupported-major";
  if (nodeCompatible) {
    reason = "supported";
  } else if (secureFloor) {
    reason = "below-security-floor";
  } else if (parsed.major >= 24) {
    reason = "native-addon-incompatible";
  }
  return {
    nodeVersion: parsed.raw,
    nodeCompatible,
    reason,
    supportedRange: SUPPORTED_NODE_RANGE,
    supportedDisplay: SUPPORTED_NODE_DISPLAY,
    recommendedVersion: `v${RECOMMENDED_NODE_VERSION}`,
    minimumSecureVersion: secureFloor ? `v${formatVersion(secureFloor)}` : null,
  };
}
function getNodeRuntimeWarning(version = process.versions.node) {
  const support = getNodeRuntimeSupport(version);
  if (support.nodeCompatible) return null;
  if (support.reason === "below-security-floor" && support.minimumSecureVersion) {
    return `Node.js ${support.nodeVersion} is below the patched minimum ${support.minimumSecureVersion} for this LTS line.`;
  }
  if (support.reason === "native-addon-incompatible") {
    return `Node.js ${support.nodeVersion} is outside the supported LTS lines and may fail at runtime because better-sqlite3 does not support Node.js 24+ here.`;
  }
  return `Node.js ${support.nodeVersion} is outside OmniRoute's approved secure runtime policy.`;
}

// bin/omniroute.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var ROOT = join(__dirname, "..");
var APP_DIR = join(ROOT, "app");
function loadEnvFile() {
  const envPaths = [];
  if (process.env.DATA_DIR) {
    envPaths.push(join(process.env.DATA_DIR, ".env"));
  }
  const home = homedir();
  if (home) {
    if (platform() === "win32") {
      const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
      envPaths.push(join(appData, "omniroute", ".env"));
    } else {
      envPaths.push(join(home, ".omniroute", ".env"));
    }
  }
  envPaths.push(join(process.cwd(), ".env"));
  for (const envPath of envPaths) {
    try {
      if (existsSync2(envPath)) {
        const content = readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const value = trimmed.slice(eqIdx + 1).trim();
            if (process.env[key] === void 0) {
              process.env[key] = value.replace(/^["']|["']$/g, "");
            }
          }
        }
        console.log(`  \x1B[2m\u{1F4CB} Loaded env from ${envPath}\x1B[0m`);
        return;
      }
    } catch {}
  }
}
loadEnvFile();
var args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
  \x1B[1m\x1B[36m\u26A1 OmniRoute\x1B[0m \u2014 Smart AI Router with Auto Fallback

  \x1B[1mUsage:\x1B[0m
    omniroute                 Start the server
    omniroute --port <port>   Use custom API port (default: 20128)
    omniroute --no-open       Don't open browser automatically
    omniroute --mcp           Start MCP server (stdio transport for IDEs)
    omniroute --help          Show this help
    omniroute --version       Show version

  \x1B[1mMCP Integration:\x1B[0m
    The --mcp flag starts an MCP server over stdio, exposing OmniRoute
    tools for AI agents in VS Code, Cursor, Claude Desktop, and Copilot.

    Available tools: omniroute_get_health, omniroute_list_combos,
    omniroute_check_quota, omniroute_route_request, and more.

  \x1B[1mConfig:\x1B[0m
    Loads .env from: ~/.omniroute/.env or ./.env
    Memory limit: OMNIROUTE_MEMORY_MB (default: 512)

  \x1B[1mAfter starting:\x1B[0m
    Dashboard:  http://localhost:<dashboard-port>
    API:        http://localhost:<api-port>/v1

  \x1B[1mConnect your tools:\x1B[0m
    Set your CLI tool (Cursor, Cline, Codex, etc.) to use:
    \x1B[33mhttp://localhost:<api-port>/v1\x1B[0m
  `);
  process.exit(0);
}
if (args.includes("--version") || args.includes("-v")) {
  try {
    const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    console.log(version);
  } catch {
    console.log("unknown");
  }
  process.exit(0);
}
if (args.includes("--mcp")) {
  try {
    const { startMcpCli } = await import(join(ROOT, "bin", "mcp-server.mjs"));
    await startMcpCli(ROOT);
  } catch (err) {
    console.error("\x1B[31m\u2716 Failed to start MCP server:\x1B[0m", err.message || err);
    process.exit(1);
  }
  process.exit(0);
}
function parsePort(value, fallback) {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}
var port = parsePort(process.env.PORT || "20128", 20128);
var portIdx = args.indexOf("--port");
if (portIdx !== -1 && args[portIdx + 1]) {
  const cliPort = parsePort(args[portIdx + 1], null);
  if (cliPort === null) {
    console.error("\x1B[31m\u2716 Invalid port number\x1B[0m");
    process.exit(1);
  }
  port = cliPort;
}
var apiPort = parsePort(process.env.API_PORT || String(port), port);
var dashboardPort = parsePort(process.env.DASHBOARD_PORT || String(port), port);
var noOpen = args.includes("--no-open");
console.log(`
\x1B[36m   ____                  _ ____              _
   / __ \\                (_) __ \\            | |
  | |  | |_ __ ___  _ __ _| |__) |___  _   _| |_ ___
  | |  | | '_ \` _ \\| '_ \\ |  _  // _ \\| | | | __/ _ \\
  | |__| | | | | | | | | | | | \\ \\ (_) | |_| | ||  __/
   \\____/|_| |_| |_|_| |_|_|_|  \\_\\___/ \\__,_|\\__\\___|
\x1B[0m`);
var nodeSupport = getNodeRuntimeSupport();
if (!nodeSupport.nodeCompatible) {
  const runtimeWarning = getNodeRuntimeWarning() || "Unsupported Node.js runtime detected.";
  console.warn(`\x1B[33m  \u26A0  Warning: You are running Node.js ${process.versions.node}.
     ${runtimeWarning}

     Supported secure runtimes: ${nodeSupport.supportedDisplay}
     Recommended: use Node.js ${nodeSupport.recommendedVersion} or newer on the 22.x LTS line.
     Workaround:  npm rebuild better-sqlite3\x1B[0m
`);
}
var serverJs = join(APP_DIR, "server.js");
if (!existsSync2(serverJs)) {
  console.error("\x1B[31m\u2716 Server not found at:\x1B[0m", serverJs);
  console.error("  The package may not have been built correctly.");
  console.error("");
  const nodeExec = process.execPath || "";
  const isMise = nodeExec.includes("mise") || nodeExec.includes(".local/share/mise");
  const isNvm = nodeExec.includes(".nvm") || nodeExec.includes("nvm");
  if (isMise) {
    console.error(
      "  \x1B[33m\u26A0 mise detected:\x1B[0m If you installed via `npm install -g omniroute`,"
    );
    console.error("    try: \x1B[36mnpx omniroute@latest\x1B[0m  (downloads a fresh copy)");
    console.error("    or:  \x1B[36mmise exec -- npx omniroute\x1B[0m");
  } else if (isNvm) {
    console.error(
      "  \x1B[33m\u26A0 nvm detected:\x1B[0m Try reinstalling after loading the correct Node version:"
    );
    console.error("    \x1B[36mnvm use --lts && npm install -g omniroute\x1B[0m");
  } else {
    console.error("  Try: \x1B[36mnpm install -g omniroute\x1B[0m  (reinstall)");
    console.error("  Or:  \x1B[36mnpx omniroute@latest\x1B[0m");
  }
  process.exit(1);
}
var sqliteBinary = join(
  APP_DIR,
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node"
);
if (existsSync2(sqliteBinary) && !isNativeBinaryCompatible(sqliteBinary)) {
  console.error(
    "\x1B[31m\u2716 better-sqlite3 native module is incompatible with this platform.\x1B[0m"
  );
  console.error(`  Run: cd ${APP_DIR} && npm rebuild better-sqlite3`);
  if (platform() === "darwin") {
    console.error("  If build tools are missing: xcode-select --install");
  }
  process.exit(1);
}
console.log(`  \x1B[2m\u23F3 Starting server...\x1B[0m
`);
var rawMemory = parseInt(process.env.OMNIROUTE_MEMORY_MB || "512", 10);
var memoryLimit =
  Number.isFinite(rawMemory) && rawMemory >= 64 && rawMemory <= 16384 ? rawMemory : 512;
var env = {
  ...process.env,
  OMNIROUTE_PORT: String(port),
  PORT: String(dashboardPort),
  DASHBOARD_PORT: String(dashboardPort),
  API_PORT: String(apiPort),
  HOSTNAME: "0.0.0.0",
  NODE_ENV: "production",
  NODE_OPTIONS: `--max-old-space-size=${memoryLimit}`,
};
var server = spawn("node", [`--max-old-space-size=${memoryLimit}`, serverJs], {
  cwd: APP_DIR,
  env,
  stdio: "pipe",
});
var started = false;
server.stdout.on("data", (data) => {
  const text = data.toString();
  process.stdout.write(text);
  if (
    !started &&
    (text.includes("Ready") || text.includes("started") || text.includes("listening"))
  ) {
    started = true;
    onReady();
  }
});
server.stderr.on("data", (data) => {
  process.stderr.write(data);
});
server.on("error", (err) => {
  console.error("\x1B[31m\u2716 Failed to start server:\x1B[0m", err.message);
  process.exit(1);
});
server.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`\x1B[31m\u2716 Server exited with code ${code}\x1B[0m`);
  }
  process.exit(code ?? 0);
});
function shutdown() {
  console.log("\n\x1B[33m\u23F9 Shutting down OmniRoute...\x1B[0m");
  server.kill("SIGTERM");
  setTimeout(() => {
    server.kill("SIGKILL");
    process.exit(0);
  }, 5e3);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
async function onReady() {
  const dashboardUrl = `http://localhost:${dashboardPort}`;
  const apiUrl = `http://localhost:${apiPort}`;
  console.log(`
  \x1B[32m\u2714 OmniRoute is running!\x1B[0m

  \x1B[1m  Dashboard:\x1B[0m  ${dashboardUrl}
  \x1B[1m  API Base:\x1B[0m   ${apiUrl}/v1

  \x1B[2m  Point your CLI tool (Cursor, Cline, Codex) to:\x1B[0m
  \x1B[33m  ${apiUrl}/v1\x1B[0m

  \x1B[2m  Press Ctrl+C to stop\x1B[0m
  `);
  if (!noOpen) {
    try {
      const open = await import("open");
      await open.default(dashboardUrl);
    } catch {}
  }
}
setTimeout(() => {
  if (!started) {
    started = true;
    onReady();
  }
}, 15e3);

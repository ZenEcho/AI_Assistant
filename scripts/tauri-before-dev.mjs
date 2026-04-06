import { spawn } from "node:child_process";
import http from "node:http";
import process from "node:process";

const DEV_SERVER_URL = "http://127.0.0.1:1420/";
const PROJECT_MARKER = 'name="tauri-dev-project" content="ai-translation-desktop"';
const CHECK_INTERVAL_MS = 5_000;
const STARTUP_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 1_500;
const START_COMMAND = process.platform === "win32" ? "cmd.exe" : "pnpm";
const START_ARGS = process.platform === "win32" ? ["/c", "pnpm", "dev"] : ["dev"];

let devServerProcess = null;
let monitorTimer = null;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      if (!response.statusCode || response.statusCode >= 400) {
        response.resume();
        reject(new Error(`Unexpected status code: ${response.statusCode ?? "unknown"}`));
        return;
      }

      const chunks = [];
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolve(chunks.join(""));
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Timed out after ${REQUEST_TIMEOUT_MS}ms.`));
    });
    request.on("error", reject);
  });
}

async function getDevServerState() {
  try {
    const html = await requestText(DEV_SERVER_URL);

    return {
      reachable: true,
      reusable: html.includes(PROJECT_MARKER),
    };
  } catch {
    return {
      reachable: false,
      reusable: false,
    };
  }
}

async function waitForDevServerReady() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const state = await getDevServerState();

    if (state.reusable) {
      return;
    }

    if (state.reachable) {
      throw new Error(
        `Port 1420 is serving a different app. Stop that process or change the Vite/Tauri dev port.`,
      );
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for the Vite dev server at ${DEV_SERVER_URL}`);
}

function stopDevServer() {
  if (!devServerProcess || devServerProcess.killed) {
    return;
  }

  devServerProcess.kill("SIGTERM");
}

function cleanupAndExit(code) {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }

  stopDevServer();
  process.exit(code);
}

function startMonitor() {
  monitorTimer = setInterval(() => {
    void (async () => {
      const state = await getDevServerState();

      if (state.reusable) {
        return;
      }

      console.error(`[tauri-before-dev] Dev server at ${DEV_SERVER_URL} is no longer available.`);
      cleanupAndExit(1);
    })();
  }, CHECK_INTERVAL_MS);
}

function attachSignalHandlers() {
  for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
    process.on(signal, () => {
      cleanupAndExit(0);
    });
  }
}

async function main() {
  attachSignalHandlers();

  const existingServer = await getDevServerState();

  if (existingServer.reusable) {
    console.log(`[tauri-before-dev] Reusing existing Vite dev server at ${DEV_SERVER_URL}`);
    startMonitor();
    return;
  }

  if (existingServer.reachable) {
    throw new Error(
      `Port 1420 is already in use by a different app. Stop that process or change the Vite/Tauri dev port.`,
    );
  }

  console.log(`[tauri-before-dev] Starting Vite dev server on ${DEV_SERVER_URL}`);
  devServerProcess = spawn(START_COMMAND, START_ARGS, {
    stdio: "inherit",
  });

  devServerProcess.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
      return;
    }

    process.exit(code ?? 0);
  });

  await waitForDevServerReady();
  startMonitor();
}

void main().catch((error) => {
  console.error(`[tauri-before-dev] ${error instanceof Error ? error.message : String(error)}`);
  cleanupAndExit(1);
});

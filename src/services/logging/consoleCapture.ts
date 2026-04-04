import { appLogger } from "@/services/logging/logger";
import { useAppConfigStore } from "@/stores/appConfig";

type ConsoleMethod = "error" | "warn";

const originalConsole = {
  error: console.error.bind(console),
  warn: console.warn.bind(console),
};

let installed = false;
let forwarding = false;

function stringifyArgument(value: unknown) {
  if (value instanceof Error) {
    return value.stack || value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function shouldCapture() {
  try {
    return useAppConfigStore().preferences.logging.captureConsoleErrors;
  } catch {
    return false;
  }
}

function forward(method: ConsoleMethod, args: unknown[]) {
  if (forwarding || !shouldCapture()) {
    return;
  }

  forwarding = true;

  try {
    const serialized = args.map((item) => stringifyArgument(item)).filter(Boolean);
    const stackSource = args.find((item) => item instanceof Error);

    if (method === "error") {
      void appLogger.error("console.error", "捕获到 console.error 输出", {
        category: "error",
        source: "frontend",
        visibility: "debug",
        detail: {
          args: serialized,
        },
        errorStack: stackSource instanceof Error ? stackSource.stack : undefined,
      });
      return;
    }

    void appLogger.warn("console.warn", "捕获到 console.warn 输出", {
      category: "debug",
      source: "frontend",
      visibility: "debug",
      detail: {
        args: serialized,
      },
      errorStack: stackSource instanceof Error ? stackSource.stack : undefined,
    });
  } finally {
    forwarding = false;
  }
}

export function installConsoleCapture() {
  if (installed) {
    return;
  }

  installed = true;

  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    forward("error", args);
  };

  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    forward("warn", args);
  };
}

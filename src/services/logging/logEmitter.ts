import { APP_LOG_SYNC_CHANNEL } from "@/constants/logging";
import { appendAppLog } from "@/services/logging/logStorage";
import { sanitizeLogRecord } from "@/services/logging/logSanitizer";
import { generateId } from "@/utils/id";
import type { AppLogRecord } from "@/types/log";

const fallbackSourceId = generateId();

let syncChannel: BroadcastChannel | null = null;
let queue: AppLogRecord[] = [];
let flushing = false;
let flushTimer: number | null = null;

function getSyncChannel() {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  syncChannel ??= new BroadcastChannel(APP_LOG_SYNC_CHANNEL);
  return syncChannel;
}

async function flushQueue() {
  if (flushing || queue.length === 0) {
    return;
  }

  flushing = true;
  const pending = [...queue];
  queue = [];

  try {
    await Promise.all(
      pending.map(async (record) => {
        const persisted = await appendAppLog(record);
        getSyncChannel()?.postMessage({
          source: fallbackSourceId,
          record: persisted,
        });
      }),
    );
  } finally {
    flushing = false;

    if (queue.length > 0) {
      void flushQueue();
    }
  }
}

function scheduleFlush() {
  if (flushTimer != null) {
    return;
  }

  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, 100);
}

export async function emitLog(record: AppLogRecord) {
  queue.push(sanitizeLogRecord(record));

  if (queue.length >= 20) {
    await flushQueue();
    return;
  }

  scheduleFlush();
}

export async function flushLogs() {
  if (flushTimer != null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }

  await flushQueue();
}

export function listenFallbackLogSync(handler: (record: AppLogRecord) => void) {
  const channel = getSyncChannel();

  if (!channel) {
    return () => {};
  }

  const onMessage = (event: MessageEvent<{ source?: string; record?: AppLogRecord }>) => {
    if (event.data?.source === fallbackSourceId || !event.data?.record) {
      return;
    }

    handler(event.data.record);
  };

  channel.addEventListener("message", onMessage);
  return () => {
    channel.removeEventListener("message", onMessage);
  };
}

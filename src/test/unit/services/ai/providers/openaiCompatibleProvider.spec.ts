import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatCompletionRequest, OpenAICompatibleStreamEventPayload } from "@/types/ai";
import type { ModelConfig } from "@/types/app";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  streamHandler: null as null | ((event: { payload: OpenAICompatibleStreamEventPayload }) => void),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mocked.listen,
}));

import { OpenAICompatibleProvider } from "@/services/ai/providers/openaiCompatibleProvider";

const modelConfig: ModelConfig = {
  id: "model-1",
  name: "Stream Model",
  provider: "openai-compatible",
  baseUrl: "https://example.com/v1",
  apiKey: "test-key",
  model: "gpt-4o-mini",
  enabled: true,
  isDefault: true,
  systemPrompt: "Translate the text.",
  timeoutMs: 60_000,
  createdAt: "2026-04-04T00:00:00.000Z",
  updatedAt: "2026-04-04T00:00:00.000Z",
};

const request: ChatCompletionRequest = {
  messages: [
    {
      role: "system",
      content: "Translate accurately.",
    },
    {
      role: "user",
      content: "Hello world",
    },
  ],
};

describe("OpenAICompatibleProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.streamHandler = null;
    mocked.unlisten.mockImplementation(() => {});
    mocked.listen.mockImplementation(
      async (_eventName: string, handler: typeof mocked.streamHandler) => {
        mocked.streamHandler = handler;
        return mocked.unlisten;
      },
    );
  });

  it("forwards stream deltas before the final response resolves", async () => {
    const timeline: string[] = [];
    const deltas: string[] = [];

    mocked.unlisten.mockImplementation(() => {
      timeline.push("unlisten");
    });

    mocked.invoke.mockImplementation(async (command: string, args?: { requestId?: string }) => {
      timeline.push(command);

      if (command !== "request_openai_compatible_completion_stream") {
        throw new Error(`Unexpected command: ${command}`);
      }

      mocked.streamHandler?.({
        payload: {
          requestId: args?.requestId ?? "",
          delta: "Hello ",
        },
      });

      await Promise.resolve();

      mocked.streamHandler?.({
        payload: {
          requestId: args?.requestId ?? "",
          delta: "world",
        },
      });

      return {
        id: "stream-1",
        model: "gpt-4o-mini",
        content: "Hello world",
        raw: {
          stream: true,
        },
      };
    });

    const result = await new OpenAICompatibleProvider()
      .completeChat(modelConfig, request, {
        onTextDelta(delta) {
          timeline.push(`delta:${delta}`);
          deltas.push(delta);
        },
      })
      .then((response) => {
        timeline.push("resolved");
        return response;
      });

    expect(deltas).toEqual(["Hello ", "world"]);
    expect(result.content).toBe("Hello world");
    expect(timeline.indexOf("delta:Hello ")).toBeGreaterThanOrEqual(0);
    expect(timeline.indexOf("delta:world")).toBeGreaterThanOrEqual(0);
    expect(timeline.indexOf("delta:Hello ")).toBeLessThan(timeline.indexOf("resolved"));
    expect(timeline.indexOf("delta:world")).toBeLessThan(timeline.indexOf("resolved"));
    expect(mocked.invoke).toHaveBeenCalledTimes(1);
    expect(mocked.invoke).toHaveBeenCalledWith(
      "request_openai_compatible_completion_stream",
      expect.objectContaining({
        payload: expect.objectContaining({
          model: "gpt-4o-mini",
        }),
        requestId: expect.any(String),
      }),
    );
    expect(mocked.unlisten).toHaveBeenCalledTimes(1);
  });

  it("throws instead of silently falling back when visible translation requires streaming", async () => {
    mocked.invoke.mockImplementation(async (command: string) => {
      if (command === "request_openai_compatible_completion_stream") {
        throw new Error("stream disabled");
      }

      return {
        id: "fallback-1",
        model: "gpt-4o-mini",
        content: "Full response",
        raw: null,
      };
    });

    await expect(
      new OpenAICompatibleProvider().completeChat(modelConfig, request, {
        onTextDelta: vi.fn(),
      }),
    ).rejects.toThrow("流式翻译失败，未收到任何增量内容。请确认当前接口支持 stream/SSE。");

    expect(mocked.invoke).toHaveBeenCalledTimes(1);
    expect(mocked.invoke).toHaveBeenCalledWith(
      "request_openai_compatible_completion_stream",
      expect.objectContaining({
        requestId: expect.any(String),
      }),
    );
  });

  it("keeps non-stream fallback for detached requests without delta handlers", async () => {
    mocked.invoke.mockImplementation(async (command: string) => {
      if (command === "request_openai_compatible_completion_stream") {
        throw new Error("stream disabled");
      }

      if (command === "request_openai_compatible_completion") {
        return {
          id: "fallback-2",
          model: "gpt-4o-mini",
          content: "Full response",
          raw: null,
        };
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await new OpenAICompatibleProvider().completeChat(modelConfig, request);

    expect(result.content).toBe("Full response");
    expect(mocked.invoke).toHaveBeenCalledTimes(2);
    expect(mocked.invoke).toHaveBeenNthCalledWith(
      1,
      "request_openai_compatible_completion_stream",
      expect.objectContaining({
        requestId: expect.any(String),
      }),
    );
    expect(mocked.invoke).toHaveBeenNthCalledWith(
      2,
      "request_openai_compatible_completion",
      expect.objectContaining({
        payload: expect.objectContaining({
          model: "gpt-4o-mini",
        }),
      }),
    );
  });
});

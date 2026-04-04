import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: mocked.isTauri,
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: mocked.isPermissionGranted,
  requestPermission: mocked.requestPermission,
  sendNotification: mocked.sendNotification,
}));

async function importNotificationModule() {
  vi.resetModules();
  return await import("@/services/systemInput/systemNotification");
}

describe("systemInput systemNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.isTauri.mockReturnValue(true);
  });

  it("returns false outside Tauri", async () => {
    mocked.isTauri.mockReturnValue(false);

    const { showSystemInputNotification } = await importNotificationModule();
    const result = await showSystemInputNotification("title", "body");

    expect(result).toBe(false);
    expect(mocked.isPermissionGranted).not.toHaveBeenCalled();
    expect(mocked.sendNotification).not.toHaveBeenCalled();
  });

  it("sends a notification immediately when permission is already granted", async () => {
    mocked.isPermissionGranted.mockResolvedValue(true);

    const { showSystemInputNotification } = await importNotificationModule();
    const result = await showSystemInputNotification("选中文本翻译完成", "按 Ctrl+3 粘贴。");

    expect(result).toBe(true);
    expect(mocked.requestPermission).not.toHaveBeenCalled();
    expect(mocked.sendNotification).toHaveBeenCalledWith({
      title: "选中文本翻译完成",
      body: "按 Ctrl+3 粘贴。",
    });
  });

  it("requests permission once and reuses the cached decision", async () => {
    mocked.isPermissionGranted.mockResolvedValue(false);
    mocked.requestPermission.mockResolvedValue("granted");

    const { showSystemInputNotification } = await importNotificationModule();

    await showSystemInputNotification("第一次", "body-1");
    await showSystemInputNotification("第二次", "body-2");

    expect(mocked.isPermissionGranted).toHaveBeenCalledTimes(1);
    expect(mocked.requestPermission).toHaveBeenCalledTimes(1);
    expect(mocked.sendNotification).toHaveBeenNthCalledWith(1, {
      title: "第一次",
      body: "body-1",
    });
    expect(mocked.sendNotification).toHaveBeenNthCalledWith(2, {
      title: "第二次",
      body: "body-2",
    });
  });

  it("returns false when notification permission is denied", async () => {
    mocked.isPermissionGranted.mockResolvedValue(false);
    mocked.requestPermission.mockResolvedValue("denied");

    const { showSystemInputNotification } = await importNotificationModule();
    const result = await showSystemInputNotification("失败", "body");

    expect(result).toBe(false);
    expect(mocked.sendNotification).not.toHaveBeenCalled();
  });
});

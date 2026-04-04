import { describe, expect, it } from "vitest";
import {
  formatSystemInputCaptureMode,
  formatSystemInputPermissionState,
  formatSystemInputTriggerMode,
  formatSystemInputWritebackMode,
  parseSystemInputAppList,
  stringifySystemInputAppList,
} from "@/services/systemInput/strategy";

describe("systemInput strategy helpers", () => {
  it("formats each system input enum into human-readable labels", () => {
    expect(formatSystemInputTriggerMode("double-space")).toBe("双空格");
    expect(formatSystemInputTriggerMode("double-alt")).toBe("双 Alt");
    expect(formatSystemInputTriggerMode("manual-hotkey")).toBe("手动热键");

    expect(formatSystemInputCaptureMode("selection-first")).toBe("选中文本优先");
    expect(formatSystemInputCaptureMode("before-caret-first")).toBe("光标前优先");
    expect(formatSystemInputCaptureMode("whole-input-first")).toBe("整段输入优先");

    expect(formatSystemInputWritebackMode("auto")).toBe("自动");
    expect(formatSystemInputWritebackMode("native-replace")).toBe("原生替换");
    expect(formatSystemInputWritebackMode("simulate-input")).toBe("模拟输入");
    expect(formatSystemInputWritebackMode("clipboard-paste")).toBe("剪贴板粘贴");
    expect(formatSystemInputWritebackMode("popup-only")).toBe("仅结果窗");

    expect(formatSystemInputPermissionState("granted")).toBe("已授权");
    expect(formatSystemInputPermissionState("denied")).toBe("未授权");
    expect(formatSystemInputPermissionState("not-required")).toBe("无需授权");
    expect(formatSystemInputPermissionState("unknown")).toBe("未知");
  });

  it("parses and stringifies app lists cleanly", () => {
    expect(parseSystemInputAppList(" notepad.exe \r\n\r\n code.exe \nWINWORD.EXE ")).toEqual([
      "notepad.exe",
      "code.exe",
      "WINWORD.EXE",
    ]);
    expect(stringifySystemInputAppList(["notepad.exe", "code.exe"])).toBe(
      "notepad.exe\ncode.exe",
    );
  });
});

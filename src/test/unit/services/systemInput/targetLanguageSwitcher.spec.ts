import { describe, expect, it } from "vitest";
import {
  createSystemInputTargetLanguageOverlayPayload,
  resolveNextSystemInputTargetLanguage,
  resolveSystemInputTargetLanguageLabel,
  resolveSystemInputTargetLanguageValue,
  systemInputTargetLanguageOptions,
} from "@/services/systemInput/targetLanguageSwitcher";

describe("system input target language switcher", () => {
  it("normalizes invalid values to the first supported target language", () => {
    expect(resolveSystemInputTargetLanguageValue("")).toBe(
      systemInputTargetLanguageOptions[0]?.value,
    );
    expect(resolveSystemInputTargetLanguageValue("auto")).toBe(
      systemInputTargetLanguageOptions[0]?.value,
    );
  });

  it("resolves the next language in a cyclic order", () => {
    expect(resolveNextSystemInputTargetLanguage("auto")).toBe("Chinese (Simplified)");
    expect(resolveNextSystemInputTargetLanguage("Chinese (Simplified)")).toBe(
      "Chinese (Traditional)",
    );
    expect(resolveNextSystemInputTargetLanguage("Arabic")).toBe("auto");
  });

  it("builds the overlay payload with a human readable label", () => {
    expect(resolveSystemInputTargetLanguageLabel("English")).toBe("English");
    expect(createSystemInputTargetLanguageOverlayPayload("Japanese", "Ctrl+`")).toEqual({
      value: "Japanese",
      label: "日本語",
      shortcutLabel: "Ctrl+~",
    });
  });
});

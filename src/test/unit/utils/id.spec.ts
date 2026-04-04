import { describe, expect, it, vi } from "vitest";
import { generateId } from "@/utils/id";

describe("generateId", () => {
  it("returns a non-empty string", () => {
    const id = generateId();

    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns different values on successive calls", () => {
    const ids = Array.from({ length: 10 }, () => generateId());
    const unique = new Set(ids);

    expect(unique.size).toBe(10);
  });

  it("uses crypto.randomUUID when available", () => {
    const spy = vi.spyOn(crypto, "randomUUID");
    spy.mockReturnValueOnce("00000000-0000-0000-0000-000000000001");

    const id = generateId();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(id).toBe("00000000-0000-0000-0000-000000000001");

    spy.mockRestore();
  });

  it("falls back to the timestamp-based generator when crypto.randomUUID is unavailable", () => {
    // Replace the global crypto with a object that lacks randomUUID so the
    // fallback branch executes. vi.stubGlobal restores the original automatically
    // after the test via the afterEach hook in setup.ts.
    vi.stubGlobal("crypto", {});

    const id = generateId();

    expect(id).toMatch(/^id-\d+-[0-9a-f]+$/);

    vi.unstubAllGlobals();
  });
});

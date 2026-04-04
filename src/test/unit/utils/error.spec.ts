import { describe, expect, it } from "vitest";
import { toErrorMessage, toErrorStack } from "@/utils/error";

describe("toErrorMessage", () => {
  it("returns the message property of an Error instance", () => {
    const error = new Error("something went wrong");

    expect(toErrorMessage(error)).toBe("something went wrong");
  });

  it("returns String() of a non-Error value", () => {
    expect(toErrorMessage("raw string error")).toBe("raw string error");
    expect(toErrorMessage(42)).toBe("42");
    expect(toErrorMessage(null)).toBe("null");
    expect(toErrorMessage(undefined)).toBe("undefined");
    expect(toErrorMessage({ toString: () => "custom obj" })).toBe("custom obj");
  });

  it("returns an empty string for Errors with an empty message", () => {
    expect(toErrorMessage(new Error(""))).toBe("");
  });
});

describe("toErrorStack", () => {
  it("returns the stack property of an Error instance", () => {
    const error = new Error("oops");

    // The stack may be undefined in some environments; toErrorStack mirrors it.
    expect(toErrorStack(error)).toBe(error.stack);
  });

  it("returns a string that starts with the error class and message when a stack is present", () => {
    const error = new Error("traced error");

    const stack = toErrorStack(error);
    if (stack !== undefined) {
      expect(stack).toMatch(/Error: traced error/);
    }
  });

  it("returns String() of a non-Error value", () => {
    expect(toErrorStack("plain string")).toBe("plain string");
    expect(toErrorStack(99)).toBe("99");
    expect(toErrorStack(null)).toBe("null");
    expect(toErrorStack(undefined)).toBe("undefined");
  });

  it("returns undefined when Error.prototype.stack is undefined", () => {
    const error = new Error("no stack");
    delete error.stack;

    expect(toErrorStack(error)).toBeUndefined();
  });
});

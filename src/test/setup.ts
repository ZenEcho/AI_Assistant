import { afterEach, vi } from "vitest";

if (typeof window !== "undefined" && !("matchMedia" in window)) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: ResizeObserverMock,
  });
}

if (typeof crypto !== "undefined" && !("randomUUID" in crypto)) {
  Object.defineProperty(crypto, "randomUUID", {
    writable: true,
    value: () => "test-random-uuid",
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

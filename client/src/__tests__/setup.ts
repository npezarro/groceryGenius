import "@testing-library/jest-dom/vitest";

// Polyfill ResizeObserver for jsdom (needed by Radix UI)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node-cron before importing scheduler
const mockStop = vi.fn();
const mockSchedule = vi.fn(() => ({ stop: mockStop }));
vi.mock("node-cron", () => ({
  default: { schedule: (...args: unknown[]) => mockSchedule(...args) },
}));

// Mock pipeline functions
const mockRunAllAdapters = vi.fn();
const mockGetAdapter = vi.fn();
const mockRunAdapter = vi.fn();
vi.mock("../pipeline/index", () => ({
  runAllAdapters: (...args: unknown[]) => mockRunAllAdapters(...args),
  getAdapter: (...args: unknown[]) => mockGetAdapter(...args),
  runAdapter: (...args: unknown[]) => mockRunAdapter(...args),
}));

// Mock DB (imported transitively)
vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));

import {
  startScheduler,
  stopScheduler,
  triggerManualRun,
  triggerSingleRun,
  getSchedulerStatus,
} from "../pipeline/scheduler";

describe("Scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset scheduler state by stopping any previous tasks
    stopScheduler();
  });

  // ── startScheduler ─────────────────────────────────────────────

  describe("startScheduler", () => {
    it("registers a cron task on first call", () => {
      startScheduler();
      expect(mockSchedule).toHaveBeenCalledOnce();
      expect(mockSchedule.mock.calls[0][0]).toBe("15 */6 * * *");
    });

    it("is idempotent — second call is a no-op", () => {
      startScheduler();
      startScheduler();
      expect(mockSchedule).toHaveBeenCalledOnce();
    });
  });

  // ── stopScheduler ──────────────────────────────────────────────

  describe("stopScheduler", () => {
    it("stops all scheduled tasks", () => {
      startScheduler();
      mockStop.mockClear();
      stopScheduler();
      expect(mockStop).toHaveBeenCalledOnce();
    });

    it("allows restarting after stop", () => {
      startScheduler();
      stopScheduler();
      startScheduler();
      expect(mockSchedule).toHaveBeenCalledTimes(2);
    });

    it("is safe to call when no tasks are scheduled", () => {
      expect(() => stopScheduler()).not.toThrow();
    });
  });

  // ── getSchedulerStatus ─────────────────────────────────────────

  describe("getSchedulerStatus", () => {
    it("reports not running when stopped", () => {
      const status = getSchedulerStatus();
      expect(status.running).toBe(false);
      expect(status.tasksCount).toBe(0);
      expect(status.pipelineActive).toBe(false);
    });

    it("reports running after start", () => {
      startScheduler();
      const status = getSchedulerStatus();
      expect(status.running).toBe(true);
      expect(status.tasksCount).toBe(1);
    });

    it("reports not running after stop", () => {
      startScheduler();
      stopScheduler();
      const status = getSchedulerStatus();
      expect(status.running).toBe(false);
      expect(status.tasksCount).toBe(0);
    });
  });

  // ── triggerManualRun ───────────────────────────────────────────

  describe("triggerManualRun", () => {
    it("runs all adapters with default zip code", async () => {
      mockRunAllAdapters.mockResolvedValue([
        { source: "kroger", pricesCreated: 10, errors: [] },
      ]);
      const result = await triggerManualRun();
      expect(mockRunAllAdapters).toHaveBeenCalledWith("94102");
      expect(result).toEqual({
        ok: true,
        results: [{ source: "kroger", pricesCreated: 10, errors: [] }],
      });
    });

    it("accepts a custom zip code", async () => {
      mockRunAllAdapters.mockResolvedValue([]);
      await triggerManualRun("10001");
      expect(mockRunAllAdapters).toHaveBeenCalledWith("10001");
    });

    it("returns error when a run is already in progress", async () => {
      // Start a slow run
      let resolve!: () => void;
      mockRunAllAdapters.mockReturnValue(
        new Promise<never[]>((r) => {
          resolve = () => r([]);
        })
      );

      const first = triggerManualRun();
      const second = await triggerManualRun();

      expect(second).toEqual({ error: "A pipeline run is already in progress" });

      // Clean up — let the first run finish so isRunning resets
      resolve();
      await first;
    });

    it("resets isRunning after completion so subsequent runs work", async () => {
      mockRunAllAdapters.mockResolvedValue([]);
      await triggerManualRun();
      // Second call should succeed, not be blocked
      const result = await triggerManualRun();
      expect(result).toEqual({ ok: true, results: [] });
      expect(mockRunAllAdapters).toHaveBeenCalledTimes(2);
    });

    it("resets isRunning even if runAllAdapters throws", async () => {
      mockRunAllAdapters.mockRejectedValueOnce(new Error("network failure"));
      await expect(triggerManualRun()).rejects.toThrow("network failure");

      // Should still allow next run
      mockRunAllAdapters.mockResolvedValue([]);
      const result = await triggerManualRun();
      expect(result).toEqual({ ok: true, results: [] });
    });
  });

  // ── triggerSingleRun ───────────────────────────────────────────

  describe("triggerSingleRun", () => {
    it("returns error for unknown source", async () => {
      mockGetAdapter.mockReturnValue(undefined);
      const result = await triggerSingleRun("nonexistent");
      expect(result).toEqual({ error: "Unknown source: nonexistent" });
    });

    it("returns error when adapter is not configured", async () => {
      mockGetAdapter.mockReturnValue({ isConfigured: () => false });
      const result = await triggerSingleRun("kroger");
      expect(result).toEqual({ error: "kroger is not configured" });
    });

    it("runs the adapter with default zip when configured", async () => {
      mockGetAdapter.mockReturnValue({ isConfigured: () => true });
      mockRunAdapter.mockResolvedValue({
        source: "kroger",
        pricesCreated: 5,
        errors: [],
      });
      const result = await triggerSingleRun("kroger");
      expect(mockRunAdapter).toHaveBeenCalledWith("kroger", "auto", "94102");
      expect(result).toEqual({
        source: "kroger",
        pricesCreated: 5,
        errors: [],
      });
    });

    it("passes custom zip code to runAdapter", async () => {
      mockGetAdapter.mockReturnValue({ isConfigured: () => true });
      mockRunAdapter.mockResolvedValue({ source: "kroger", pricesCreated: 0, errors: [] });
      await triggerSingleRun("kroger", "60614");
      expect(mockRunAdapter).toHaveBeenCalledWith("kroger", "auto", "60614");
    });
  });

  // ── Cron callback behavior ─────────────────────────────────────

  describe("cron callback", () => {
    it("calls runAllAdapters with SF zip code when cron fires", async () => {
      mockRunAllAdapters.mockResolvedValue([]);
      startScheduler();

      // Extract the callback passed to cron.schedule
      const cronCallback = mockSchedule.mock.calls[0][1] as () => Promise<void>;
      await cronCallback();

      expect(mockRunAllAdapters).toHaveBeenCalledWith("94102");
    });

    it("skips if a previous cron run is still in progress", async () => {
      let resolve!: () => void;
      mockRunAllAdapters.mockReturnValue(
        new Promise<never[]>((r) => {
          resolve = () => r([]);
        })
      );

      startScheduler();
      const cronCallback = mockSchedule.mock.calls[0][1] as () => Promise<void>;

      // First invocation starts and holds
      const firstRun = cronCallback();
      // Second invocation should skip (isRunning = true)
      await cronCallback();

      // runAllAdapters should only have been called once
      expect(mockRunAllAdapters).toHaveBeenCalledOnce();

      resolve();
      await firstRun;
    });

    it("resets isRunning after cron callback errors", async () => {
      mockRunAllAdapters.mockRejectedValueOnce(new Error("boom"));
      startScheduler();
      const cronCallback = mockSchedule.mock.calls[0][1] as () => Promise<void>;

      // Should not throw — error is caught internally
      await cronCallback();

      // Should allow next run
      mockRunAllAdapters.mockResolvedValue([]);
      await cronCallback();
      expect(mockRunAllAdapters).toHaveBeenCalledTimes(2);
    });
  });
});

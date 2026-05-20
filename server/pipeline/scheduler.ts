/**
 * Scheduling layer for the price data pipeline.
 * Uses node-cron to periodically run adapters at appropriate intervals.
 *
 * Schedule:
 * - API sources (Kroger): every 4 hours
 * - Structured data (JSON-LD): every 6 hours
 * - HTML scrapers: every 12 hours
 *
 * All times are staggered to avoid running everything simultaneously.
 */

import cron, { type ScheduledTask } from "node-cron";
import { runAllAdapters, getAdapter, runAdapter, getLastSuccessfulRun } from "./index";
import type { PipelineResult } from "./types";

let scheduledTasks: ScheduledTask[] = [];
let isRunning = false;

/** Start the pipeline scheduler */
export function startScheduler(): void {
  // Prevent multiple schedulers in PM2 cluster mode
  if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== "0") {
    console.log(`[scheduler] Skipping start on instance ${process.env.NODE_APP_INSTANCE}`);
    return;
  }

  if (scheduledTasks.length > 0) {
    console.log("[scheduler] Already running, skipping start");
    return;
  }

  console.log("[scheduler] Starting price pipeline scheduler");

  // Run all adapters every 6 hours, staggered from midnight
  // Cron: at minute 15, every 6th hour (00:15, 06:15, 12:15, 18:15)
  // Pattern: minute hour day-of-month month day-of-week
  const allAdaptersTask = cron.schedule("15 */6 * * *", async () => {
    if (isRunning) {
      console.log("[scheduler] Previous run still in progress, skipping");
      return;
    }

    // Claim the lock before any awaits to prevent concurrent invocations
    isRunning = true;

    // Safety check: don't run if we just ran successfully in the last hour
    // (Prevents double-runs from cron misbehavior or restarts)
    const lastRun = await getLastSuccessfulRun("kroger"); // Kroger is a good representative source
    if (lastRun && lastRun.completedAt) {
      const ageMs = Date.now() - new Date(lastRun.completedAt).getTime();
      if (ageMs < 60 * 60 * 1000) {
        console.log(`[scheduler] Skipping scheduled run: last successful run was only ${Math.round(ageMs/60000)}m ago`);
        isRunning = false;
        return;
      }
    }

    try {
      console.log("[scheduler] Running all adapters...");
      const results = await runAllAdapters("94102"); // SF zip code
      const totalPrices = results.reduce((sum, r) => sum + r.pricesCreated, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      console.log(`[scheduler] Completed: ${totalPrices} prices from ${results.length} sources, ${totalErrors} errors`);
    } catch (err) {
      console.error("[scheduler] Fatal scheduler error:", err);
    } finally {
      isRunning = false;
    }
  });

  scheduledTasks.push(allAdaptersTask);
  console.log("[scheduler] Scheduled: all adapters every 6 hours (at :15 past)");
}

/** Stop the scheduler */
export function stopScheduler(): void {
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks = [];
  console.log("[scheduler] Stopped all scheduled tasks");
}

/** Trigger an immediate run of all adapters (for manual/API use) */
export async function triggerManualRun(zipCode: string = "94102"): Promise<{ error: string } | { ok: true; results: PipelineResult[] }> {
  if (isRunning) {
    return { error: "A pipeline run is already in progress" };
  }
  isRunning = true;
  try {
    const results = await runAllAdapters(zipCode);
    return { ok: true, results };
  } finally {
    isRunning = false;
  }
}

/** Trigger a single adapter run */
export async function triggerSingleRun(sourceId: string, zipCode: string = "94102"): Promise<{ error: string } | PipelineResult> {
  const adapter = getAdapter(sourceId);
  if (!adapter) {
    return { error: `Unknown source: ${sourceId}` };
  }
  if (!adapter.isConfigured()) {
    return { error: `${sourceId} is not configured` };
  }

  return await runAdapter(sourceId, "auto", zipCode);
}

/** Get scheduler status */
export function getSchedulerStatus(): { running: boolean; tasksCount: number; pipelineActive: boolean } {
  return {
    running: scheduledTasks.length > 0,
    tasksCount: scheduledTasks.length,
    pipelineActive: isRunning,
  };
}

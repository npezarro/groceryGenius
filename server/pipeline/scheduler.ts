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

import cron from "node-cron";
import { runAllAdapters, getAdapter, runAdapter } from "./index";

let scheduledTasks: cron.ScheduledTask[] = [];
let isRunning = false;

/** Start the pipeline scheduler */
export function startScheduler(): void {
  if (scheduledTasks.length > 0) {
    console.log("[scheduler] Already running, skipping start");
    return;
  }

  console.log("[scheduler] Starting price pipeline scheduler");

  // Run all adapters every 6 hours, staggered from midnight
  // Cron: at minute 15 past every 6th hour (00:15, 06:15, 12:15, 18:15)
  const allAdaptersTask = cron.schedule("15 */6 * * *", async () => {
    if (isRunning) {
      console.log("[scheduler] Previous run still in progress, skipping");
      return;
    }
    isRunning = true;
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
export async function triggerManualRun(zipCode: string = "94102"): Promise<any> {
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
export async function triggerSingleRun(sourceId: string, zipCode: string = "94102"): Promise<any> {
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

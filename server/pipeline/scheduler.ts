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
import { runAllAdapters, getAdapter, runAdapter, getLastSuccessfulRun, getRecentRuns } from "./index";
import type { PipelineResult } from "./types";

let scheduledTasks: ScheduledTask[] = [];
let isRunning = false;
let lastRunMinute: string | null = null;

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

  // Run all adapters every 6 hours, at :15 past the hour
  // Pattern: minute hour day-of-month month day-of-week
  const allAdaptersTask = cron.schedule("15 */6 * * *", async () => {
    const now = new Date();
    const currentMinute = now.toISOString().slice(0, 16); // e.g. "2026-05-23T12:15"
    
    if (isRunning) {
      console.log("[scheduler] Previous run still in progress, skipping");
      return;
    }
    
    if (lastRunMinute === currentMinute) {
      // Already ran or skipped in this minute
      return;
    }

    // Claim the lock before any awaits
    isRunning = true;
    lastRunMinute = currentMinute;

    try {
      console.log(`[scheduler] Scheduled run triggered at ${now.toLocaleTimeString()}`);
      
      // Safety check: don't run if a run started in the last 30 minutes
      // (Prevents crash loops from restarts during the same minute)
      const recentRuns = await getRecentRuns(1);
      if (recentRuns.length > 0) {
        const lastRun = recentRuns[0];
        const lastRunTime = new Date(lastRun.startedAt).getTime();
        const ageMs = Date.now() - lastRunTime;
        
        // If a run started less than 30 minutes ago, skip this one.
        if (ageMs < 30 * 60 * 1000) {
          console.log(`[scheduler] Skipping scheduled run: another run started ${Math.round(ageMs/60000)}m ago (status: ${lastRun.status})`);
          return;
        }

        // Additional check: if the last SUCCESSFUL run was less than 5 hours ago, skip.
        // (Prevents double-runs from timezone shifts or manual triggers)
        let lastSuccessful = await getLastSuccessfulRun("kroger");
        if (!lastSuccessful && lastRun.status === "completed") {
          lastSuccessful = lastRun;
        }

        if (lastSuccessful && lastSuccessful.completedAt) {
          const successAgeMs = Date.now() - new Date(lastSuccessful.completedAt).getTime();
          if (successAgeMs < 5 * 60 * 60 * 1000) {
            console.log(`[scheduler] Skipping scheduled run: last successful run was ${Math.round(successAgeMs/60000)}m ago (min age: 5h)`);
            return;
          }
        }
      }

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
  lastRunMinute = null;
  isRunning = false;
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

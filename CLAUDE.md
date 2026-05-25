# Grocery Genius

## Stack
- Vite + React (TypeScript), Tailwind CSS
- Express backend, Drizzle ORM, PostgreSQL
- Vitest for testing

## Commands
- `npm run build:deploy` — production build (sets BASE_PATH, runs Vite + esbuild + verify-build)
- `npm run dev` — dev server on port 5000
- `npx vitest` — run tests

## Fonts
- **Self-hosted** via `@fontsource` (no CDN). Imports in `client/src/main.tsx`.
- Fraunces (headings) + IBM Plex Sans (body), weights 400-700.
- To add a font: `npm install @fontsource/<name>`, import weight CSS in `main.tsx`.

## Architecture
- **Base path**: `/grocerygenius`
- **Port**: 8080 (production), 5000 (dev)
- **PM2 process**: grocerygenius (id 4)
- **Deploy**: production VM via Apache ProxyPass to localhost:8080 (see privateContext/infrastructure.md)
- **Database**: local PostgreSQL via DATABASE_URL
- **Required env**: SESSION_SECRET, DATABASE_URL; optional: ADMIN_KEY, MAPBOX_ACCESS_TOKEN

## Pipeline Adapter Gotchas
- **External data fields are not always strings.** Grocery API responses return prices, sizes, and names as `number | null | undefined` even when typed as `string`. Always wrap with `String(x)` before calling `.match()`, `.toLowerCase()`, `.trim()`, or any string method. Add a null-check first: `if (!x) return undefined;`. Failing to do this causes `TypeError: x.match is not a function` crashes in the normalizer/validator pipeline.
- **Pattern:** `const str = String(x); const match = str.match(/pattern/);` — not `x.match(/pattern/)`.
- **Prices may arrive as strings.** API responses sometimes return prices as string values (e.g., `"4.99"` instead of `4.99`). Always wrap with `Number(x)` before arithmetic or comparison. Pattern: `const price = Number(item.price); if (isNaN(price) || price <= 0) continue;`
- Files where these patterns apply: `adapters/traderjoes.ts`, `adapters/kroger.ts`, `adapters/safeway.ts`, `normalizer.ts`, `validator.ts`, `pipeline/index.ts`.

## Scheduler
- `server/pipeline/scheduler.ts` runs adapters every 6 hours (00:15, 06:15, 12:15, 18:15).
- **Single-instance guard:** On startup, scheduler checks `NODE_APP_INSTANCE !== "0"` and exits early if true. This prevents duplicate runs when PM2 operates in cluster mode. If logs show "Skipping start on instance N", that is expected behavior, not a bug.
- **Crash-loop double-trigger guard:** A 30-minute time-based guard prevents the pipeline from double-triggering during crash-loop recovery. PM2 restarts the process rapidly during crashes; without this guard, each restart fires the cron handler again. The guard checks both a `lastRunMinute` memory variable (per-minute dedup) and `getRecentRuns()` DB check (30-minute window). Source: commits a385992, 8469e20, 7feace1 (2026-05).
- **Memory limit:** Start script passes `--max-old-space-size=512` to node (set in `package.json` start command). Source: commit 7feace1.

## Post-Deploy Verification

After deploying to the VM, verify within 30 seconds:
1. `pm2 show grocerygenius` — confirm status is `online`, uptime climbing, no restart spikes.
2. `curl -s -o /dev/null -w "%{http_code}" https://$DEPLOY_DOMAIN/grocerygenius/` — confirm HTTP 200 (domain from privateContext/infrastructure.md).
3. `pm2 logs grocerygenius --lines 20` — scan for errors or crash loops.
4. If `package.json` or `package-lock.json` changed, run `npm install` on the server before restarting.
5. Deploy after every change. Do not accumulate commits without deploying. Stale builds cause chunk mismatch errors.

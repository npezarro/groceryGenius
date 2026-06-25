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
- **Required env**: SESSION_SECRET, DATABASE_URL; optional: ADMIN_KEY, MAPBOX_ACCESS_TOKEN, CLAUDE_BRIDGE_URL (AI features), DEFAULT_ZIP (default: `94118`), PRICE_FRESHNESS_DAYS (default: `21`), CODEX_MERCHANT_VISION (set to `1` to enable Codex vision merchant tier in the batch importer; requires `codex` CLI installed and authed on the host)

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

## Zod Validation in Express/API Routes

groceryGenius uses Zod for input validation across `server/routes.ts`, adapter responses, and CSV import. Every route that parses input with `.parse()` **must** catch `ZodError` and return a 400 response. Without this, validation failures bubble up as unhandled exceptions → 500 Internal Server Error, hiding the real problem from the client.

```typescript
import { ZodError } from "zod";

try {
  const data = mySchema.parse(req.body);
  // ... handle request
} catch (error) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: error.errors });
  }
  throw error; // re-throw non-validation errors
}
```

groceryGenius previously had this exact gap on a single endpoint while all others were correct. When adding a new Zod-validated endpoint, always include the `ZodError` catch. When auditing, search for every `.parse(` and confirm each call site handles `ZodError`.

## Testing

groceryGenius uses Vitest (`npx vitest` / `npm test`). Test rules tuned for this codebase:

- **Bug fixes:** Write a regression test that fails without the fix, passes with it. The fix goes in the code; the test goes in the suite so the *class of bug* never returns.
- **Cross-layer invariant tests are the highest-value type here.** This repo has documented invariants between pipeline → database → API → UI. Examples:
  - Pipeline-created stores must have `lat`/`lng` (trip planner filters on `WHERE lat IS NOT NULL`).
  - Price records must include `unit` (UI formats `$2.99/lb`; missing unit shows `$2.99` with no context).
  - Price-history API responses must include `storeName` (UI sparkline depends on it).
  - Shopping-list items must roundtrip through JSON.parse(JSON.stringify(items)) without losing fields.
  Name invariant tests after the boundary they guard (`pipeline-stores.test.ts`, `price-display.test.ts`, `trip-planner.test.ts`).
- **Pipeline adapter tests must use String(x)/Number(x) coercion** when fabricating fixtures, matching the production adapter contract documented in "Pipeline Adapter Gotchas" above. Tests that hand-write typed fixtures hide the real bug class (external APIs returning unexpected types).
- **Don't mock the database.** Mock/prod divergence is the #1 source of false-green tests. Hit a real test DB or use the same Drizzle schema definitions the application uses — do not duplicate DDL inline in tests (silent fixture schema drift).
- **Test glob quoting on CI:** Use a flat glob (`test/*.test.ts`) or let Vitest discover via config. Single-quoted `**/*.test.ts` does not expand on GitHub Actions because globstar is off by default.
- **CI uses Node 22** (current LTS). Don't pin Node 20 — it reached EOL April 30, 2026.

## AI Features (alt-account Claude bridge)

AI features route through `grocerygenius-bridge` (`~/repos/grocerygenius-bridge`,
github npezarro/grocerygenius-bridge), a Docker container fronting the alt
Anthropic account — never the primary. Mirrors shopper/foodie/travel/runeval.

- **Why alt account:** Grocery Genius is public with open text fields (meal-plan
  input). Isolates billing/rate limits and shrinks prompt-injection blast radius.
- **Wiring:** `server/lib/ai-bridge.ts` POSTs `{prompt, model}` with the
  `x-bridge-secret` header to `CLAUDE_BRIDGE_URL` (`http://127.0.0.1:3098` via the
  reverse SSH tunnel). Falls back to `AIUnavailableError` (503) when unset.
- **Models:** Haiku default, Sonnet max. Opus is disallowed at the bridge.
- **Grounding rule:** AI structures/judges REAL data; it must not invent prices.
  Feature functions in `server/lib/ai-features.ts` take DB data as input and
  validate every parsed field against the source set before returning.
- **Endpoints:** `POST /api/ai/meal-plan` (text→list), `POST /api/ai/substitutions`
  (grounded cheaper swaps), `GET /api/ai/deals` (active promos + AI blurb),
  `POST /api/user/receipts/:id/parse` (tesseract OCR → `parseReceiptText`),
  `GET /api/ai/status` (enabled flag). Trip planner takes `smartMatch: true` to
  AI-map unmatched items to catalog names.
- **Receipt OCR:** `server/lib/ocr.ts` shells out to the `tesseract` binary
  (must be installed on the host: `apt-get install tesseract-ocr`). The bridge is
  text-only, so photos become text via OCR first, then the model structures them.
- **Data strategy:** Receipt ingest is the price-acquisition path for stores that
  can't be scraped from the VM IP (Safeway/Target/Costco/Whole Foods — anti-bot
  or client-rendered). Scraping covers Kroger(FoodsCo)/Trader Joe's/BLS.

## Store Directory + Receipt Ingestion

The app is designed to be useful BEFORE dense pricing exists. Receipts are
first-class community data.

- **Directory** (`GET /api/store-directory`, `StoreDirectory` UI): nearby stores,
  each with anonymized community receipt **data points** (items bought, discounts,
  location, date). Never exposes userId or the receipt image. Sorted: stores with
  data first, then distance (if coords) else coverage.
- **Receipt data points**: `receipts.parsedItems` + `store_location` column.
  `parseReceiptText` captures discounts + location. **Price is optional** — an item
  with no captured price still becomes a data point; price rows are only written
  when a price > 0 exists.
- **Batch importer** `server/scripts/import-receipts.ts`: OCR → AI parse → tie to a
  store (match existing, else create from the printed location) → anonymized receipt
  (system user `community-receipts`, no image) + price rows. Idempotent (skips a
  duplicate store+date+itemcount). Run from the app dir:
  `./node_modules/.bin/tsx server/scripts/import-receipts.ts <folder>`.
  - **Merchant fallback chain (top → bottom):** (1) Codex vision (`codexMerchant`, reads the receipt image pixels via `codex` CLI — recovers merchants that OCR garbles; enabled by `CODEX_MERCHANT_VISION=1`, WSL host only — not available on the VM); (2) AI text parse via Claude bridge. Codex tier fires only when the text parse returns no `storeName`.
- **OCR** (`server/lib/ocr.ts`): EXIF auto-orient + tesseract OSD rotation (phone
  receipts are rotated), psm 4. Host needs `tesseract-ocr` + `imagemagick`.
- **AI list organizer** (`POST /api/ai/organize-list`): groups any list into store
  aisles in shopping order. Needs no price data.

## Price Directory + My Receipts (generic, not grocery-only)

The app tracks prices across ANY store/restaurant type, not just grocery. The
receipt parser and bridge context are store-type-agnostic.

- **Price directory** (`PriceDirectory` UI): fuzzy store search → pick a location
  (if a chain has several) → per-item table showing **latest price, when it was
  last reported, and report count**. Endpoints: `GET /api/stores/search?q=`
  (grouped by chain name with locations + coverage/report counts),
  `GET /api/stores/:id/prices` (`storage.getStoreItemAggregates`: latest price via
  `array_agg(... ORDER BY captured_at DESC)[1]`, `max(captured_at)`, `count`).
- **My Receipts** (`MyReceipts` UI, signed-in only): a user's own uploads with
  inline correction of store name, location, date, items, and prices. `PUT
  /api/user/receipts/:id` edits metadata + parsedItems (price optional).
  Community-imported receipts are owned by `community-receipts`, so they never
  appear in a real user's My Receipts.

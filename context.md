# context.md
Last Updated: 2026-06-30 | DEPLOY STATUS: current, none pending. PR #207 (claude/doc-sync-319) is a CLAUDE.md-only documentation update — no source code changed, no service rebuild or deploy required. VM synced to main (7c570b6) and redeployed (pm2 grocerygenius online, /api/ai/status 200). `server/scripts/import-receipts.ts` is a manual WSL batch tool (Codex vision tier via CODEX_MERCHANT_VISION=1), not in the app runtime.
Last Updated: 2026-03-17 | Code splitting reduces largest JS chunk from 854KB to 376KB
Current State: Build passes via `npm run build:deploy`. All 9 tests pass. Bundle is now split into 14 chunks via React.lazy routes, component-level Suspense, and Vite manualChunks. Largest chunk is vendor-charts (recharts) at 376KB; initial app shell + React is ~181KB.
Open Work:
- MapView component is still a placeholder (no real Mapbox GL JS integration)
- Receipt OCR: currently manual entry only
- vendor-charts (recharts at 376KB) is the largest remaining chunk; could be lazy-loaded if PriceSparkline is deferred
Environment Notes:
- Deploy details: see privateContext/infrastructure.md (groceryGenius row)
- Build: `npm run build:deploy` (sets BASE_PATH, runs Vite + esbuild + verify-build)
- Deploy: `./deploy.sh` (builds, restarts PM2, verifies live site)
- Start: `npm run start` (NODE_ENV=production node dist/index.js)
- Tests: `npm test` (vitest)
Active Branch: claude/code-splitting

## Recent Changes (2026-10-22/23, public jobs on API credits + owner relay)
Bridge jobs route by `X-Bridge-Requester` (from the signed-in email via `bridge-requester.ts`, `OWNER_EMAILS`; trusted only with the bridge secret). Public jobs run on the Max plan's API credits through `docker/public-api-engine.js` (Agent SDK; copy of `public-claude-apps/templates/public-api-engine.js`), spend logged to `api-ledger/`, HTTP 402 "paused" when credits are out, no Codex/subscription fallback for public. Owner jobs also use the API since 2026-10-23 (`OWNER_ENGINE=api`). When the owner's subscription path fails the bridge answers 429 `subscription_unavailable` (only with `X-Owner-Relay: 1`) and the app resends to the VM-local main-account owner relay (`OWNER_RELAY_URL`/`OWNER_RELAY_SECRET` in the VM .env). No owner relay for this app (bridge is WSL-only). Owner list comes from `OWNER_EMAILS` in the VM ecosystem config (empty default in this public repo).
State: working, deployed. Open: credit-exhaustion path only tested with a mocked SDK; real non-owner UI submission untested.
Full closeout: `privateContext/deliverables/closeouts/2026-10-26-public-apps-on-api-credits-owner-relay.md`


# context.md
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

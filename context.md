# context.md
Last Updated: 2026-03-18 | Fix broken `npm run build` by removing overly strict BASE_PATH guard
Current State: App is live at pezant.ca/grocerygenius. Both `npm run build` and `npm run build:deploy` pass. All 9 tests pass. The `verify-build` script in `build:deploy` remains the deployment guardrail for correct asset paths. Bundle is split into 14 chunks via React.lazy routes, component-level Suspense, and Vite manualChunks.
Open Work:
- MapView component is still a placeholder (no real Mapbox GL JS integration)
- Receipt OCR: currently manual entry only
- vendor-charts (recharts at 376KB) is the largest remaining chunk; could be lazy-loaded if PriceSparkline is deferred
Environment Notes:
- Deploy: pezant.ca/grocerygenius via Apache ProxyPass to localhost:8080
- PM2 process: grocerygenius (id 4)
- BASE_PATH: /grocerygenius (build time for Vite, runtime for Express)
- Port: 8080 (production), 5000 (dev)
- Database: local PostgreSQL via DATABASE_URL
- Required env vars: SESSION_SECRET, DATABASE_URL; optional: ADMIN_KEY, MAPBOX_ACCESS_TOKEN
- Build: `npm run build:deploy` (sets BASE_PATH, runs Vite + esbuild + verify-build)
- Deploy: `./deploy.sh` (builds, restarts PM2, verifies live site)
- Start: `npm run start` (NODE_ENV=production node dist/index.js)
- Tests: `npm test` (vitest)
Active Branch: claude/fix-build-2026-03-18

# context.md
Last Updated: 2026-03-10 — ESLint setup and dead code cleanup
Current State: App is live at pezant.ca/grocerygenius. ESLint 9 with TypeScript + React support is now configured. Dead code removed: unused imports (useEffect, useState, ZodError, insertStoreSchema, insertItemSchema, insertPriceSchema, InsertFavoriteStore, vi), dead functions (getDistanceMatrix, checkAdminAuth), and unused catch params prefixed with _. Build and all 9 tests pass.
Recent Changes:
- Added ESLint 9 flat config (eslint.config.js) with typescript-eslint, react-hooks, react-refresh plugins
- Added lint/lint:fix scripts to package.json
- Removed unused imports across 6 files (location-preferences, price-sparkline, auth, security.test, routes, storage)
- Removed dead getDistanceMatrix function (27 lines) and checkAdminAuth function (5 lines) from routes.ts
- Prefixed unused catch/callback params with _ (12 catch blocks in routes.ts, 2 in location-preferences, 1 each in map-view, receipt-upload, price-sparkline)
- 28 remaining warnings are intentional: no-explicit-any (21) and react-refresh for shadcn/ui (7)
Open Work:
- MapView component is still a placeholder (no real Mapbox GL JS integration)
- JS bundle is ~743KB — could benefit from code splitting
- Receipt OCR: currently manual entry only
- 21 `any` types to progressively replace with proper types
Environment Notes:
- Deploy: pezant.ca/grocerygenius via Apache ProxyPass → localhost:8080
- PM2 process: grocerygenius (id 1)
- BASE_PATH: /grocerygenius (build time for Vite, runtime for Express)
- Port: 8080 (production), 5000 (dev)
- Database: local PostgreSQL via DATABASE_URL
- Required env vars: SESSION_SECRET, DATABASE_URL; optional: ADMIN_KEY, MAPBOX_ACCESS_TOKEN
- Build: `npm run build:deploy` (sets BASE_PATH, runs Vite + esbuild)
- Start: `npm run start` (NODE_ENV=production node dist/index.js)
- Tests: `npm test` (vitest)
Active Branch: agent/lint-fixes

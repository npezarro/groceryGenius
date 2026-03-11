# context.md
Last Updated: 2026-03-11 — Fixed blank page outage caused by wrong build command
Current State: App is live at pezant.ca/grocerygenius. Site was down (blank page) because `npm run build` was used instead of `npm run build:deploy`, producing root-relative asset paths that 404'd. Rebuilt with correct paths, added loading fallback to index.html. ESLint 9 with TS/React support configured. Build and all 9 tests pass.
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

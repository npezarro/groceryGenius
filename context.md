# context.md
Last Updated: 2026-03-17 | Replaced all any types with proper TypeScript types
Current State: App is live at pezant.ca/grocerygenius (HTTP 200 verified). All `any` types eliminated across 12 files (server and client). Build passes via `npm run build:deploy`. All 9 tests pass.
Open Work:
- MapView component is still a placeholder (no real Mapbox GL JS integration)
- JS bundle is ~851KB, could benefit from code splitting
- Receipt OCR: currently manual entry only
- Optional: replace raw score number with semantic labels ("Best Price", "Best Coverage")
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
Active Branch: main

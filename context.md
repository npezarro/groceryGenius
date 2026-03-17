# context.md
Last Updated: 2026-03-17 | Merged agent/lint-fixes, deployed, cleaned up stale branches
Current State: App is live at pezant.ca/grocerygenius (HTTP 200 verified). All work from agent/lint-fixes (ESLint 9, blank page fixes, multi-store trip planning, BASE_PATH guard) merged via PR #18. Build passes via `npm run build:deploy`. PM2 process restarted and serving cleanly.
Open Work:
- MapView component is still a placeholder (no real Mapbox GL JS integration)
- JS bundle is ~851KB, could benefit from code splitting
- Receipt OCR: currently manual entry only
- 21 `any` types to progressively replace with proper types
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

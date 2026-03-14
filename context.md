# context.md
Last Updated: 2026-03-13 | Fixed blank page outage, added build guards and deploy script
Current State: App is live at pezant.ca/grocerygenius. Fixed second blank-page outage caused by missing BASE_PATH in build. Added three layers of prevention: (1) vite.config.ts guard that throws on production builds without BASE_PATH, (2) verify-build script that checks asset paths post-build, (3) deploy.sh script that automates build+restart+verify. Build passes via `npm run build:deploy`. Bare `npm run build` now correctly fails for production builds.
Open Work:
- MapView component is still a placeholder (no real Mapbox GL JS integration)
- JS bundle is ~743KB, could benefit from code splitting
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
Active Branch: agent/lint-fixes

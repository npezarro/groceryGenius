# context.md
Last Updated: 2026-03-12 | Multi-store trip planning with greedy set-cover algorithm
Current State: App is live at pezant.ca/grocerygenius. Trip planner now generates multi-store plans (2-3 stores) using greedy set-cover, not just single-store trips. Scoring uses min/max normalization instead of hardcoded divisors, and coverage is a first-class ranking signal. Coverage badge promoted to card header with color coding (green/amber/red). Build and all 9 tests pass.
Open Work:
- MapView component is still a placeholder (no real Mapbox GL JS integration)
- JS bundle is ~743KB, could benefit from code splitting
- Receipt OCR: currently manual entry only
- 21 `any` types to progressively replace with proper types
- Optional: replace raw score number with semantic labels ("Best Price", "Best Coverage")
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

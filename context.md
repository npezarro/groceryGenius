# context.md
Last Updated: 2026-03-07 — Fixed broken auth, persistent sessions, and hardened admin endpoint
Current State: App is live at pezant.ca/grocerygenius. Authentication now works correctly behind Apache reverse proxy (trust proxy + Secure cookies). Sessions persist across PM2 restarts via connect-pg-simple (PostgreSQL). Admin seed endpoint requires ADMIN_KEY header.
Recent Changes:
- Fixed broken auth: added `trust proxy` so Express sets Secure cookies behind Apache reverse proxy
- Replaced MemoryStore with connect-pg-simple for persistent sessions across restarts
- Re-enabled ADMIN_KEY auth check on POST /api/admin/seed (was disabled, allowing anyone to seed data)
- Removed dead checkAdminAuth function and unused schema imports
- Added input validation for store distance query params (lat, lng, radius)
Open Work:
- MapView component is still a placeholder (no real Mapbox GL JS integration)
- JS bundle is ~726KB — could benefit from code splitting
- Receipt OCR: currently manual entry only
Environment Notes:
- Deploy: pezant.ca/grocerygenius via Apache ProxyPass → localhost:8080
- PM2 process: grocerygenius (id 1)
- BASE_PATH: /grocerygenius (build time for Vite, runtime for Express)
- Port: 8080 (production), 5000 (dev)
- Database: local PostgreSQL via DATABASE_URL
- Sessions: PostgreSQL via connect-pg-simple (table auto-created)
- Build: `npm run build:deploy` (sets BASE_PATH, runs Vite + esbuild)
- Start: `npm run start` (NODE_ENV=production node dist/index.js)
Active Branch: claude/fix-blank-page-base-path

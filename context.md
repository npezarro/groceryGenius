# context.md
Last Updated: 2026-03-10 — Security hardening: auth guards, session secret, helmet, input validation
Current State: App is live at pezant.ca/grocerygenius. Security hardening applied: /api/admin/seed now requires x-admin-key header, session secret is required (no hardcoded fallback), helmet adds security headers, payload size capped at 10MB, validateInput middleware extracts Zod validation for auth routes. Vitest added with 9 security tests.
Recent Changes:
- Wired isAuthorized() guard on /api/admin/seed (was completely unauthenticated)
- Removed hardcoded session secret fallback; SESSION_SECRET env var is now required at startup
- Changed cookie sameSite from "lax" to "strict"
- Added helmet middleware for security headers (CSP, HSTS, X-Frame-Options, etc.)
- Increased express.json limit from 5mb to 10mb with explicit cap
- Extracted reusable validateInput(schema) middleware in server/auth.ts
- Wired validateInput to /api/auth/register and /api/auth/login endpoints
- Added vitest with 9 security tests covering admin auth, session secret, and input validation
Open Work:
- MapView component is still a placeholder (no real Mapbox GL JS integration)
- JS bundle is ~726KB — could benefit from code splitting
- MemoryStore for sessions should be replaced with connect-pg-simple for production
- Receipt OCR: currently manual entry only
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
Active Branch: claude/security-hardening

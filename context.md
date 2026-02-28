# context.md
Last Updated: 2026-02-28 — Fixed bugs and added GCP subpath deployment support
Current State: App builds cleanly (TS + Vite + esbuild), production server starts and serves static files at configurable BASE_PATH. No database connected in this environment (needs DATABASE_URL). All routes verified working with BASE_PATH=/grocerygenius.
Recent Changes:
- Fixed server crash bugs (reusePort, throw in error handler, uncaught seed failure)
- Fixed esbuild @shared alias so production bundle resolves shared/schema
- Added BASE_PATH env var support for subpath hosting at pezant.ca/grocerygenius
- All client API calls routed through apiUrl() helper
- Wouter router configured with base path
- Created Dockerfile (multi-stage) and .dockerignore
- Trimmed Google Fonts from 25+ families to just Roboto
- Added HTML title/meta, .env.example
- LoadTestDataBar now collapsed by default behind "Dev Tools" button
Open Work:
- Need DATABASE_URL (Neon PostgreSQL) to test full functionality
- Need MAPBOX_ACCESS_TOKEN for geocoding features
- GCP deployment: Docker image needs to be built and deployed to Cloud Run (or GCE)
- Nginx/load balancer at pezant.ca needs to proxy /grocerygenius/* to the service
- MapView component is still a placeholder (no real Mapbox GL JS integration)
- JS bundle is 708KB — could benefit from code splitting
- Admin panel has no authentication
- No Drizzle migration files (using drizzle-kit push)
Environment Notes:
- Deploy target: GCP (Cloud Run or GCE) at pezant.ca/grocerygenius
- BASE_PATH: /grocerygenius (set at build time for Vite, runtime for Express)
- Port: 5000 (dev), 8080 (Docker default)
- Database: Neon PostgreSQL (serverless) via DATABASE_URL env var
- Build: `npm run build` (Vite for client, esbuild for server)
- Start: `npm run start` (NODE_ENV=production node dist/index.js)
Active Branch: claude/fix-code-gcp-deploy-q5ZMg

# context.md
Last Updated: 2026-03-06 — Fixed blank page and added Nominatim geocoding fallback
Current State: App is live at pezant.ca/grocerygenius. Serves correctly with BASE_PATH=/grocerygenius. Geocoding works via Nominatim (free, no API key) as fallback when Mapbox token is not configured. Database uses standard pg driver against local PostgreSQL.
Recent Changes:
- Added Nominatim (OpenStreetMap) as fallback geocoder when MAPBOX_ACCESS_TOKEN is not set
- Fixed blank page caused by pg module ESM import error crashing PM2 process
- Switched from @neondatabase/serverless to standard pg driver for local PostgreSQL
- Added build:deploy script that sets BASE_PATH=/grocerygenius for correct Vite asset paths
- Applied runEval design system: ink/sand/ember/moss/sky palette, Fraunces + IBM Plex Sans fonts, light-only
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
- Build: `npm run build:deploy` (sets BASE_PATH, runs Vite + esbuild)
- Start: `npm run start` (NODE_ENV=production node dist/index.js)
Active Branch: claude/fix-blank-page-base-path

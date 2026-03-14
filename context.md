# context.md
Last Updated: 2026-03-06 — Fixed geocoding and database driver so trip plan generation works
Current State: App fully functional on pezant.ca/grocerygenius. Geocoding, store discovery, and trip plan generation all working end-to-end. Uses Nominatim (OpenStreetMap) for geocoding when no Mapbox token is configured. Standard `pg` driver for local PostgreSQL.
Recent Changes:
- Fixed geocoding: added Nominatim (OpenStreetMap) as fallback geocoder when MAPBOX_ACCESS_TOKEN is not set. Previously the app threw "Mapbox access token not configured" and the entire trip planning chain was broken (no coordinates → no stores → disabled button).
- Fixed database driver: switched from @neondatabase/serverless to standard pg driver (drizzle-orm/node-postgres). The Neon driver forces WebSocket+TLS which fails against local PostgreSQL (TLS cert mismatch on 127.0.0.1).
- Applied runEval design system: ink/sand/ember/moss/sky palette, Fraunces + IBM Plex Sans fonts, light-only mode
- Fixed server crash bugs (reusePort, throw in error handler, uncaught seed failure)
- Fixed esbuild @shared alias so production bundle resolves shared/schema
- Added BASE_PATH env var support for subpath hosting at pezant.ca/grocerygenius
Open Work:
- MapView component is still a placeholder (no real Mapbox GL JS map integration)
- JS bundle is ~726KB — could benefit from code splitting
- Receipt OCR: currently manual entry only
- No Drizzle migration files (using drizzle-kit push)
- MAPBOX_ACCESS_TOKEN is optional (Nominatim fallback works) but can be added for higher-quality geocoding
Environment Notes:
- PM2 process: grocerygenius, port 8080
- Deploy target: pezant.ca/grocerygenius (Apache proxy → localhost:8080)
- Source: /home/generatedByTermius/groceryGenius
- Production: /opt/grocerygenius
- BASE_PATH: /grocerygenius
- Database: local PostgreSQL via DATABASE_URL (standard pg driver)
- Build: `npm run build` (Vite for client, esbuild for server)
- Deploy: copy dist/ to /opt/grocerygenius/dist/, pm2 restart grocerygenius
Active Branch: claude/fix-geocoding-and-db-driver

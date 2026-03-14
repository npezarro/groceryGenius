# context.md
Last Updated: 2026-03-10 — Added drag-and-drop reordering to shopping list
Current State: App fully functional on pezant.ca/grocerygenius. Shopping list items now support drag-and-drop reordering via grip handle using framer-motion Reorder API (already a dependency — no new packages added).
Recent Changes:
- Added drag-and-drop reordering to shopping list items using framer-motion's Reorder API with visual feedback (scale + shadow on drag, grip handle cursor states)
- Fixed geocoding: added Nominatim (OpenStreetMap) as fallback geocoder when MAPBOX_ACCESS_TOKEN is not set
- Fixed database driver: switched from @neondatabase/serverless to standard pg driver
- Applied runEval design system: ink/sand/ember/moss/sky palette, Fraunces + IBM Plex Sans fonts, light-only mode
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
Active Branch: claude/drag-and-drop-reorder

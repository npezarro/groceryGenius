# context.md
Last Updated: 2026-03-05 — Applied runEval design system (light-only, warm earth tones)
Current State: App builds cleanly (TS + Vite + esbuild) with new runEval design system. Colors swapped from blue/green to ink/sand/ember/moss/sky palette. Fonts changed from Roboto to Fraunces (display) + IBM Plex Sans (body). Dark mode removed (light-only). All CSS variables updated, hardcoded colors replaced with semantic tokens.
Recent Changes:
- Applied runEval design system: swapped all CSS variables to ink/sand/ember/moss/sky palette, replaced Roboto with Fraunces + IBM Plex Sans, removed dark mode (.dark class + darkMode config), fixed hardcoded blue/green colors in map-view, receipt-upload, submit-price, price-sparkline components, updated slider/map container styles from hsl() to direct var() references
- Fixed server crash bugs (reusePort, throw in error handler, uncaught seed failure)
- Fixed esbuild @shared alias so production bundle resolves shared/schema
- Added BASE_PATH env var support for subpath hosting at pezant.ca/grocerygenius
- All client API calls routed through apiUrl() helper
- Wouter router configured with base path
- Created Dockerfile (multi-stage) and .dockerignore
- Trimmed Google Fonts from 25+ families to just Roboto
- Added HTML title/meta, .env.example
- LoadTestDataBar now collapsed by default behind "Dev Tools" button
- Added user authentication (session-based with scrypt password hashing)
  - Login/register page at /auth
  - Auth-aware header (username + sign out / sign in link)
  - express-session with MemoryStore
  - requireAuth middleware for protected routes
- Extended database schema:
  - users table: added email, displayName, createdAt
  - prices table: added submittedBy field for community submissions
  - New userFavoriteStores table (userId + storeId unique)
  - New receipts table (imageData, parsedItems jsonb, status)
- Added favorite stores feature:
  - Heart icon toggle per store in sidebar
  - GET/POST/DELETE /api/user/favorite-stores endpoints
- Added community price submission:
  - Form to submit item name + store + price + unit
  - POST /api/user/prices creates real price records via findOrCreateItem
  - GET /api/prices/community/:itemId for viewing submissions
- Added receipt upload:
  - Client-side image resize (800px max via canvas)
  - Store selector, purchase date, manual item/price rows
  - Receipt history list with submit-to-prices button
  - POST/GET/PUT receipt endpoints + POST submit-prices
Open Work:
- Need DATABASE_URL (Neon PostgreSQL) to test full functionality
- Need to run `drizzle-kit push` to create new tables (userFavoriteStores, receipts, extended users/prices)
- Need MAPBOX_ACCESS_TOKEN for geocoding features
- GCP deployment: Docker image needs to be built and deployed to Cloud Run (or GCE)
- Nginx/load balancer at pezant.ca needs to proxy /grocerygenius/* to the service
- MapView component is still a placeholder (no real Mapbox GL JS integration)
- JS bundle is ~723KB — could benefit from code splitting
- MemoryStore for sessions should be replaced with a persistent store (connect-pg-simple) for production
- Receipt OCR: currently manual entry only; could add Google Cloud Vision API
- No Drizzle migration files (using drizzle-kit push)
Environment Notes:
- Deploy target: GCP (Cloud Run or GCE) at pezant.ca/grocerygenius
- BASE_PATH: /grocerygenius (set at build time for Vite, runtime for Express)
- Port: 5000 (dev), 8080 (Docker default)
- Database: Neon PostgreSQL (serverless) via DATABASE_URL env var
- Session: SESSION_SECRET env var (defaults to dev secret if unset)
- Build: `npm run build` (Vite for client, esbuild for server)
- Start: `npm run start` (NODE_ENV=production node dist/index.js)
Active Branch: claude/runeval-design-system

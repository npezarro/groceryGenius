# context.md
Last Updated: 2026-03-10 — Mobile tabbed layout for Shopping List, Map, Trip Plans
Current State: App is live at pezant.ca/grocerygenius. Mobile viewport (<768px) now renders a Radix Tabs interface with three tabs (Shopping List, Map, Trip Plans) instead of the stacked single-column layout. Desktop layout (>=768px) remains unchanged as the original 3-column grid. The existing useIsMobile hook and Radix Tabs UI component were reused — no new dependencies added.
Recent Changes:
- Added mobile tabbed layout using Radix Tabs in client/src/pages/home.tsx
- Mobile (<768px): 3-tab interface — Shopping List, Map, Trip Plans — with sticky tab bar
- Desktop (>=768px): original lg:grid-cols-3 layout preserved unchanged
- Reused existing useIsMobile() hook (client/src/hooks/use-mobile.tsx) and Tabs component (client/src/components/ui/tabs.tsx)
- No changes to panel component internals (ShoppingList, MapView, TripPlans, etc.)
Open Work:
- MapView component is still a placeholder (no real Mapbox GL JS integration)
- JS bundle is ~743KB — could benefit from code splitting
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
Active Branch: claude/mobile-tabs

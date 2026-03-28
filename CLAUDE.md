# Grocery Genius

## Stack
- Vite + React (TypeScript), Tailwind CSS
- Express backend, Drizzle ORM, PostgreSQL
- Vitest for testing

## Commands
- `npm run build:deploy` — production build (sets BASE_PATH, runs Vite + esbuild + verify-build)
- `npm run dev` — dev server on port 5000
- `npx vitest` — run tests

## Architecture
- **Base path**: `/grocerygenius`
- **Port**: 8080 (production), 5000 (dev)
- **PM2 process**: grocerygenius (id 4)
- **Deploy**: pezant.ca/grocerygenius via Apache ProxyPass to localhost:8080
- **Database**: local PostgreSQL via DATABASE_URL
- **Required env**: SESSION_SECRET, DATABASE_URL; optional: ADMIN_KEY, MAPBOX_ACCESS_TOKEN

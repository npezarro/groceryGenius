# Grocery Genius

## Stack
- Vite + React (TypeScript), Tailwind CSS
- Express backend, Drizzle ORM, PostgreSQL
- Vitest for testing

## Commands
- `npm run build:deploy` — production build (sets BASE_PATH, runs Vite + esbuild + verify-build)
- `npm run dev` — dev server on port 5000
- `npx vitest` — run tests

## Fonts
- **Self-hosted** via `@fontsource` (no CDN). Imports in `client/src/main.tsx`.
- Fraunces (headings) + IBM Plex Sans (body), weights 400-700.
- To add a font: `npm install @fontsource/<name>`, import weight CSS in `main.tsx`.

## Architecture
- **Base path**: `/grocerygenius`
- **Port**: 8080 (production), 5000 (dev)
- **PM2 process**: grocerygenius (id 4)
- **Deploy**: production VM via Apache ProxyPass to localhost:8080 (see privateContext/infrastructure.md)
- **Database**: local PostgreSQL via DATABASE_URL
- **Required env**: SESSION_SECRET, DATABASE_URL; optional: ADMIN_KEY, MAPBOX_ACCESS_TOKEN

## Pipeline Adapter Gotchas
- **External data fields are not always strings.** Grocery API responses return prices, sizes, and names as `number | null | undefined` even when typed as `string`. Always wrap with `String(x)` before calling `.match()`, `.toLowerCase()`, `.trim()`, or any string method. Add a null-check first: `if (!x) return undefined;`. Failing to do this causes `TypeError: x.match is not a function` crashes in the normalizer/validator pipeline.
- **Pattern:** `const str = String(x); const match = str.match(/pattern/);` — not `x.match(/pattern/)`.
- Files where this pattern applies: `adapters/traderjoes.ts`, `adapters/safeway.ts`, `normalizer.ts`, `validator.ts`.

## Post-Deploy Verification

After deploying to the VM, verify within 30 seconds:
1. `pm2 show grocerygenius` — confirm status is `online`, uptime climbing, no restart spikes.
2. `curl -s -o /dev/null -w "%{http_code}" https://$DEPLOY_DOMAIN/grocerygenius/` — confirm HTTP 200 (domain from privateContext/infrastructure.md).
3. `pm2 logs grocerygenius --lines 20` — scan for errors or crash loops.
4. If `package.json` or `package-lock.json` changed, run `npm install` on the server before restarting.
5. Deploy after every change. Do not accumulate commits without deploying. Stale builds cause chunk mismatch errors.

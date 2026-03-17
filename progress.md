# Progress Log

> Continuously updated log of all work done on this project. Add entries in reverse chronological order (newest first). One entry per PR, deploy, or significant change. Keep entries concise — 1-2 lines max.
>
> **Update rules:**
> - Add an entry for every merged PR or significant commit
> - Add an entry for every deploy
> - Log infrastructure changes (env vars, server config, deps)
> - Never include secrets, credentials, or .env contents
> - Format: `YYYY-MM-DD | <type> | <description>`

## Log

| Date | Type | Description |
|------|------|-------------|
| 2026-03-17 | refactor | Code splitting: React.lazy for 3 routes + 4 components, Suspense boundaries, Vite manualChunks for 5 vendor groups; single 854KB chunk split into 14 chunks, largest 376KB, initial shell ~181KB |
| 2026-03-17 | feat | Replace raw numeric scores in trip plan cards with semantic labels ("Best Overall", "Best Price", "Best Coverage", "Quickest Trip") based on relative ranking; numeric score preserved as secondary text and tooltip |
| 2026-03-17 | refactor | Replace all 23 `any` types with proper TypeScript types across 12 files; adds NearbyStore shared type, PromotionalPrice interface, typed CSV import partials, and inferred Drizzle return types |
| 2026-03-17 | deploy | Deployed latest main to production (PM2 restart, HTTP 200 verified); cleaned up 4 stale branches (agent/lint-fixes, claude/fix-blank-page-base-path, claude/fix-code-gcp-deploy-q5ZMg, claude/price-pipeline) |
| 2026-03-13 | fix | Fixed second blank-page outage (missing BASE_PATH); added build-time guard in vite.config.ts, verify-build script, and deploy.sh to prevent recurrence |
| 2026-03-12 | feat | Multi-store trip planning: greedy set-cover algorithm for 2-3 store combos, min/max scoring normalization, coverage-weighted ranking, color-coded coverage badge in card header |
| 2026-03-11 | fix | Fixed blank page outage: rebuilt with `build:deploy` to restore `/grocerygenius/` asset prefix; added loading fallback to index.html for resilience |
| 2026-03-10 | refactor | ESLint 9 setup with TS/React support; removed unused imports, dead functions (getDistanceMatrix, checkAdminAuth), and dead exports across client/src and server/ |
| 2026-03-10 | feature | Mobile tabbed layout: Radix Tabs with Shopping List / Map / Trip Plans tabs for viewports <768px; desktop grid unchanged |
| 2026-03-10 | security | Security hardening: admin seed auth guard, required session secret, helmet headers, payload size limit, validateInput middleware, vitest security tests |
| 2026-03-10 | infra | GCP VM audit: bind server to 127.0.0.1, install fail2ban, consolidate SSL certs, clean Apache config, add PM2 daily restarts |
| 2026-03-07 | feat | Add multi-source price data pipeline with BLS adapter, Kroger/TJ/Safeway/WF templates, scheduler, and admin API |
| 2026-03-07 | fix | Fix broken auth (trust proxy, connect-pg-simple sessions), protect admin seed endpoint, clean up dead code |
| 2026-03-06 | fix | Add Nominatim geocoding fallback and harden deployment |
| 2026-03-06 | fix | Fix blank page: set BASE_PATH for Vite build and switch to standard pg driver |
| 2026-03-06 | PR #8 | Fix blank page and add Nominatim geocoding fallback |
| 2026-03-06 | deploy | Deployed geocoding fix and blank page fix to production |
| 2026-03-06 | PR #3 | Claude/Runeval Design System |
| 2026-03-05 | PR #5 | Restyle Grocery Genius UI to align with runEval visual style |
| 2026-03-05 | PR #4 | Apply runEval design system — light-only warm palette |
| 2026-03-05 | feat | Add favorite stores, price submission, and receipt upload components |
| 2026-03-05 | feat | Add client-side auth (context, login page, header navigation) |
| 2026-03-05 | feat | Add session middleware, auth routes, and feature API endpoints |
| 2026-03-05 | feat | Add auth, favorites, receipts schema and storage methods |
| 2026-03-05 | PR #2 | Fix bugs and add GCP subpath deployment support |
| 2026-03-04 | infra | Propagate Claude Code hooks and CLAUDE.md from agentGuidance |
| 2026-03-04 | feat | Add ability to filter groceries by selected store locations |
| 2026-03-04 | feat | Add custom grocery store ordering feature |
| 2026-03-04 | PR #1 | Fix bugs and add GCP subpath deployment support |
| 2026-03-01 | PR | Add BASE_PATH support for subpath hosting and Docker deployment |
| 2026-03-10 | feat | Add drag-and-drop reordering to shopping list using framer-motion Reorder API |
| 2026-03-06 | PR #8 | Fix blank page and add Nominatim geocoding fallback |
| 2026-03-06 | deploy | Deployed geocoding fix and blank page fix to production |
| 2026-03-05 | PR #5 | Restyle Grocery Genius UI to align with runEval visual style |
| 2026-03-05 | PR #4 | Apply runEval design system — light-only warm palette |
| 2026-03-04 | infra | Propagate Claude Code hooks and CLAUDE.md from agentGuidance |
| 2026-03-01 | PR #2 | Add BASE_PATH support for subpath hosting and Docker deployment |
| 2026-02-28 | PR #1 | Add BASE_PATH support for subpath hosting and Docker deployment |

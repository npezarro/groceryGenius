# context.md
Last Updated: 2026-03-07 — Added multi-source grocery price data pipeline
Current State: App is live at pezant.ca/grocerygenius. Price data pipeline with 5 source adapters is deployed and running. BLS adapter is actively ingesting real average grocery prices (23 items). Scheduler runs every 6 hours. Pipeline admin API available for manual triggers.
Recent Changes:
- Built multi-source price data pipeline in server/pipeline/ with adapter pattern
- Added BLS Average Prices adapter (working — ingests real USDA grocery prices)
- Added Kroger API adapter (ready — needs KROGER_CLIENT_ID/SECRET env vars)
- Added Trader Joe's, Safeway, Whole Foods adapters (template — stores use bot protection/SPA rendering, need Playwright for full scraping)
- Added scrape_runs table for pipeline run tracking and monitoring
- Added node-cron scheduler (every 6h) and manual trigger API endpoints
- Added pipeline status/monitoring endpoints (GET /api/pipeline/sources, /api/pipeline/runs)
- Added ADMIN_KEY to ecosystem config for pipeline trigger auth
Open Work:
- Kroger API: Register at developer.kroger.com, set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET
- Store scrapers (TJ's, Safeway, WF): Need Playwright/headless browser for JS-rendered pages — too heavy for 150MB PM2 limit, consider separate pipeline process
- BLS_API_KEY: Optional, register at bls.gov for higher rate limits
- MapView component is still a placeholder
- Receipt OCR: currently manual entry only
Environment Notes:
- Deploy: pezant.ca/grocerygenius via Apache ProxyPass → localhost:8080
- PM2 process: grocerygenius (max 150MB)
- BASE_PATH: /grocerygenius (build time for Vite, runtime for Express)
- Port: 8080 (production), 5000 (dev)
- Database: local PostgreSQL via DATABASE_URL
- Sessions: PostgreSQL via connect-pg-simple
- Pipeline scheduler: node-cron, runs every 6 hours at :15 past
- Pipeline API: POST /api/pipeline/run (all), POST /api/pipeline/run/:sourceId (single) — requires X-Admin-Key header
Active Branch: claude/price-pipeline

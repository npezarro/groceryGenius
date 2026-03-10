# context.md
Last Updated: 2026-03-10 — GCP VM audit and security hardening
Current State: App is live at pezant.ca/grocerygenius. Price data pipeline with 5 source adapters is deployed and running. BLS adapter is actively ingesting real average grocery prices (23 items). Scheduler runs every 6 hours. Pipeline admin API available for manual triggers.
Recent Changes:
- Server now binds to 127.0.0.1 instead of 0.0.0.0 (configurable via HOST env var)
- fail2ban installed with sshd, apache-auth, and apache-403 jails
- Cleaned 8 .bak/.save files from Apache sites-enabled
- Removed unused SSLProxyCheckPeerCN/SSLProxyCheckPeerName directives from Apache config
- Consolidated 3 Let's Encrypt certs down to 1 (pezant.ca covering both pezant.ca and www.pezant.ca)
- Added daily PM2 restart cron for claude-bot and pezant-tools (5 AM UTC)
Open Work:
- GCP scheduled snapshots: Need to run from a machine with full gcloud auth scopes (VM service account lacks resource-policies scope)
- Bind pezant-tools (3003), runeval (3001), promptlibrary (3004) to 127.0.0.1 (currently protected by UFW)
- Kroger API: Register at developer.kroger.com, set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET
- Store scrapers (TJ's, Safeway, WF): Need Playwright/headless browser for JS-rendered pages
- MapView component is still a placeholder
- Debian 11→12 upgrade planned for April 2026 (Bullseye EOL August 2026)
- Apache→Caddy migration planned for May 2026
Environment Notes:
- Deploy: pezant.ca/grocerygenius via Apache ProxyPass → localhost:8080
- PM2 process: grocerygenius (max 150MB)
- BASE_PATH: /grocerygenius (build time for Vite, runtime for Express)
- Host: 127.0.0.1 (default), configurable via HOST env var
- Port: 8080 (production), 5000 (dev)
- Database: local PostgreSQL via DATABASE_URL
- Sessions: PostgreSQL via connect-pg-simple
- Pipeline scheduler: node-cron, runs every 6 hours at :15 past
- Pipeline API: POST /api/pipeline/run (all), POST /api/pipeline/run/:sourceId (single) — requires X-Admin-Key header
- Firewall: UFW default-deny, allows 22/80/443 only
- fail2ban: sshd, apache-auth, apache-403 jails active
Active Branch: claude/price-pipeline

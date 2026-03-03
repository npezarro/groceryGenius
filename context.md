# context.md
Last Updated: 2026-03-03 — Added admin system, email verification, and UI overhaul
Current State: App is live at https://pezant.ca/grocerygenius/. Full UI redesign (green theme, Inter font, real shadows). Admin dashboard at /admin gated behind role + email verification. Email verification via Gmail SMTP with 6-digit codes. Auth system includes registration, login, sessions, and verification flow. DB seeded with 3 stores, 10 items, 30 prices. No Mapbox token configured (geocoding won't work). Sessions use MemoryStore (not persistent across PM2 restarts).
Recent Changes:
- Added email verification system: nodemailer + Gmail SMTP, 6-digit codes, 15-min expiry, verify/resend endpoints, dedicated /verify-email page
- Added admin role system: isAdmin() checks email/role, requireAdmin middleware (checks admin + emailVerified), dedicated /admin page with stats/seed/import/geocoding/data management/users panels
- Complete UI overhaul: green grocery theme, Inter font, fixed shadow variables, gradient header, branded auth page, improved all component cards
- Swapped pg driver for local PostgreSQL (Neon driver incompatible with local DB)
Open Work:
- Need MAPBOX_ACCESS_TOKEN for geocoding features
- MapView component is still a placeholder (no Mapbox GL JS integration)
- JS bundle is ~739KB — could benefit from code splitting
- MemoryStore for sessions should be replaced with connect-pg-simple for persistence
- Receipt OCR: currently manual entry only
- No Drizzle migration files (using drizzle-kit push, manual ALTER TABLEs)
Environment Notes:
- Deploy target: GCE VM (wordpress-7-vm) at pezant.ca
- SSH user: n_pezarro / hostname: pezant.ca
- PM2 process name: grocerygenius / port: 8080
- PM2 config: /opt/grocerygenius/ecosystem.config.cjs (NOT committed — contains secrets)
- Web server: Apache 2.4 / config: /etc/apache2/sites-enabled/wordpress-https.conf
- BASE_PATH: /grocerygenius (set at build time for Vite, runtime for Express)
- Database: local PostgreSQL 13 on 127.0.0.1:5432, database name: grocerygenius
- SMTP: Gmail via pezant.projects@gmail.com (app password in ecosystem.config.cjs)
- Build: `BASE_PATH=/grocerygenius npm run build`
- Start: `pm2 start ecosystem.config.cjs` (or `pm2 restart grocerygenius --update-env`)
Active Branch: claude/fix-code-gcp-deploy-q5ZMg

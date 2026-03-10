# Progress Log

> Continuously updated log of all work done on this project. Add entries in reverse chronological order (newest first). One entry per PR, deploy, or significant change. Keep entries concise -- 1-2 lines max.
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
| 2026-03-10 | security | Security hardening: admin seed auth guard, required session secret, helmet headers, payload size limit, validateInput middleware, vitest security tests |
| 2026-03-06 | PR | Fix blank page and add Nominatim geocoding fallback |
| 2026-03-06 | deploy | Deployed geocoding fix and blank page fix to production |
| 2026-03-05 | PR | Restyle Grocery Genius UI to align with runEval visual style |
| 2026-03-05 | PR | Apply runEval design system -- light-only warm palette |
| 2026-03-04 | infra | Propagate Claude Code hooks and CLAUDE.md from agentGuidance |
| 2026-03-01 | PR | Add BASE_PATH support for subpath hosting and Docker deployment |

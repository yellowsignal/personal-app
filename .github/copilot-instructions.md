# GitHub Copilot instructions — MyFamily Hub

This file is the Copilot equivalent of Cursor project rules / `AGENTS.md`.

## Always do
1. Read **`10_docs/작업내용.md`** before starting work (status, next tasks).
2. Follow **`AGENTS.md`** and `10_docs/기획서.md`.
3. After meaningful work, **update `10_docs/작업내용.md`**.

## Stack & layout
- `20_client` — React + Vite + Tailwind mockup UI (auth wired to API)
- `40_server` — Express + Prisma + JWT auth/family API
- Workspaces: `20_client`, `40_server` only

## Important
- User often works from **iPhone**; avoid PC-only assumptions.
- Never commit secrets (DuckDNS token, SSH keys, passwords).
- Temp public site: `http://sumicchogurashi.duckdns.org`
- Dev auth without DB: `MEMORY_AUTH=1`

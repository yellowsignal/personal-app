# personal-app (MyFamily Hub)

PWA 기반 개인·가족 통합 관리 앱을 위한 monorepo입니다.
현재는 프론트 목업 UI와 Express 스타터 API가 함께 있습니다.

- **20_client/** — React 18 + Vite + TypeScript + Tailwind (목업 UI, ko/ja i18n)
- **40_server/** — Express + TypeScript REST API (스타터 태스크 API + OCI infra 초안)
- **30_data/** — 로컬 JSON 영속 데이터
- **10_docs/** — 기획서·프롬프트·로드맵

The two packages are wired together with npm workspaces. The Vite dev server
proxies `/api` requests to the API, so the frontend and backend run as one app
during development.

## Prerequisites

- Node.js >= 20 (the repo is developed against Node 22)
- npm >= 10

## Getting started

```bash
npm install      # install all workspace dependencies
npm run dev      # start the API (:3001) and the web app (:5173) together
```

Then open http://localhost:5173. The mockup UI is available immediately; the
starter task API persists to `30_data/tasks.json`.

## Useful commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run the API and web dev servers in parallel |
| `npm run dev:server` | Run only the API (http://localhost:3001) |
| `npm run dev:client` | Run only the web app (http://localhost:5173) |
| `npm run build` | Type-check and build both packages |
| `npm run lint` | Lint both packages |
| `npm run typecheck` | Type-check both packages |
| `npm test` | Run the API test suite |

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health probe |
| `GET` | `/api/tasks` | List tasks (newest first) |
| `POST` | `/api/tasks` | Create a task (`{ "title": "..." }`) |
| `PATCH` | `/api/tasks/:id` | Toggle a task's `done` flag |
| `DELETE` | `/api/tasks/:id` | Delete a task |

## Cloud Agent environment

`.cursor/environment.json` installs dependencies with `npm install` and starts
two long-running terminals: `api` (`npm run dev:server`) and `web`
(`npm run dev:client`). The default Cursor base image already provides Node 22,
so no custom Dockerfile is required.

## Infrastructure (phase 1)

Oracle Cloud + temporary DuckDNS + Nginx/HTTPS scaffolding lives in
`40_server/infra/`. Follow `10_docs/인프라_1단계_체크리스트.md`.

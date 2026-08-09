# personal-app

A small full-stack starter app used to bootstrap the project and its Cloud Agent
development environment.

- **client/** — React 18 + Vite + TypeScript single-page app (task list UI).
- **server/** — Express + TypeScript REST API with a dependency-free JSON store.

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

Then open http://localhost:5173 and add a task. It is persisted through the API
to `data/tasks.json`.

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

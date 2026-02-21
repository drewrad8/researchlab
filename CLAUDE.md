# Research Lab

Node.js research orchestration app. No external dependencies -- stdlib only.

## Running

```
npm start
# or
node server.js
```

Starts on port 3700 (override with `RESEARCHLAB_PORT` env var).

## Structure

- `server.js` -- HTTP server, routes, SSE
- `lib/project-store.js` -- file-based persistence in ~/.researchlab/projects/
- `lib/pipeline.js` -- research pipeline (plan -> research -> synthesis)
- `lib/strategos.js` -- Strategos API client (configurable via `STRATEGOS_URL`)
- `lib/sources.js` -- data source registry (~/.researchlab/sources.json)
- `lib/research-index.js` -- completed research index (~/.researchlab/index.json)
- `lib/graph-builder.js` -- knowledge graph schema and validation
- `public/` -- static frontend (served at /public/*)

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | / | Serves public/index.html |
| GET | /public/* | Static files |
| POST | /api/projects | Create project. Body: `{ "topic": "..." }` |
| GET | /api/projects | List all projects |
| GET | /api/projects/:id | Get project detail |
| GET | /api/projects/:id/graph | Get project knowledge graph |
| GET | /api/projects/:id/events | SSE stream for project progress |
| DELETE | /api/projects/:id | Delete project |
| GET | /api/sources | List data sources (?topic= to match) |
| POST | /api/sources | Upsert a source. Body: `{ "id": "...", ... }` |
| GET | /api/sources/:id | Get source by ID |
| DELETE | /api/sources/:id | Delete source |
| GET | /api/index | List research index (?q= to search) |
| POST | /api/index/rebuild | Rebuild index from project dirs |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| RESEARCHLAB_PORT | 3700 | Server port |
| STRATEGOS_URL | http://localhost:38007 | Strategos API base URL |

## Data

Projects stored as JSON in `~/.researchlab/projects/{id}/`. Each project dir may contain:
- `project.json` -- project metadata
- `plan.json` -- research plan (sub-questions)
- `research/worker-N.json` -- per-worker research output
- `graph.json` -- final knowledge graph

## SSE Events

Pipeline pushes events via `emitEvent(projectId, eventName, data)`. Clients connect to `/api/projects/:id/events`. Event types: `phase`, `worker`, `progress`, `complete`, `error_event`, `validation`.

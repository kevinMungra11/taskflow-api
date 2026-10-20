# taskflow-api

A REST API for small-team task management: users, projects, project membership and tasks.

Built with **TypeScript**, **Express 5**, **PostgreSQL** (`pg`), **Zod** for validation and **JWT** auth.

## Getting started

```bash
cp .env.example .env          # then set JWT_SECRET
docker compose up -d db       # Postgres 16 on localhost:5432
npm install
npm run migrate
npm run dev
```

## Scripts

| Script              | Description                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the API with hot reload        |
| `npm run build`     | Compile to `dist/`                   |
| `npm start`         | Run the compiled build               |
| `npm run migrate`   | Apply pending SQL migrations         |
| `npm run typecheck` | Type-check without emitting          |
| `npm test`          | Run the unit tests (Vitest)          |

## API

All endpoints except `/health` and `/auth/*` need an `Authorization: Bearer <token>` header.

| Method | Path                                   | Description                       |
| ------ | -------------------------------------- | --------------------------------- |
| POST   | `/auth/register`                       | Create an account                 |
| POST   | `/auth/login`                          | Exchange credentials for a JWT    |
| GET    | `/users/me`                            | Current user                      |
| POST   | `/projects`                            | Create a project (you're owner)   |
| GET    | `/projects`                            | Projects you belong to            |
| GET    | `/projects/:projectId`                 | Project details                   |
| GET    | `/projects/:projectId/members`         | List members                      |
| POST   | `/projects/:projectId/members`         | Add a member by email (owner)     |
| DELETE | `/projects/:projectId/members/:userId` | Remove a member (owner)           |
| POST   | `/projects/:projectId/tasks`           | Create a task                     |
| GET    | `/projects/:projectId/tasks`           | List tasks (`status`, `priority`, `page`, `pageSize`) |
| GET    | `/tasks/:taskId`                       | Task details                      |
| PATCH  | `/tasks/:taskId`                       | Update a task                     |
| DELETE | `/tasks/:taskId`                       | Soft-delete a task                |

List endpoints return `{ items, page, pageSize, total, totalPages }`.

## Project layout

```
src/
  app.ts               Express app wiring
  config.ts            Env parsing (fails fast on bad config)
  db/pool.ts           pg pool, query + transaction helpers
  middleware/          Auth and error handling
  modules/<feature>/   Routes + service per feature
  utils/               Errors, pagination
migrations/            Plain SQL, applied in order by scripts/migrate.ts
tests/                 Vitest unit tests
```

Non-members get `404` (not `403`) for projects and tasks so resource ids can't be probed.

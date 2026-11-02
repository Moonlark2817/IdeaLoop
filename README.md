# IdeaLoop

IdeaLoop lets creatives share projects across coding, art, music, writing, and crafts, discover work through tags and skills, and connect through learning and collaboration requests.

This repository contains the Express + TypeScript backend, PostgreSQL schema, and React frontend. Backend source lives in root `src/`; the React frontend lives in `client/`.

## Local setup

Requires Node.js 22 or later and a running PostgreSQL instance.

```sh
npm ci
cp .env.example .env
createdb idealoop_db
```

Edit `.env` with your PostgreSQL credentials and set `JWT_SECRET` to a random secret of at least 32 characters. Generate one locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Then run:

```sh
npm run db:migrate
npm run dev
```

The API listens on `PORT` (default `5000`). `DATABASE_URL` is required. `NODE_ENV` must be `development`, `test`, or `production`. The API requires `JWT_SECRET`; migrations do not require it. S3 placeholders are reserved for future uploads.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API with automatic restart on edits |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server after building |
| `npm run typecheck` | Check types without generating output |
| `npm test` | Run HTTP and embedded PostgreSQL tests |
| `npm run db:migrate` | Apply pending Kysely migrations |

## Health endpoints

- `GET /api/health`: liveness; returns HTTP 200 independently of the database.
- `GET /api/health/ready`: executes a database query; returns HTTP 200 when connected or HTTP 503 when unavailable. This checks connectivity, not whether migrations have been applied.

```sh
curl http://localhost:5000/api/health
curl http://localhost:5000/api/health/ready
```

JSON request bodies are limited to 1 MB. Unknown routes and errors return `{ "error": { "message": "..." } }`. Production responses hide internal server error details. SIGINT and SIGTERM stop incoming connections and close the database pool; shutdown has a ten-second deadline.

## Backend structure

```text
src/
  app.ts                     Express app factory and health endpoints
  server.ts                  HTTP listener and graceful shutdown
  config/env.ts              Environment parsing and validation
  middleware/errorHandler.ts JSON errors and unknown-route handling
  db/
    connection.ts            PostgreSQL pool and typed Kysely connection
    types.ts                 Database types matching the migrations
    migrate.ts               Kysely migration runner
    migrations/              Schema and account-identity migrations
    run-sql.ts               Migration SQL execution helper
  controllers/               User CRUD, login, and input validation
  routes/                    User and authentication routes
  security/                  Password hashing and JWT helpers
  tests/                     Configuration, HTTP, and database integration tests
```

User CRUD and basic registration/login are implemented. Request endpoints, uploads, password recovery, and email verification remain future work. The React frontend is in `client/` and uses a development API proxy; see below.

## Database

See [database setup and ERD](db/README.md). Prefer `npm run db:migrate` for new environments. The raw SQL schema is an alternative initialization method; do not apply both to the same database because they create the same tables without shared migration tracking.

Optional sample data, from the repository root:

```sh
psql -d idealoop_db -f db/seed.sql
```

Seed data assumes a fresh database and uses placeholder password hashes; these users are not usable login accounts. Database types are maintained manually alongside migrations. `updated_at` defaults only set insertion timestamps; future update operations must set it explicitly. Learning requests use `learner_id` and `creator_id` in the actual schema.


## User API

| Method | Endpoint | Access / result |
| --- | --- | --- |
| POST | `/api/users` | Register a user; returns 201 with `{ user, token }` |
| POST | `/api/auth/register` | Alias for user registration |
| POST | `/api/auth/login` | Email/password login; returns `{ user, token }` |
| GET | `/api/users?limit=20&offset=0` | Public profiles, ordered by ID; maximum limit 100 |
| GET | `/api/users/:id` | Public profile |
| GET | `/api/users/me` | Own profile including email; Bearer token required |
| PATCH | `/api/users/:id` | Partial update; account owner only |
| DELETE | `/api/users/:id` | Delete account; account owner only; returns 204 |

Registration accepts `username`, `email`, `password`, and optional `bio` and `avatar_url`. Usernames allow 3–50 letters, digits, or underscores. Passwords require 12–128 characters. Emails are trimmed and lowercased; uniqueness for emails and usernames is case-insensitive. Bio is limited to 2000 characters; avatar URLs must use HTTP(S), contain no credentials, and fit within 512 characters. Nullable profile fields can be cleared with `null`. Unsupported fields are rejected.

Example registration:

```sh
curl -i -X POST http://localhost:5000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"username":"maya_creates","email":"maya@example.com","password":"a-long-demo-password","bio":"Artist and maker"}'
```

Use the returned token for protected requests:

```sh
curl http://localhost:5000/api/users/me \
  -H "Authorization: Bearer YOUR_TOKEN"

curl -X PATCH http://localhost:5000/api/users/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"bio":"Building games and digital art"}'
```

Use the ID returned by registration in place of `1`. PATCH accepts `username`, `email`, `password`, `bio`, and `avatar_url`. Changing email or password also requires `current_password`. Password changes return a replacement token and invalidate all tokens signed for the previous password hash. Tokens expire after one hour; login again to obtain another token. Deleting an account invalidates its tokens and cascades deletion of its related projects, comments, skills, and requests through the existing foreign keys.

Passwords use salted scrypt hashes and are never returned. Public profile responses omit email; authenticated registration/login, `/me`, and update responses include only the owner's email. Validation errors return 400, invalid/missing credentials 401, ownership violations 403, unknown users 404, and duplicate identities 409.

Registration and login share an in-memory limit of 20 requests per IP per 15 minutes. Updates/deletions share a limit of 60 per IP per 15 minutes. Limits reset on restart; multi-instance deployments need a shared limiter store. When deploying behind a reverse proxy, configure Express trust settings for the actual trusted proxy before relying on per-client IP limits. Use HTTPS in deployment and keep JWT secrets out of source control.

Migration `005_user_identity` adds case-insensitive unique indexes without rewriting existing migrations. Existing databases with case-only duplicate usernames or emails must resolve those duplicates before applying it. The raw SQL alternative includes equivalent indexes in `db/modules/05_user_identity.sql`.

Tests run the real migrations and Kysely queries against in-memory PostgreSQL using PGlite. Coverage includes user CRUD, input validation, privacy, authentication, owner-only mutations, password-change token invalidation, duplicate/racing registrations, rate limits, cascading deletes, and the new migration's rollback. No external database is required for tests.


## Project API

Project reads are public. Creation requires a Bearer token; updates and deletion require the project owner.

| Method | Endpoint | Result |
| --- | --- | --- |
| POST | `/api/projects` | 201 with `{ project }` and a Location header |
| GET | `/api/projects?limit=20&offset=0` | `{ projects, pagination: { limit, offset } }`, ordered by ascending ID; maximum limit 100 |
| GET | `/api/projects/:id` | `{ project }` |
| PATCH | `/api/projects/:id` | Partial update returning `{ project }` |
| DELETE | `/api/projects/:id` | 204 without a body |

Create accepts required `title` (trimmed, nonempty, at most 150 characters) and `description` (trimmed, nonempty), plus optional `project_url` and `is_seeking_collaborators`. URLs must use HTTP(S), contain no credentials, and fit within 512 characters; null clears the URL. The collaborator flag must be boolean and defaults to false; omitted URLs default to null. The existing 1 MB JSON body limit applies. Ownership comes from the token; IDs, ownership, timestamps, and other unsupported input fields are rejected.

PATCH requires at least one supported field, preserves omitted fields, and refreshes `updated_at`. Responses contain the project record including ownership and timestamps. Validation errors return 400, invalid/missing authentication 401, another owner's project 403, and missing projects 404. Project mutations share a limit of 60 requests per IP per 15 minutes.

```sh
curl -i -X POST http://localhost:5000/api/projects \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"title":"My first project","description":"A creative experiment"}'

curl -X PATCH http://localhost:5000/api/projects/1 \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"is_seeking_collaborators":true,"project_url":"https://example.com"}'
```

Use the ID returned by creation in place of `1`. Deleting a project cascades to its media, tag/skill assignments, likes, saves, comments (including replies), and project-linked collaboration requests. Shared tag/skill catalog entries and unrelated projects remain. Media management, tag/skill assignment, and uploads are separate features.


## Comment API

Comments and replies are publicly readable. Creation requires a Bearer token; only a comment's author can edit or delete it. Project ownership does not grant comment moderation permissions.

All routes use `/api/projects/:projectId/comments` as their base path:

| Method | Suffix | Result |
| --- | --- | --- |
| POST | `/` | 201 with `{ comment }` and a Location header |
| GET | `/?limit=20&offset=0` | `{ comments, pagination: { limit, offset } }` |
| GET | `/:commentId` | `{ comment }` |
| PATCH | `/:commentId` | Content update returning `{ comment }` |
| DELETE | `/:commentId` | 204 without a body |

Create accepts required `content` and optional `parent_comment_id`. Content is trimmed and must be nonempty text; the 1 MB JSON request limit applies. Omitted or null parents create top-level comments. A parent must be a positive integer ID of an existing comment in the same project. Nested replies are supported. PATCH accepts only `content`, updates `updated_at`, and preserves `created_at`. IDs, ownership, project assignment, parent changes, timestamps, and other unsupported fields are rejected as input.

Responses include `id`, `user_id`, `project_id`, `parent_comment_id`, `content`, `created_at`, and `updated_at`. Lists include all comments and replies as a flat array ordered by ascending ID; clients can reconstruct threads using parent IDs. Pagination defaults to limit 20 and offset 0; maximum limit is 100.

Invalid inputs or cross-project parents return 400, missing/invalid authentication 401, another author's mutation 403, and missing projects/comments/parents 404. A comment requested through another project's URL returns 404. Comment mutations share a limit of 60 requests per IP per 15 minutes; reads are not subject to this mutation limiter.

```sh
curl -i -X POST http://localhost:5000/api/projects/1/comments \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"content":"Great project!"}'

curl -X POST http://localhost:5000/api/projects/1/comments \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"content":"Thank you!","parent_comment_id":1}'

curl -X PATCH http://localhost:5000/api/projects/1/comments/1 \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"content":"Updated comment"}'
```

Replace example project/comment IDs with actual IDs. Deleting a comment permanently deletes all descendant replies, including replies written by other users. Deleting a project removes its comments; deleting an account removes its authored comments and their descendant replies. Unrelated comments remain. No schema migration is required for this API.

## React frontend

The client is based on Charlie (`cschicch`)'s `client/` implementation from
`d7cab9b50d6be693e6da352d156f5deb20232795` on `charlie-sprint2`, merged into main
by PR #90 (`e85722f`). Authentication, comments, and integration tests extend that
merged client; Charlie's original authorship remains in the upstream history.

Run `npm run client:install`, then start the backend with `npm run dev` and the
client with `npm run client:dev` in separate terminals. Visit http://localhost:5173.
Use Node.js 22.12 or later for the frontend tooling.
Copy `client/.env.example` to `client/.env` to override `API_PROXY_TARGET` when the
API runs somewhere other than http://127.0.0.1:5000. Browser requests always use
relative `/api` paths. Never put database credentials or JWT secrets in client files.

Authentication supports registration, login, logout, and session restoration via
`/api/users/me`. Tokens live in session storage (per browser tab), expire according
to the backend, and are removed when the API rejects authenticated requests.
Protected navigation returns to the intended page after login.

Commands: `npm run client:typecheck`, `npm run client:test`, and
`npm run client:build`. Existing root commands continue to run the backend.

Project browsing includes pagination, loading/error/empty states, and retry.
Only project owners see edit/delete controls, and editing another user's project
is blocked. Forms follow backend title and URL limits and retain input after
recoverable errors. Deletion confirmation explains its cascading effects.

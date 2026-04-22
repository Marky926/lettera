# Deployment

How to run Lettera locally, in Docker, and in production.

## Prerequisites

- Node 20.12+
- pnpm 10+
- Docker Desktop (for Postgres / API container)

## Local development

The fastest path:

```bash
pnpm install
pnpm build
docker compose up -d           # postgres :5432, adminer :8080, api :4000
pnpm --filter ./apps/web dev   # web on http://localhost:3000
```

The Postgres data is persisted in the `lettera-pgdata` volume.

If you want the API outside Docker (better for breakpoints):

```bash
docker compose up -d postgres
pnpm --filter @lettera/api exec prisma migrate deploy
pnpm --filter ./apps/api dev
pnpm --filter ./apps/web dev
```

## Environment variables

Copy [.env.example](../.env.example) to `.env` (root, for compose) and
to `apps/api/.env` (for standalone API). Web app uses
`apps/web/.env.local`.

| Var | Where | Required | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | API | yes | `development` / `production` / `test` |
| `HOST` | API | no | Default `0.0.0.0` |
| `PORT` | API | no | Default `4000` |
| `LOG_LEVEL` | API | no | Default `info` |
| `WEB_ORIGIN` | API | yes | Comma-separated allow-list for CORS + CSRF guard |
| `JWT_SECRET` | API | yes | Min 16 chars; rotate in production |
| `JWT_EXPIRES_IN` | API | no | Default `7d` |
| `COOKIE_SECRET` | API | yes | Min 16 chars |
| `BCRYPT_COST` | API | no | 10–15, default 13 |
| `RATE_LIMIT_GLOBAL` | API | no | Per-IP req/min, default 300 |
| `RATE_LIMIT_AUTH` | API | no | Per-IP req/min on `/auth/*`, default 10 |
| `DATABASE_URL` | API | yes | Postgres connection string |
| `NEXT_PUBLIC_API_URL` | Web | yes | Public API base URL |

## Database migrations

Migrations live in `apps/api/prisma/migrations`. To apply them:

```bash
pnpm --filter @lettera/api exec prisma migrate deploy
```

To create a new migration after editing `schema.prisma`:

```bash
pnpm --filter @lettera/api exec prisma migrate dev --name <slug>
```

## Production build

```bash
pnpm install --frozen-lockfile
pnpm build
```

Then run each app with its production script:

```bash
pnpm --filter @lettera/api start
pnpm --filter @lettera/web start
```

## Docker production image (sketch)

The repo ships `apps/api/Dockerfile.dev` for local use only. For
production, build a multi-stage image that runs `prisma migrate deploy`
on container start and uses `node --enable-source-maps`. Example
`Dockerfile` outline:

```dockerfile
FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/*/package.json packages/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @lettera/api exec prisma generate
RUN pnpm --filter ./apps/api... build

FROM node:20-alpine AS run
WORKDIR /app
COPY --from=build /app /app
USER node
ENV NODE_ENV=production
CMD ["node", "apps/api/dist/server.js"]
```

## Hardening checklist for production

- [ ] Rotate `JWT_SECRET` and `COOKIE_SECRET` to 32+ random chars.
- [ ] Set `NODE_ENV=production` (enables `cookie.secure`).
- [ ] Pin `WEB_ORIGIN` to exact production hostnames — no wildcards.
- [ ] Front the API with TLS termination (nginx, Caddy, ALB).
- [ ] Connect to Postgres over TLS (`?sslmode=require`).
- [ ] Lower `RATE_LIMIT_*` if abuse is observed.
- [ ] Enable structured log shipping (pino → Loki / Datadog).
- [ ] Back up Postgres daily; test restores quarterly.

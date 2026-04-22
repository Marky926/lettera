# Lettera API

Fastify + Prisma + PostgreSQL.

## Quick start

```bash
# 1. Start Postgres (from repo root)
docker compose up -d postgres

# 2. Configure
cp apps/api/.env.example apps/api/.env

# 3. Install + generate client + migrate
pnpm install
pnpm --filter @lettera/api db:generate
pnpm --filter @lettera/api db:migrate

# 4. Run
pnpm --filter @lettera/api dev
```

## Auth model

Sessions live in an httpOnly cookie (`lettera_session`) signed by `JWT_SECRET`.
The web app calls `/auth/me` to hydrate the session on every page that needs it.

## Endpoints

| Method | Path | Notes |
| ------ | ---- | ----- |
| POST   | /auth/register                                   | + creates a default workspace |
| POST   | /auth/login                                      | sets cookie |
| POST   | /auth/logout                                     | clears cookie |
| GET    | /auth/me                                         | requires auth |
| GET    | /workspaces                                      | list workspaces user belongs to |
| POST   | /workspaces                                      | create new workspace |
| GET    | /workspaces/:id/projects                         | |
| POST   | /workspaces/:id/projects                         | |
| GET    | /projects/:id/documents                          | |
| POST   | /projects/:id/documents                          | creates blank EmailDocument |
| GET    | /documents/:id                                   | full doc + content |
| PATCH  | /documents/:id                                   | autosave (throttled snapshots) |
| GET    | /documents/:id/versions                          | history list |
| POST   | /documents/:id/versions                          | manual snapshot |
| POST   | /documents/:id/versions/:vid/restore             | restore old snapshot |
| POST   | /documents/:id/render                            | server-side HTML+text render |

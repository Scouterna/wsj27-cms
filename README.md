# wsj27-cms

CMS for WSJ27 (World Scout Jamboree 2027, Swedish contingent), built on
[Payload 3](https://payloadcms.com) + Next.js. Forked from
[Scouterna/j26-cms](https://github.com/Scouterna/j26-cms) and adapted to the
WSJ27 platform.

It manages informational pages (with search) and media. Content is localized
(sv/en). The digital-signage content types j26 had (screens, playlists,
slides) are removed — WSJ27 will not have them.

## How it fits the WSJ27 platform

- Served at **`https://campfire.wsj27.scouterna.net/_services/cms`** — the same
  host as the other WSJ27 apps, because the SSO session lives in host-scoped
  cookies. The `/_services/cms` base path is baked into the Docker image at
  build time (`NEXT_BASE_PATH` build-arg).
- **Login is SSO-only**, against the shared
  [wsj27-auth-api](https://github.com/Scouterna/wsj27-auth-api): the CMS
  verifies the `wsj27-auth_access-token` cookie against the auth service's
  JWKS (discovered via `AUTH_DISCOVERY_URL`) and provisions a local mirror
  user just-in-time. There is no email/password form.
- **Access requires a CMS role in the token**: `wsj27-cms:admin` or
  `wsj27-cms:editor` from wsj27-project-api's role map — and CMT membership
  (any `wsj27:cmt…` project role) counts as editor without a dedicated grant.
  Everyone else is treated as logged out. Admin (user management) always
  requires an explicit `wsj27-cms:admin`.
- The Kubernetes manifests live in [k8s/](k8s/) in this repo, same pattern as
  the other WSJ27 services. The database is a dedicated role + database on the
  in-cluster Postgres.

## Local development

```bash
cp .env.example .env         # defaults match docker-compose.yml
docker compose up -d         # postgres on host port 5436
pnpm install
pnpm dev                     # http://localhost:3005
```

In development the postgres adapter runs in push mode, so schema changes apply
to the dev database automatically. Note that logging in locally requires a
valid wsj27-auth cookie, which is set on the campfire host — API endpoints and
public pages work without one.

## Tests

```bash
pnpm test:int   # vitest, needs the dev database
pnpm test:e2e   # playwright (admin tests are skipped pending SSO cookie injection)
```

## Migrations

Production runs migrations at boot (`prodMigrations` in
`src/payload.config.ts`). The chain is a single squashed `init` migration
until the first production deploy — see CLAUDE.md. After changing collections:

```bash
pnpm payload migrate:create <name>
pnpm generate:types
```

Both the migration files and `src/payload-types.ts` are committed.

## Importing the handbook

[scripts/import-handbook.ts](scripts/import-handbook.ts) turns an HTML export
of the leader handbook (pandoc, command in the script header) into chapters
and pages: H1s become chapters, H2s become one published page each, slugs are
derived like the collection hook derives them, and re-runs upsert by slug —
an edited Word export can be imported again without duplicating anything.

```bash
NODE_ENV=production DATABASE_URL=... PAYLOAD_SECRET=... \
  pnpm exec tsx scripts/import-handbook.ts handboken.html [--dry-run]
```

`NODE_ENV=production` is load-bearing: it keeps the postgres adapter off dev
push mode, so the script can never alter the schema it writes into.

## Building and deploying

Every push builds `ghcr.io/scouterna/wsj27-cms` via
[.github/workflows/build-image.yml](.github/workflows/build-image.yml), tagged
with the git SHA (and `latest` on main). The GHCR package must be public —
the cluster pulls without credentials.

Deploying is applying the manifests in [k8s/](k8s/) with the new SHA tag — see
[k8s/README.md](k8s/README.md). Always deploy a SHA tag, never `latest`.

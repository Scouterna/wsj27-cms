# wsj27-cms

CMS for WSJ27 (World Scout Jamboree 2027, Swedish contingent), built on
[Payload 3](https://payloadcms.com) + Next.js. Forked from
[Scouterna/j26-cms](https://github.com/Scouterna/j26-cms) and adapted to the
WSJ27 platform.

This file is orientation, setup and deploy. [CLAUDE.md](CLAUDE.md) records the
constraints that are not obvious from the code, and [k8s/README.md](k8s/README.md)
the one-time cluster setup.

## What it holds

| Name in the admin | Collection slug | What it is                                                         |
| ----------------- | --------------- | ------------------------------------------------------------------ |
| Handbok           | `info-page`     | One page of the leader handbook, or a standalone info page         |
| Handbok kapitel   | `info-chapter`  | Groups pages and carries the navigation order                      |
| Media             | `media`         | Uploads, resized to webp at 480/768/1080 px                        |
| Users             | `users`         | A just-in-time mirror of wsj27-auth's claims, not an account store |

**The admin labels and the collection slugs differ on purpose.** Editors see
Handbok; the API paths, the database tables and `src/payload-types.ts` keep
`info-page` and `info-chapter`. A slug is a schema identity — renaming one is a
migration and invalidates every stored reference — so the display name is what
follows the content's name, and the slug stays put.

Pages are indexed by `@payloadcms/plugin-search` into a `search` collection.
Every locale is flattened into one non-localized `searchText` field; see
[src/search/beforeSync.ts](src/search/beforeSync.ts) for why a localized index
would silently miss content.

`sv` and `en` are both configured as content locales, but the handbook is
written in Swedish only — the import script and `/handbok` both pass
`locale: 'sv'` explicitly rather than relying on the default.

The digital-signage content types j26 had (screens, playlists, slides) are
removed — WSJ27 will not have them.

## Routes

Paths are relative to the base path, which is `/_services/cms` in production
and empty by default locally.

| Path                   | What it serves                                        |
| ---------------------- | ----------------------------------------------------- |
| `/admin`               | The Payload admin panel                               |
| `/api`, `/api/graphql` | Payload's REST and GraphQL APIs                       |
| `/api/app-config`      | The WSJ27 app shell's navigation entry                |
| `/handbok`             | The whole handbook as one public page                 |
| `/`, `/my-route`       | Unchanged leftovers from the Payload starter template |

`/api/app-config` returns 401 to anyone without a CMS role, and that is what
hides the tool from everyone who has no access — the app shell renders only
what it gets. `/handbok` is `force-dynamic`: it reads the database on every
request, because a stale static copy of an edited handbook is worse than a few
queries on a page with this little traffic.

**The handbook's public address is
`https://campfire.wsj27.scouterna.net/_services/handbok`** — a sibling of the
base path, not a child of it, and so the one address in this repo that the
table above cannot express. [src/middleware.ts](src/middleware.ts) rewrites
that single path onto `/_services/cms/handbok`; the file explains why neither
traefik nor `next.config` can do it instead. Two things follow:

- **`/_services/cms` has to stay routed** for the short URL to render at all.
  The page is served from the short path but its JS, CSS and fonts are
  base-path-prefixed, so they come from the long one.
- **The ingress needs both paths**, and [k8s/ingress.yaml](k8s/ingress.yaml)
  has them. Routing `/_services/handbok` without the middleware in the image is
  a 404, and shipping the middleware without the ingress path never gets a
  request.

## Telling readers what changed

Only `info-page` is versioned (`versions: { drafts: true }`), so it is the one
collection with drafts, a version history and a restore. Chapters, media and
users have none — an edit there overwrites, with no history and no undo. The
history records _what_ and _when_ but never _who_: Payload's version tables
carry no author column, and deleting a page deletes its versions with it. It is
not a recycle bin, and there is no database backup behind it.

On top of that, `/handbok` shows readers two things, and the split between them
is the whole design:

|                                               | Where it comes from                 | What it is for                                   |
| --------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| `Uppdaterad <datum>` under every page heading | `updatedAt`, automatic              | Answers "is what I read last time still current" |
| A `Senaste ändringarna` list at the top       | `changeNote`, written by the editor | Answers "what actually changed"                  |

**An editor who fixes a comma leaves the note alone**, and the page keeps its
place in the list with its old date, because `changeNoteAt` is stamped only
when the note itself changes ([src/fields/changeNote.ts](src/fields/changeNote.ts)).
Sorting the list by `updatedAt` instead would lift a months-old note to the top
and date it today — announcing a change that was never made. Emptying the note
removes the page from the list; the updated date stays.

The list needs no limit: a page holds one note at a time, so it can never be
longer than the handbook has pages, and editors prune it by clearing fields.
Only pages that belong to a chapter can appear, because a standalone page has
no anchor on `/handbok` to link to.

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
to the dev database automatically. Logging in locally requires a valid
wsj27-auth cookie, which is set on the campfire host — API endpoints, `/handbok`
and the other public pages work without one.

`NEXT_BASE_PATH` is empty by default locally, which puts everything at the root
and leaves the middleware inert. Set it to `/_services/cms` in `.env` to get
production's paths — that is the only way to exercise `/_services/handbok`
before deploying.

## Tests and checks

```bash
pnpm test:int   # vitest, tests/int — needs the dev database running
pnpm lint       # eslint
pnpm exec tsc --noEmit
```

**None of these run in CI.** The only workflow builds the image (and asserts
the lockfile, see CLAUDE.md), so whatever you do not run locally is not run at
all.

`pnpm test:e2e` is inherited from the starter template and does **not** pass as
it stands, which is why it is listed separately from the commands above:

- [tests/e2e/admin.e2e.spec.ts](tests/e2e/admin.e2e.spec.ts) is
  `describe.skip` — the admin panel has no email/password form any more, so
  these need a wsj27-auth session cookie injected before they can run.
- [tests/e2e/frontend.e2e.spec.ts](tests/e2e/frontend.e2e.spec.ts) still
  asserts the template's "Welcome to your new project." page, and Playwright's
  `webServer.url` waits on port 3000 while `pnpm dev` serves 3005. Repairing it
  means first deciding what the frontend should be asserted against; `/handbok`
  is the obvious candidate.

## Migrations

Production runs migrations at boot (`prodMigrations` in
`src/payload.config.ts`), so a deploy needs no separate migration step. The
chain starts at a squashed `init` and is **append-only** from there — a
production database exists, so old migrations are never edited and the chain is
never re-squashed. See CLAUDE.md. After changing collections:

```bash
pnpm payload migrate:create <name>
pnpm generate:types
```

Both the migration files and `src/payload-types.ts` are committed. Admin-only
changes — a `labels` block, a field `description` — touch no schema and need no
migration.

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
[.github/workflows/build-image.yml](.github/workflows/build-image.yml). The
per-commit tag is **`sha-<short sha>`**, not the bare sha — `docker/metadata-action`
prefixes it — plus `latest` on the default branch. The GHCR package must be
public; the cluster pulls without credentials.

Deploying is applying the manifests in [k8s/](k8s/) with the new tag — see
[k8s/README.md](k8s/README.md). Always deploy a `sha-` tag, never `latest`.

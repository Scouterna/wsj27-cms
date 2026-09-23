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
| `/handbok/utskrift`    | The same handbook, laid out to be printed             |
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
that prefix — the whole subtree, so the printable version comes with it — onto
`/_services/cms/handbok`; the file explains why neither traefik nor
`next.config` can do it instead. Three things follow:

- **`/_services/cms` has to stay routed** for the short URL to render at all.
  The page is served from the short path but its JS, CSS and fonts are
  base-path-prefixed, so they come from the long one.
- **The ingress needs both paths**, and [k8s/ingress.yaml](k8s/ingress.yaml)
  has them. Routing `/_services/handbok` without the middleware in the image is
  a 404, and shipping the middleware without the ingress path never gets a
  request.
- **The handbook's own links follow the address the reader used.** Both
  addresses answer, and `next/link` only knows the base-path one, so a
  hard-coded link would move a reader off the short URL on their first click.
  The middleware reports the prefix it matched in a request header
  (`src/handbok-prefix.ts`) and `handbookLinks()` builds from it.

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

## Reading the handbook

`/handbok` is one long document, so the two questions a reader has constantly —
where am I, and where is the bit about X — are answered in the same place: a
sidebar that is a permanent column on a wide screen and a drawer behind the
hamburger on a narrow one.

**Search reads the rendered DOM rather than an index sent with the page.** The
page already contains every word of the handbook, and Bilaga 1 alone is 48 000
characters, so shipping a second copy to search would roughly double a document
that is already long. Reading the DOM also cannot drift: what is searchable is
exactly what is on the page. The index is built on the first keystroke, from an
event handler — not on mount in an effect, which the React compiler rejects as
a cascading render, and not in a ref, which may not be read while rendering.

**The printer icon leads to `/handbok/utskrift`, a separate route.** The two
want different documents: the reading view is navigated and searched and leads
with what changed, while the printable one is read front to back and needs its
table of contents on paper, a page break per chapter, and none of the chrome.
Typography is shared through `handbok.css` so the printed handbook cannot drift
from the one on screen — only the furniture differs. The print stylesheet spells
out link URLs after their text, because paper has no hover and the handbook is
full of links.

Nothing prints itself on load. A page that opens the print dialog on arrival
gives the reader no chance to see what they are about to spend forty sheets of
paper on.

## How it fits the WSJ27 platform

- Served at **`https://campfire.wsj27.scouterna.net/_services/cms`** — the same
  host as the other WSJ27 apps, because the SSO session lives in host-scoped
  cookies. The `/_services/cms` base path is baked into the Docker image at
  build time (`NEXT_BASE_PATH` build-arg).
- **Login is SSO-only**, against the shared
  [wsj27-auth-api](https://github.com/Scouterna/wsj27-auth-api): the CMS
  verifies the `wsj27-auth_access-token` cookie against the auth service's
  JWKS (discovered via `AUTH_DISCOVERY_URL`) and provisions a local mirror
  user just-in-time. There is no email/password form. **A wrong
  `AUTH_DISCOVERY_URL` looks exactly like everyone being logged out**: the host
  answers 200 with the SPA's index.html for any unclaimed path, so the CMS
  parses HTML as JSON, throws, and treats every request as anonymous. Check the
  content type, not the status code.
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

**A chapter written without H2s is split on what it says about itself.** Bilaga
1 is 48 000 characters under a single H1: its sections are ordinary paragraphs,
numbered inconsistently (`1.` and `2.` with a period, `3` and `4` without), so
there is no heading to split on and no dependable number either. What it does
have is its own "Innehåll:" list, and a document's index is a better authority
than a guess about what a heading looks like — so the importer splits on the
paragraphs matching that list, ignoring any leading number.

Its longest section is split once more, on a **numbered series**: a run of
paragraphs labelled `<Word> 1`, `<Word> 2`, … that counts from one without a
gap or a repeat, at least three long. That turns the course day into a page per
pass. The test is strict for a reason — the same appendix writes
"Avdelningsförträff 1" twice and "Avdelningsförträff 2" once, as a comparison
rather than as sections, and 1, 1, 2 must not look like a series. A chapter
that uses H2s is left alone by both rules: it has already said where its pages
begin.

```bash
NODE_ENV=production DATABASE_URL=... PAYLOAD_SECRET=... \
  pnpm exec tsx scripts/import-handbook.ts handboken.html [--dry-run]
```

`NODE_ENV=production` is load-bearing: it keeps the postgres adapter off dev
push mode, so the script can never alter the schema it writes into.

The import writes content and nothing else. It **skips pages whose content,
title, order and chapter are all unchanged**, because `updatedAt` is
reader-facing on /handbok — an unconditional re-import would tell every reader
that all thirty pages changed today. It **never deletes**, and prints the pages
the CMS holds that the document no longer contains so a human can decide.

**Images become Media documents.** The converter renders each `<img>` as an
upload node carrying only the original path, which Payload rejects, so the
importer resolves them: the file is uploaded once, the node gets its document,
and anything it cannot use — a missing file, or the EMF cover Word embeds and
sharp cannot read — is dropped from the tree and named in the report rather
than left to fail the page. Word rarely carries alt text, so the report also
lists the images that were given a placeholder and need a human to describe
them in the admin; the Media document is created once, so an edited alt
survives re-imports.

**Uploads land wherever the script runs.** Payload writes the file to the
staticDir of the machine executing it, not to the pod's volume, so an import
run against production has to be followed by copying the files into
`/app/media` in the deployment — otherwise the rows point at pictures nobody
can fetch:

```bash
POD=$(kubectl get pod -l app=wsj27-cms -n wsj27 -o name | head -1)
for f in media/*; do
  kubectl exec -i -n wsj27 "$POD" -- sh -c "cat > /app/$f" < "$f"
done
```

What it deliberately does not do is decide what readers should be told. That is
[scripts/apply-handbook-edits.ts](scripts/apply-handbook-edits.ts), driven by a
file you read first:

```bash
NODE_ENV=production DATABASE_URL=... PAYLOAD_SECRET=... \
  pnpm exec tsx scripts/apply-handbook-edits.ts docs/edits.json [--dry-run]
```

```json
{
  "notes": { "packlista": "Såsskålen är struken." },
  "delete": ["gammal-sida"]
}
```

Nothing is written until every slug in the file has been found, because a typo
looks exactly like a renamed page and a half-applied run is worse than none.

The source documents live in `docs/`, which is gitignored — the handbook is
large, binary, and its content belongs in the CMS rather than in a public repo.

## Building and deploying

Every push builds `ghcr.io/scouterna/wsj27-cms` via
[.github/workflows/build-image.yml](.github/workflows/build-image.yml). The
per-commit tag is **`sha-<short sha>`**, not the bare sha — `docker/metadata-action`
prefixes it — plus `latest` on the default branch. The GHCR package must be
public; the cluster pulls without credentials.

Deploying is applying the manifests in [k8s/](k8s/) with the new tag — see
[k8s/README.md](k8s/README.md). Always deploy a `sha-` tag, never `latest`.

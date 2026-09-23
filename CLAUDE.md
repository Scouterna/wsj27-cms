# wsj27-cms

Payload 3 + Next.js CMS for WSJ27, forked from `Scouterna/j26-cms`. This file
records what is not obvious from the code; README.md covers setup and deploy.

This project uses the Payload CMS skill at `.claude/skills/payload/`.
Start with `.claude/skills/payload/SKILL.md` for a quick reference, then see
`.claude/skills/payload/reference/` for detailed docs.

## Documentation is part of the change

**Change behaviour, change the documentation in the same commit.** CLAUDE.md,
README.md and `k8s/README.md` say *why* the code looks the way it does, and a
description that has stopped being true is worse than none at all: it reads as
true, so it is believed, and it sends the next person the wrong way.

This is not hypothetical, and the examples are all from this repository:

- Two of the four commits after the initial import built `/handbok`, and the
  README never mentioned the page existed.
- The README listed `pnpm test:e2e` among the commands you run, while its one
  unskipped test asserts the starter template's welcome page on a port the dev
  server does not serve.
- `k8s/README.md` told you to deploy `$IMG:<git-sha>`. CI pushes `sha-<short
  sha>`, so following the instruction literally gives `ImagePullBackOff` —
  during the one activity where you least want to debug the documentation.

Three habits that keep it true:

- **Never duplicate a value that can change.** Describe the shape and point at
  the source. Every copy is a second truth, and the copy always loses. If a
  copy is unavoidable, write in both places that the other one exists.
- **Grep for what you just made false.** Renamed a label, a path, a flag, a
  rule — `grep -rn "<the old thing>" --include=*.md .` before committing. It
  takes seconds, and it is the only thing that catches a sentence three files
  away.
- **Leave the reason, not just the result.** The lines in this file are written
  to say which mistake they exist to prevent. If you replace one, replace it
  with something that explains as much.

## Constraints worth knowing before changing things

- **Auth is SSO-only** (`src/collections/Users.ts`): the local users table is a
  just-in-time mirror of wsj27-auth's token claims. Do not re-enable the local
  strategy casually — the schema has no password columns, so that change needs
  a migration.
- **The CMS must share a host with wsj27-auth.** The session cookie
  (`wsj27-auth_access-token`) is host-scoped, which is why production serves
  the CMS under a base path on the campfire host instead of its own subdomain.
- **`NEXT_BASE_PATH` is baked at image build time** (Next.js basePath). The
  production image is built with `/_services/cms`; changing the serving path
  means rebuilding the image, not just editing the ingress.
- **Never give `src/middleware.ts` a `config.matcher`.** It exists to serve the
  handbook at `/_services/handbok`, which is *outside* basePath, and a matcher
  is basePath-relative — Next prefixes it, so any matcher written there names a
  path under `/_services/cms` and the middleware stops running for the one path
  it exists for. The failure is a plain 404 with nothing in the logs; it was
  measured, not reasoned about. The `if` in the file is the gate instead, and
  the cost is a string compare per request. The same paragraph explains why the
  rewrite cannot live in traefik (no rights to create a `Middleware` CRD) or in
  `next.config` (Next refuses an internal destination under `basePath: false`).
  It rewrites the whole `/_services/handbok` prefix rather than one path, so
  the printable version comes with it, and reports the prefix it matched in a
  request header so the handbook's own links stay on the address the reader
  used. That constant lives in `src/handbok-prefix.ts` as its own module: the
  middleware is a separate bundle, so importing it from a page would drag
  `getPayload` into the middleware and importing it the other way would drag
  the middleware into every page.
- **The access token lives five minutes, and nothing refreshes it by itself.**
  `ACCESS_TOKEN_TTL_SECONDS` is 300 in wsj27-auth-api. The service ships a
  browser loop at `<auth>/static/refresh.js` that reads the public
  `wsj27-auth_expires-at` cookie and calls `/refresh` a minute before expiry,
  and its README tells consumer apps to embed it. The CMS did not, so an editor
  was signed out after five minutes of writing, with nothing to explain it —
  the strategy just finds an expired token and reports no user. It is embedded
  now as an admin *provider* (`src/components/SessionRefresh.tsx`), not in
  `src/app/(payload)/layout.tsx`, which Payload generates and may rewrite.
- **Migrations run at boot in production** (`prodMigrations`). Dev uses push
  mode, so a schema change can work locally while missing its migration —
  always `pnpm payload migrate:create` after changing collections.
- **The chain starts at a squashed `init` migration, and is append-only from
  there.** j26's fourteen-migration history (including the screen tables WSJ27
  will never have) was replaced by one migration of the final schema, which was
  safe to re-squash while nothing had deployed. **That window is closed**: the
  CMS serves production at campfire, `prodMigrations` runs at boot, so a
  production database exists and holds `init` as applied. Never edit an
  existing migration, and never re-squash — append.
  `20260922_232632_add_change_note` is the first appended one and is what a new
  migration should look like: additive `ALTER TABLE ... ADD COLUMN`, with a
  `down` that drops exactly those columns.
- **A page whose text passes 40 000 characters used to vanish on save.**
  `searchText` flattens every locale of a page into one field, and Payload
  validates text fields against `defaultMaxTextLength` (40 000). The search
  plugin syncs from the page's own `afterChange`, so the rejected `search`
  document rolled back the transaction that wrote the page: `payload.create`
  returned a document with an id, the plugin logged "Error syncing search
  document", and the page was simply not there. An import reported success and
  silently lost the handbook's Bilaga 1, which flattens to 48 207 characters.
  `SEARCH_TEXT_MAX` in `src/search/beforeSync.ts` raises the limit and
  truncates at it, and `payload.config.ts` states the same number on the field.
  Keep the two together, and do not assume a returned document means a written
  row.
- **An imported picture renders only at `depth: 1` or deeper.** The default
  upload converter starts with `if (typeof uploadNode.value !== 'object')
  return null`, so a page read at depth 0 drops its images silently — not a
  broken image, no image at all, and nothing in any log. `loadHandbook` reads
  at depth 1 for that reason alone.
- **Media uploads are written by whichever machine runs the import**, to its own
  staticDir. The deployment mounts a ReadWriteOnce PVC at `/app/media`, so a
  local import against the production database creates rows whose files are on
  the laptop. Copy them in afterwards (README has the loop), or the pictures
  404 for everyone. This is the same constraint that keeps `replicas: 1` — it
  goes away when media moves to blob storage.
- **Check the statement order of generated migrations that drop tables.** The
  generator has emitted `DROP TABLE ... CASCADE` before the `DROP CONSTRAINT`
  statements for FKs referencing that table — the cascade takes the constraint
  first and the explicit drop then fails. Seen with payload 3.83; reorder by
  hand (references first, tables last) and verify against a fresh database.
- **`.npmrc` is gitignored and machine-local**, same convention as the sibling
  WSJ27 repos: on networks where registry.npmjs.org is blocked it points at a
  reachable internal mirror, and that hostname must never be committed.
- **`pnpm add`/`remove` behind the mirror poisons pnpm-lock.yaml.** A plain
  `pnpm install --frozen-lockfile` leaves the lockfile alone, but any mutating
  command records the mirror as an explicit `tarball:` URL on every resolution
  — which both leaks the hostname and breaks GitHub runners (they cannot
  resolve it). Strip those fields before committing; entries resolved from
  npmjs never need one:

  ```bash
  sed -i -E 's@, tarball: https?://[^}]*@@' pnpm-lock.yaml
  ```

  CI asserts the property (no `tarball:` URL off registry.npmjs.org) before
  building, so a poisoned lockfile fails fast instead of as `ENOTFOUND` on a
  random package mid-install.
- Deployment manifests live in `k8s/` and are applied by hand — CI only builds
  the image. See `k8s/README.md` for the one-time setup and the deploy ritual.
- **CI runs no lint, no type check and no tests** — the only workflow asserts
  the lockfile and builds the image. There is no gate between a broken commit
  and a pushed image, so `pnpm lint`, `pnpm exec tsc --noEmit` and
  `pnpm test:int` are yours to run before committing. Do not read a green
  checkmark as more than "the image built".

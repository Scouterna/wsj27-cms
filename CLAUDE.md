# wsj27-cms

Payload 3 + Next.js CMS for WSJ27, forked from `Scouterna/j26-cms`. This file
records what is not obvious from the code; README.md covers setup and deploy.

This project uses the Payload CMS skill at `.claude/skills/payload/`.
Start with `.claude/skills/payload/SKILL.md` for a quick reference, then see
`.claude/skills/payload/reference/` for detailed docs.

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
- **Migrations run at boot in production** (`prodMigrations`). Dev uses push
  mode, so a schema change can work locally while missing its migration —
  always `pnpm payload migrate:create` after changing collections.
- **The chain is a single squashed `init` migration.** Nothing has deployed
  yet, so j26's fourteen-migration history (including the screen tables WSJ27
  will never have) was replaced by one migration of the final schema. Until
  the first production deploy it is fine to keep it that way: delete the
  migration, wipe the dev database, `pnpm payload migrate:create init`. From
  the moment a production database exists, that stops — append migrations
  only, and never edit old ones.
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

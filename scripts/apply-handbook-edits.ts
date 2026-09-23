/**
 * Applies the editorial decisions that follow a handbook import: the
 * reader-facing change notes, and the pages that should go.
 *
 * The import writes content; it never writes `changeNote` and never deletes.
 * Both are judgements about what readers should be told and what has stopped
 * being true, and neither can be derived from the Word document — so they live
 * in a file you read before running, not in the importer.
 *
 *   NODE_ENV=production DATABASE_URL=... PAYLOAD_SECRET=... \
 *     pnpm exec tsx scripts/apply-handbook-edits.ts docs/edits.json [--dry-run]
 *
 * The file:
 *
 *   {
 *     "notes":  { "<page slug>": "One sentence to the readers." },
 *     "delete": ["<page slug>"]
 *   }
 *
 * An empty note string clears the note, which is how a page leaves "Senaste
 * ändringarna" without losing its updated date.
 *
 * Nothing is written until every slug in the file has been found. A typo in a
 * slug is otherwise indistinguishable from a page that was renamed, and the
 * run would half-apply before anyone noticed.
 */
import { getPayload } from 'payload'
import { readFileSync } from 'fs'
import config from '../src/payload.config'

interface Edits {
  notes?: Record<string, string>
  delete?: string[]
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const path = args.find((a) => !a.startsWith('--'))
  if (!path) {
    console.error('usage: tsx scripts/apply-handbook-edits.ts <edits.json> [--dry-run]')
    process.exit(2)
  }

  const edits = JSON.parse(readFileSync(path, 'utf8')) as Edits
  const notes = Object.entries(edits.notes ?? {})
  const doomed = edits.delete ?? []

  const payload = await getPayload({ config: await config })

  const find = async (slug: string) =>
    (
      await payload.find({
        collection: 'info-page',
        where: { slug: { equals: slug } },
        limit: 1,
        locale: 'sv',
        depth: 0,
        draft: false,
      })
    ).docs[0]

  const ids = new Map<string, number>()
  const missing: string[] = []
  for (const slug of [...notes.map(([s]) => s), ...doomed]) {
    const doc = await find(slug)
    if (doc) ids.set(slug, doc.id)
    else missing.push(slug)
  }
  if (missing.length > 0) {
    console.error(`unknown page slug(s): ${missing.join(', ')} — nothing written`)
    process.exit(1)
  }

  console.log(`${notes.length} note(s), ${doomed.length} deletion(s)${dryRun ? '  [dry run]' : ''}`)
  for (const [slug, note] of notes) {
    console.log(`  note   ${slug}: ${note === '' ? '(cleared)' : note}`)
  }
  for (const slug of doomed) {
    console.log(`  DELETE ${slug}`)
  }
  if (dryRun) return

  for (const [slug, note] of notes) {
    await payload.update({
      collection: 'info-page',
      id: ids.get(slug)!,
      data: { changeNote: note, _status: 'published' },
      locale: 'sv',
      draft: false,
    })
  }
  for (const slug of doomed) {
    await payload.delete({ collection: 'info-page', id: ids.get(slug)! })
  }

  console.log(`done: ${notes.length} note(s) written, ${doomed.length} page(s) deleted`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

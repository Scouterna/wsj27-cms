/**
 * One-off import of the leader handbook into info-pages.
 *
 * Input is an HTML export of the Word document:
 *
 *   docker run --rm -i pandoc/core:latest -f docx -t html --wrap=none - \
 *     < "Handboken V.0.docx" > handboken.html
 *
 * Run with tsx (payload run swallows stdout), against the database the CMS
 * uses. NODE_ENV=production on purpose: it keeps the postgres adapter off
 * dev push mode, so the script can never alter the schema — pending
 * migrations run, nothing else.
 *
 *   NODE_ENV=production DATABASE_URL=... PAYLOAD_SECRET=... \
 *     pnpm exec tsx scripts/import-handbook.ts handboken.html [--dry-run]
 *
 * Structure mapping: H1s become chapters, H2s become one info-page each
 * (H3/H4 stay as headings inside the page), content between an H1 and its
 * first H2 becomes a page named after the chapter. Everything before the
 * first named H1 — the cover and Word's rendered table of contents — is
 * dropped; navigation is the frontend's job, built from chapter + order.
 *
 * Idempotent: chapters and pages are upserted by slug, so a re-run after an
 * edited export updates content in place. Slugs are derived exactly like the
 * collection hook would; a title that repeats across chapters ("Praktiska
 * tips/Hälsa" exists in both Resa and Lägret) gets the chapter slug as
 * prefix, deterministically, so re-runs find their own pages again.
 */
import { getPayload } from 'payload'
import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'fs'

import config from '../src/payload.config'
import { editorFeatures } from '../src/lib/editorFeatures'
import { slugify } from '../src/fields/slug'

/**
 * Sections the document carries but the CMS must not: the handbook keeps its
 * own hand-written change log, and /handbok renders one from `changeNote`.
 * Importing both would put two answers to the same question on one page, and
 * the hand-written one goes stale the moment an editor fixes something without
 * touching Word. Slugs, because that is what an upsert matches on.
 *
 * Deleting these pages is not enough on its own — they are still in the
 * document, so the next import would create them again.
 */
const SKIP_SLUGS = new Set(['andringslogg', 'tidigare-andringslogg'])

/**
 * Canonical JSON for comparing two lexical trees: object keys in a fixed
 * order, and node `id`s dropped.
 *
 * Both are needed, and both were measured rather than guessed. Payload stores
 * lexical with its own key order, so a plain `JSON.stringify` reported all 28
 * pages as changed when they were identical — same length, first difference at
 * index 10, `type` before `children` instead of after. With keys sorted, 7
 * pages still differed: every one of them contains a link, and
 * `convertHTMLToLexical` mints a fresh ObjectId for each link node on every
 * run. That id says nothing about the content.
 */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>)
            .filter(([k]) => k !== 'id')
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : val,
  )

interface Section {
  chapterIndex: number
  title: string
  html: string
  order: number
}

interface Chapter {
  name: string
  slug: string
  order: number
}

/** "VÄLKOMMEN!" -> "Välkommen", "LÄGRET ..." -> "Lägret". */
function chapterName(raw: string): string {
  const trimmed = raw.trim().replace(/[\s.!…]+$/u, '')
  if (trimmed && trimmed === trimmed.toLocaleUpperCase('sv')) {
    return trimmed[0] + trimmed.slice(1).toLocaleLowerCase('sv')
  }
  return trimmed
}

function parseHandbook(html: string): {
  chapters: Chapter[]
  sections: Section[]
  droppedImages: number
} {
  const dom = new JSDOM(html)
  const chapters: Chapter[] = []
  const sections: Section[] = []
  let current: Section | null = null
  let droppedImages = 0

  for (const el of Array.from(dom.window.document.body.children)) {
    const tag = el.tagName.toLowerCase()

    if (tag === 'h1') {
      const name = chapterName(el.textContent ?? '')
      current = null
      // Empty H1s are Word artifacts (page-break carriers); skip, and keep
      // "no current chapter" so stray content under them is dropped too.
      if (name) {
        chapters.push({ name, slug: slugify(name), order: chapters.length * 10 })
      }
      continue
    }

    if (chapters.length === 0) continue // cover page + rendered TOC

    if (tag === 'h2') {
      const title = (el.textContent ?? '').trim()
      if (!title) continue
      current = {
        chapterIndex: chapters.length - 1,
        title,
        html: '',
        order: sections.filter((s) => s.chapterIndex === chapters.length - 1).length * 10,
      }
      sections.push(current)
      continue
    }

    if (!current) {
      // Chapter preamble: content between the H1 and its first H2 becomes a
      // page named after the chapter itself.
      const chapter = chapters[chapters.length - 1]
      current = { chapterIndex: chapters.length - 1, title: chapter.name, html: '', order: 0 }
      sections.push(current)
    }
    // Word's images arrive as `<img src="media/image4.png">` — a reference to a
    // file pandoc only writes with --extract-media, and nothing here uploads to
    // the Media collection. Left in, the converter builds an `upload` node that
    // points at no document, and Payload rejects the whole page: "upload node
    // failed to validate: This field is not a valid upload ID". Dropping them
    // is a real loss, so the count is reported rather than swallowed.
    for (const img of Array.from(el.querySelectorAll('img'))) {
      droppedImages++
      img.remove()
    }
    current.html += el.outerHTML
  }

  return { chapters, sections: sections.filter((s) => s.html.trim() !== ''), droppedImages }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const htmlPath = args.find((a) => !a.startsWith('--'))
  if (!htmlPath) {
    console.error('usage: tsx scripts/import-handbook.ts <handbook.html> [--dry-run]')
    process.exit(2)
  }

  const { chapters, sections, droppedImages } = parseHandbook(readFileSync(htmlPath, 'utf8'))
  if (droppedImages > 0) {
    console.log(`note: ${droppedImages} image(s) dropped — see parseHandbook`)
  }

  // Deterministic page slugs, chapter-prefixed on collision.
  const seen = new Set<string>()
  const pageSlugs = sections.map((s) => {
    let slug = slugify(s.title)
    if (seen.has(slug)) slug = `${chapters[s.chapterIndex].slug}-${slug}`
    seen.add(slug)
    return slug
  })

  console.log(`${chapters.length} chapters, ${sections.length} pages:`)
  for (const [i, s] of sections.entries()) {
    console.log(
      `  [${chapters[s.chapterIndex].slug}] ${String(s.order).padStart(3)}  ${pageSlugs[i]}`,
    )
  }
  if (dryRun) return

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const editorConfig = await editorConfigFactory.fromFeatures({
    config: payloadConfig,
    features: editorFeatures,
  })

  const chapterIds: number[] = []
  for (const c of chapters) {
    const existing = await payload.find({
      collection: 'info-chapter',
      where: { slug: { equals: c.slug } },
      limit: 1,
    })
    const data = { name: c.name, slug: c.slug, order: c.order }
    const doc = existing.docs[0]
      ? await payload.update({
          collection: 'info-chapter',
          id: existing.docs[0].id,
          data,
          locale: 'sv',
        })
      : await payload.create({ collection: 'info-chapter', data, locale: 'sv' })
    chapterIds.push(doc.id)
  }

  let created = 0
  let updated = 0
  let unchanged = 0
  let skipped = 0
  for (const [i, s] of sections.entries()) {
    if (SKIP_SLUGS.has(pageSlugs[i])) {
      skipped++
      continue
    }
    const content = convertHTMLToLexical({ editorConfig, html: s.html, JSDOM })
    const data = {
      title: s.title,
      slug: pageSlugs[i],
      chapter: chapterIds[s.chapterIndex],
      order: s.order,
      audience: 'ledare' as const,
      content,
      _status: 'published' as const,
    }
    const existing = await payload.find({
      collection: 'info-page',
      where: { slug: { equals: pageSlugs[i] } },
      limit: 1,
      locale: 'sv',
      depth: 0,
      draft: false,
    })
    if (existing.docs[0]) {
      const doc = existing.docs[0]
      // Write only what actually differs. An unconditional update moves
      // `updatedAt` on every page, and that date is reader-facing on /handbok —
      // a re-import would tell every reader that all thirty pages changed
      // today. It would also burn a version per page against the 100-per-
      // document cap, pushing real edits out of the history.
      const same =
        doc.title === data.title &&
        doc.slug === data.slug &&
        doc.order === data.order &&
        doc.audience === data.audience &&
        doc._status === 'published' &&
        doc.chapter === data.chapter &&
        stable(doc.content) === stable(data.content)
      if (same) {
        unchanged++
        continue
      }
      await payload.update({
        collection: 'info-page',
        id: doc.id,
        data,
        locale: 'sv',
        draft: false,
      })
      updated++
    } else {
      await payload.create({ collection: 'info-page', data, locale: 'sv', draft: false })
      created++
    }
  }

  // Pages the CMS holds that this document no longer contains. The import
  // never deletes — a slug can vanish because a heading was renamed, and
  // deleting on that guess would take a page's version history with it. But
  // left unsaid they linger on /handbok stating things the handbook has
  // stopped saying, so they are named here and removed by a human who checked.
  const orphans = (
    await payload.find({ collection: 'info-page', limit: 500, depth: 0, pagination: false })
  ).docs
    .map((d) => d.slug)
    .filter((slug) => !pageSlugs.includes(slug))
  if (orphans.length > 0) {
    console.log(`orphans (in the CMS, not in this document): ${orphans.join(', ')}`)
  }

  console.log(
    `done: ${chapters.length} chapters upserted, ${created} pages created, ` +
      `${updated} updated, ${unchanged} unchanged, ${skipped} skipped`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

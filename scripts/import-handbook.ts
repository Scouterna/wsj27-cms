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

function parseHandbook(html: string): { chapters: Chapter[]; sections: Section[] } {
  const dom = new JSDOM(html)
  const chapters: Chapter[] = []
  const sections: Section[] = []
  let current: Section | null = null

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
    current.html += el.outerHTML
  }

  return { chapters, sections: sections.filter((s) => s.html.trim() !== '') }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const htmlPath = args.find((a) => !a.startsWith('--'))
  if (!htmlPath) {
    console.error('usage: tsx scripts/import-handbook.ts <handbook.html> [--dry-run]')
    process.exit(2)
  }

  const { chapters, sections } = parseHandbook(readFileSync(htmlPath, 'utf8'))

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
  for (const [i, s] of sections.entries()) {
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
    })
    if (existing.docs[0]) {
      await payload.update({
        collection: 'info-page',
        id: existing.docs[0].id,
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

  console.log(
    `done: ${chapters.length} chapters upserted, ${created} pages created, ${updated} updated`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

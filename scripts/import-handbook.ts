/**
 * One-off import of the leader handbook into info-pages.
 *
 * Input is an HTML export of the Word document, with the images beside it:
 *
 *   docker run --rm -i pandoc/core:latest -f docx -t html --wrap=none \
 *     < "Handboken V 1.1.docx" > docs/handboken.html
 *
 *   # A .docx is a zip, and pandoc names its <img> srcs after the entries in
 *   # word/media — so unzipping them into media/ beside the HTML is all the
 *   # linking the importer needs, and avoids --extract-media, which cannot
 *   # write back through a container's stdin.
 *   python3 -c "import zipfile,pathlib;z=zipfile.ZipFile('Handboken V 1.1.docx');\
 *     d=pathlib.Path('docs/media');d.mkdir(parents=True,exist_ok=True);\
 *     [ (d/pathlib.Path(n).name).write_bytes(z.read(n)) for n in z.namelist() \
 *       if n.startswith('word/media/') ]"
 *
 * Do not end the pandoc command with a `-`: it reads stdin by default, and the
 * explicit argument makes it read nothing and write an empty file, exit 0.
 *
 * **Uploads land wherever this runs.** Images become Media documents, and
 * Payload writes the files to the staticDir of the machine executing the
 * script — not to the pod's volume. Running this against production therefore
 * needs the files copied into the deployment's /app/media afterwards, or the
 * rows point at pictures nobody can fetch.
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
import { getPayload, type Payload } from 'payload'
import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import { JSDOM } from 'jsdom'
import { existsSync, readFileSync } from 'fs'
import { basename, dirname, extname, resolve as resolvePath } from 'path'

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

/**
 * What Payload can store and a browser can show. Word also embeds EMF and WMF —
 * the cover of this handbook is an 8 MB EMF — and sharp cannot read either, so
 * an upload would fail at resize time rather than at validation.
 */
const WEB_IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])

interface ImageReport {
  attached: number
  skipped: string[]
  placeholderAlt: string[]
}

/**
 * Turns the converter's dangling upload nodes into real ones.
 *
 * `convertHTMLToLexical` renders an `<img>` as `{ type: 'upload', pending: {
 * src } }` — the original path and nothing else. Payload rejects that node, and
 * because the search plugin syncs from the page's own afterChange, the rejection
 * rolls back the whole page. So each one is resolved here: the file is uploaded
 * to the Media collection once, and the node gets the `value` and `relationTo`
 * it needs. An image that cannot be used is dropped from the tree and named in
 * the report, never left to fail the page.
 */
async function attachUploads(
  content: unknown,
  htmlDir: string,
  alts: Map<string, string>,
  payload: Payload,
  cache: Map<string, number | string>,
  report: ImageReport,
): Promise<void> {
  const resolveMedia = async (src: string): Promise<number | string | undefined> => {
    if (cache.has(src)) return cache.get(src)

    const file = resolvePath(htmlDir, src)
    if (!WEB_IMAGE.has(extname(file).toLowerCase()) || !existsSync(file)) return undefined

    const filename = basename(file)
    const found = await payload.find({
      collection: 'media',
      where: { filename: { equals: filename } },
      limit: 1,
    })

    let id = found.docs[0]?.id
    if (id == null) {
      const alt = alts.get(src)
      if (!alt) report.placeholderAlt.push(filename)
      const doc = await payload.create({
        collection: 'media',
        locale: 'sv',
        // Required, and Word rarely carries one. A placeholder gets the image
        // in; the report says which need a human to describe them, and the
        // Media document is created once so an edited alt survives re-imports.
        data: { alt: alt || `Bild ur handboken (${filename})` },
        filePath: file,
      })
      id = doc.id
    }

    cache.set(src, id)
    return id
  }

  const walk = async (node: Record<string, unknown>): Promise<void> => {
    const children = node.children as Record<string, unknown>[] | undefined
    if (!Array.isArray(children)) return

    const kept: Record<string, unknown>[] = []
    for (const child of children) {
      if (child.type === 'upload') {
        const src = (child.pending as { src?: string } | undefined)?.src
        const id = src ? await resolveMedia(src) : undefined
        if (id == null) {
          report.skipped.push(src ?? '(utan src)')
          continue
        }
        delete child.pending
        child.relationTo = 'media'
        child.value = id
        report.attached++
      } else {
        await walk(child)
      }
      kept.push(child)
    }
    node.children = kept
  }

  await walk((content as { root: Record<string, unknown> }).root)
}

interface Section {
  chapterIndex: number
  title: string
  elements: Element[]
}

/** A section once its elements have been serialised and ordered. */
interface PageSection {
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

const normalise = (value: string) => value.replace(/\s+/g, ' ').trim()

/**
 * "1. Samlingar", "4 Samlingar" and "Samlingar" all reduce to the same key.
 *
 * The numbering in Word is not dependable — Bilaga 1 writes its first two
 * sections with a period after the number and its last two without — so the
 * number is stripped before comparing rather than parsed.
 */
const sectionKey = (value: string) =>
  normalise(value)
    .replace(/^\d+\s*[.)]?\s*/, '')
    .toLocaleLowerCase('sv')

/**
 * A chapter's own contents list, when it has one: the `<ol>`/`<ul>` right after
 * a paragraph that says "Innehåll".
 *
 * This is what lets a chapter written without H2s still become more than one
 * page. Bilaga 1 is 48 000 characters and marks its four sections as ordinary
 * paragraphs, so there is nothing structural to split on — but the appendix
 * lists those four sections itself, and a document's own index is a better
 * authority than a guess about what a heading looks like.
 */
function findContentsList(elements: Element[]): { at: number; titles: string[] } | null {
  for (let i = 0; i < elements.length - 1; i++) {
    const el = elements[i]
    if (el.tagName.toLowerCase() !== 'p') continue
    if (!/^inneh[åa]ll/i.test(normalise(el.textContent ?? ''))) continue

    const list = elements[i + 1]
    const tag = list?.tagName.toLowerCase()
    if (tag !== 'ol' && tag !== 'ul') continue

    const titles = Array.from(list.querySelectorAll('li'))
      .map((li) => normalise(li.textContent ?? ''))
      .filter(Boolean)
    if (titles.length > 1) return { at: i, titles }
  }
  return null
}

/**
 * A run of paragraphs labelled "<Word> 1", "<Word> 2", … inside one section.
 *
 * Bilaga 1's longest section is a course day written as eight passes, each
 * introduced by an ordinary paragraph — no heading, no bold, and sometimes a
 * `<br>` inside the title. Left whole it is a single page of 35 000 characters
 * that nobody can navigate, so the series is what splits it.
 *
 * The rule is deliberately narrow: the numbers must run 1, 2, 3 … without a
 * gap or a repeat, and there must be at least three. The same document also
 * says "Avdelningsförträff 1" twice and "Avdelningsförträff 2" once, in a
 * comparison rather than as sections — 1, 1, 2 fails the test, which is the
 * whole reason the test is shaped this way.
 */
function findSeries(elements: Element[]): Map<number, string> | null {
  const byLabel = new Map<string, { index: number; num: number; title: string }[]>()

  elements.forEach((el, index) => {
    if (el.tagName.toLowerCase() !== 'p') return
    const text = normalise(el.textContent ?? '')
    if (text.length > 90) return

    const match = /^(\p{L}[\p{L}-]{2,})\s+(\d+)\s*[–—-]?\s*(.*)$/u.exec(text)
    if (!match) return

    const [, label, digits, rest] = match
    const hits = byLabel.get(label) ?? []
    // Rebuilt rather than taken as written: a `<br>` in the middle leaves the
    // dash glued to the number ("Kurspass 2– Att åka …").
    hits.push({
      index,
      num: Number(digits),
      title: rest ? `${label} ${Number(digits)} – ${rest}` : `${label} ${Number(digits)}`,
    })
    byLabel.set(label, hits)
  })

  for (const hits of byLabel.values()) {
    if (hits.length < 3) continue
    if (!hits.every((hit, n) => hit.num === n + 1)) continue
    return new Map(hits.map((hit) => [hit.index, hit.title]))
  }

  return null
}

function parseHandbook(html: string): {
  chapters: Chapter[]
  sections: PageSection[]
  /** `<img src>` to its alt text, for the Media documents the images become. */
  imageAlts: Map<string, string>
} {
  const dom = new JSDOM(html)
  const chapters: Chapter[] = []
  const perChapter: Element[][] = []
  const imageAlts = new Map<string, string>()

  // Pass one: everything under each H1. Splitting needs to see a whole chapter
  // at once, because a chapter without H2s is split on a list that appears
  // inside it.
  for (const el of Array.from(dom.window.document.body.children)) {
    if (el.tagName.toLowerCase() === 'h1') {
      const name = chapterName(el.textContent ?? '')
      // Empty H1s are Word artifacts (page-break carriers); skip, and keep
      // "no current chapter" so stray content under them is dropped too.
      if (name) {
        chapters.push({ name, slug: slugify(name), order: chapters.length * 10 })
        perChapter.push([])
      }
      continue
    }
    if (chapters.length === 0) continue // cover page + rendered TOC

    // Word's images arrive as `<img src="media/image4.png">`, a path relative to
    // the HTML file that pandoc writes with --extract-media. The converter turns
    // each one into an `upload` node carrying that src but no document, which
    // Payload rejects outright — "upload node failed to validate: This field is
    // not a valid upload ID" — so `attachUploads` resolves them after the
    // conversion. The alt text has to be collected here, because the upload node
    // does not carry it.
    for (const img of Array.from(el.querySelectorAll('img'))) {
      const src = img.getAttribute('src')
      if (src) imageAlts.set(src, (img.getAttribute('alt') ?? '').trim())
    }

    perChapter[perChapter.length - 1].push(el)
  }

  // Pass two: each chapter into sections.
  const sections: Section[] = []
  for (const [chapterIndex, elements] of perChapter.entries()) {
    const chapter = chapters[chapterIndex]
    const hasHeadings = elements.some((el) => el.tagName.toLowerCase() === 'h2')
    const contents = hasHeadings ? null : findContentsList(elements)
    const wanted = new Map(contents?.titles.map((t) => [sectionKey(t), t]) ?? [])

    let current: Section | null = null
    const open = (title: string) => {
      current = { chapterIndex, title, elements: [] }
      sections.push(current)
    }

    for (const [i, el] of elements.entries()) {
      const tag = el.tagName.toLowerCase()

      if (tag === 'h2') {
        const title = normalise(el.textContent ?? '')
        if (title) open(title)
        continue
      }

      if (wanted.size > 0) {
        // The index itself is navigation, and the site builds its own from the
        // pages below — the same reason Word's document-level TOC is dropped.
        if (contents && (i === contents.at || i === contents.at + 1)) continue

        if (tag === 'p') {
          const title = wanted.get(sectionKey(el.textContent ?? ''))
          if (title) {
            open(title)
            continue
          }
        }
      }

      if (!current) {
        // Chapter preamble: content before the first section becomes a page
        // named after the chapter itself.
        open(chapter.name)
      }
      current!.elements.push(el)
    }
  }

  // Pass three: a section that is really a numbered series becomes one page per
  // item. Only sections split by a contents list are considered — a chapter
  // written with proper H2s already says where its pages begin, and second
  // -guessing that would turn a well-structured document into a worse one.
  const split: Section[] = []
  for (const section of sections) {
    const series = perChapter[section.chapterIndex].some((el) => el.tagName.toLowerCase() === 'h2')
      ? null
      : findSeries(section.elements)

    if (!series) {
      split.push(section)
      continue
    }

    let part: Section = { ...section, elements: [] }
    split.push(part)
    section.elements.forEach((el, i) => {
      const title = series.get(i)
      if (title) {
        part = { chapterIndex: section.chapterIndex, title, elements: [] }
        split.push(part)
        return
      }
      part.elements.push(el)
    })
  }

  return {
    chapters,
    sections: split
      .map((s) => ({ ...s, html: s.elements.map((el) => el.outerHTML).join('') }))
      .filter((s) => s.html.trim() !== '')
      .map((s, _i, all) => ({
        ...s,
        order: all.filter((o) => o.chapterIndex === s.chapterIndex).indexOf(s) * 10,
      })),
    imageAlts,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const htmlPath = args.find((a) => !a.startsWith('--'))
  if (!htmlPath) {
    console.error('usage: tsx scripts/import-handbook.ts <handbook.html> [--dry-run]')
    process.exit(2)
  }

  const { chapters, sections, imageAlts } = parseHandbook(readFileSync(htmlPath, 'utf8'))

  // Deterministic page slugs, chapter-prefixed on collision.
  const seen = new Set<string>()
  const pageSlugs = sections.map((s) => {
    let slug = slugify(s.title)
    if (seen.has(slug)) slug = `${chapters[s.chapterIndex].slug}-${slug}`
    seen.add(slug)
    return slug
  })

  // A chapter is only worth creating if something lands in it. "Övrigt" holds
  // nothing but the hand-written change log in this document, and that is on
  // SKIP_SLUGS — so importing the chapter anyway left an empty heading that
  // renders nowhere (the site drops chapters with no pages) while still filling
  // a row in the admin and a line in every page's chapter picker.
  const usedChapters = new Set(
    sections.filter((_, i) => !SKIP_SLUGS.has(pageSlugs[i])).map((s) => s.chapterIndex),
  )
  const emptyChapters = chapters.filter((_, i) => !usedChapters.has(i))

  console.log(`${usedChapters.size} chapters, ${sections.length} pages:`)
  for (const [i, s] of sections.entries()) {
    console.log(
      `  [${chapters[s.chapterIndex].slug}] ${String(s.order).padStart(3)}  ${pageSlugs[i]}`,
    )
  }
  if (emptyChapters.length > 0) {
    console.log(
      `chapters skipped (no pages of their own): ${emptyChapters.map((c) => c.slug).join(', ')}`,
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
  for (const [chapterIndex, c] of chapters.entries()) {
    if (!usedChapters.has(chapterIndex)) {
      // Nothing references it, so the id is never read.
      chapterIds.push(-1)
      continue
    }
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
  const htmlDir = dirname(resolvePath(htmlPath))
  const mediaCache = new Map<string, number | string>()
  const images: ImageReport = { attached: 0, skipped: [], placeholderAlt: [] }

  for (const [i, s] of sections.entries()) {
    if (SKIP_SLUGS.has(pageSlugs[i])) {
      skipped++
      continue
    }
    const content = convertHTMLToLexical({ editorConfig, html: s.html, JSDOM })
    await attachUploads(content, htmlDir, imageAlts, payload, mediaCache, images)
    const data = {
      title: s.title,
      slug: pageSlugs[i],
      chapter: chapterIds[s.chapterIndex],
      order: s.order,
      audience: 'publik' as const,
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

  if (images.attached > 0) console.log(`images: ${images.attached} attached`)
  if (images.skipped.length > 0) {
    console.log(
      `images skipped (missing file or a format sharp cannot read): ${images.skipped.join(', ')}`,
    )
  }
  if (images.placeholderAlt.length > 0) {
    console.log(`images needing alt text written in the admin: ${images.placeholderAlt.join(', ')}`)
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

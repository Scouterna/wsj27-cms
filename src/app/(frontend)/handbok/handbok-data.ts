import { getPayload } from 'payload'
import { headers } from 'next/headers'

import config from '@/payload.config'
import { HANDBOK_PREFIX_HEADER } from '@/handbok-prefix'
import type { InfoChapter, InfoPage } from '@/payload-types'

export interface HandbookChapter {
  id: number
  slug: string
  name: string
  pages: InfoPage[]
}

/** The notes written on one day, in the order the pages appear in the handbook. */
export interface ChangeDay {
  /** Sortable day key, also the `datetime` attribute. */
  key: string
  /** The same day written out for a reader. */
  label: string
  pages: InfoPage[]
}

export interface Handbook {
  chapters: HandbookChapter[]
  /** Reader-facing notes grouped by the day they were written, newest first. */
  changes: ChangeDay[]
}

/**
 * The handbook as both views need it. Two routes render this content — the
 * screen version and the printable one — and a second copy of the query would
 * be a second answer to "what is in the handbook": the day one gains a filter
 * the other silently keeps showing what the first has stopped showing.
 */
export async function loadHandbook(): Promise<Handbook> {
  const payload = await getPayload({ config: await config })

  const [chapters, pages] = await Promise.all([
    payload.find({ collection: 'info-chapter', sort: 'order', limit: 100, locale: 'sv' }),
    payload.find({
      collection: 'info-page',
      draft: false,
      // The public handbook shows the pages written for it. `campfire` pages
      // reach their readers through the Campfire app instead, and leaving them
      // out here is the whole point of the field.
      //
      // It is not a secret: /api/info-page is open, so a campfire page is still
      // served to anyone who asks for it by slug. This keeps it off the public
      // handbook, nothing more.
      where: { audience: { equals: 'publik' } },
      sort: 'order',
      limit: 500,
      // Deep enough to populate the images. The default upload converter
      // renders nothing at all when `value` is a bare id — `typeof value !==
      // 'object'` returns null — so at depth 0 an imported picture is silently
      // absent from the page rather than broken on it.
      depth: 1,
      locale: 'sv',
    }),
  ])

  const byChapter = new Map<number, InfoPage[]>()
  for (const page of pages.docs) {
    const chapterId = typeof page.chapter === 'object' ? page.chapter?.id : page.chapter
    if (chapterId == null) continue // standalone pages are not part of the handbook
    byChapter.set(chapterId, [...(byChapter.get(chapterId) ?? []), page])
  }

  const grouped = chapters.docs.map((chapter: InfoChapter) => ({
    id: chapter.id,
    slug: chapter.slug,
    name: chapter.name,
    pages: byChapter.get(chapter.id) ?? [],
  }))

  // Only pages that are rendered can be announced: a note on a standalone page
  // would link to an anchor no view writes. Sorted by when the note was
  // written, which is deliberately not when the page was last saved — see
  // src/fields/changeNote.ts.
  //
  // The list needs no limit. A page holds one note at a time, so it can never
  // be longer than the handbook has pages, and an entry leaves it when an
  // editor clears the field.
  const announced = pages.docs.filter((page) => {
    const chapterId = typeof page.chapter === 'object' ? page.chapter?.id : page.chapter
    return chapterId != null && byChapter.has(chapterId) && page.changeNote?.trim()
  })

  const withPages = grouped.filter((c) => c.pages.length > 0)

  // Where each page sits in the handbook, so the notes for one day can be read
  // in the order the reader will meet them.
  const position = new Map<number, number>()
  for (const chapter of withPages) {
    for (const page of chapter.pages) position.set(page.id, position.size)
  }

  // Grouped by day, because an import writes every note it carries within the
  // same second: ungrouped, the same date is repeated once per entry down the
  // left of the list, and the timestamps are then too close together to order
  // anything meaningfully. The day is the unit a reader thinks in anyway.
  const dayKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const byDay = new Map<string, InfoPage[]>()
  for (const page of announced) {
    const key = page.changeNoteAt ? dayKey.format(new Date(page.changeNoteAt)) : ''
    byDay.set(key, [...(byDay.get(key) ?? []), page])
  }

  const changes = Array.from(byDay.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, group]) => ({
      key,
      label: formatDate(group[0].changeNoteAt) ?? key,
      pages: [...group].sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0)),
    }))

  return { chapters: withPages, changes }
}

/**
 * Dates are rendered in the contingent's timezone, not the server's: a page
 * published at 23:30 Swedish time is a UTC tomorrow, and a handbook that says
 * a change landed the day after it did is the kind of small wrongness readers
 * notice and remember.
 */
export const formatDate = (value?: string | null): string | null =>
  value
    ? new Intl.DateTimeFormat('sv-SE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Stockholm',
      }).format(new Date(value))
    : null

/**
 * The profile's fonts are commercial (TeeFranklin, Suomi Type Foundry, is the
 * face behind the guide's "Lieberath Grotesque") so the files are not in this
 * public repository — they are served from a configmap mounted at
 * public/fonts/ (see k8s/). Without the mount these URLs 404 and the CSS
 * fallback stacks apply. Built here rather than in a stylesheet because the
 * URLs need the runtime base path, which CSS url() never gets prefixed with.
 *
 * Bravely Script ships as a single Regular cut but is declared at 700: the
 * headings ask for bold, and an exact match stops the browser from smearing
 * synthetic bold over a script face — while the fallback stack still renders
 * genuinely bold.
 */
export const fontFaces = (basePath: string) =>
  [
    { family: 'Bravely Script', weight: 700, file: 'BravelyScript-Regular' },
    { family: 'Lieberath Grotesque', weight: 400, file: 'TeeFranklin-Book' },
    { family: 'Lieberath Grotesque', weight: 700, file: 'TeeFranklin-Bold' },
  ]
    .map(
      ({ family, weight, file }) => `@font-face {
  font-family: '${family}';
  font-weight: ${weight};
  font-display: swap;
  src: url('${basePath}/fonts/${file}.woff2') format('woff2');
}`,
    )
    .join('\n')

/**
 * The contingent logotype, the same mark the Word handbook carries on its
 * cover. It sits in public/, so it has the fonts' problem and is solved the
 * same way: Next prefixes the base path onto its own routes but not onto a
 * plain `src`, and the handbook is read under two prefixes, so a hard-coded
 * path is a picture that loads on one address and 404s on the other.
 */
export const logoSrc = (basePath: string) => `${basePath}/wsj27-swedish-contingent.png`

/** What the mark says, for a reader who cannot see it. */
export const LOGO_ALT = 'Swedish Contingent — 26th World Scout Jamboree Poland 2027'

/**
 * The handbook's own links, built for the address the reader actually used.
 *
 * The handbook answers on two paths — /_services/handbok and the base path's
 * own /handbok — and `next/link` only knows about the second. Hard-coding it
 * would move a reader off the short address on their first click, so the
 * middleware reports which one came in and the links follow it. Plain `<a>`,
 * because these are complete paths and must not be prefixed a second time.
 */
export async function handbookLinks(): Promise<{ root: string; print: string }> {
  const prefix = (await headers()).get(HANDBOK_PREFIX_HEADER)
  const root = prefix ?? `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/handbok`
  return { root, print: `${root}/utskrift` }
}

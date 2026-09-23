import { getPayload } from 'payload'
import React from 'react'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

import config from '@/payload.config'
import './handbok.css'

// Always render fresh from the database: the handbook is edited in the admin
// panel, and a stale static copy is worse than a few extra queries on a page
// with this little traffic.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Handboken – WSJ27',
  description: 'Hela ledarhandboken för WSJ27, som en sida.',
}

// The profile's fonts are commercial (TeeFranklin, Suomi Type Foundry, is the
// face behind the guide's "Lieberath Grotesque") so the files are not in this
// public repository — they are served from a configmap mounted at
// public/fonts/ (see k8s/). Without the mount these URLs 404 and the CSS
// fallback stacks apply. Declared here rather than in the stylesheet because
// the URLs need the runtime base path, which CSS url() never gets prefixed
// with.
//
// Bravely Script ships as a single Regular cut but is declared at 700: the
// headings ask for bold, and an exact match stops the browser from smearing
// synthetic bold over a script face — while the fallback stack still renders
// genuinely bold.
const fontFaces = (basePath: string) =>
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

// Dates are rendered in the contingent's timezone, not the server's: a page
// published at 23:30 Swedish time is a UTC tomorrow, and a handbook that says
// a change landed the day after it did is the kind of small wrongness readers
// notice and remember.
const formatDate = (value?: string | null): string | null =>
  value
    ? new Intl.DateTimeFormat('sv-SE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Stockholm',
      }).format(new Date(value))
    : null

export default async function HandbokPage() {
  const payload = await getPayload({ config: await config })

  const [chapters, pages] = await Promise.all([
    payload.find({ collection: 'info-chapter', sort: 'order', limit: 100, locale: 'sv' }),
    payload.find({
      collection: 'info-page',
      draft: false,
      sort: 'order',
      limit: 500,
      depth: 0,
      locale: 'sv',
    }),
  ])

  const byChapter = new Map<number, typeof pages.docs>()
  for (const page of pages.docs) {
    const chapterId = typeof page.chapter === 'object' ? page.chapter?.id : page.chapter
    if (chapterId == null) continue // standalone pages are not part of the handbook
    byChapter.set(chapterId, [...(byChapter.get(chapterId) ?? []), page])
  }

  // Only pages that are rendered below can be announced: a note on a
  // standalone page would link to an anchor this page never writes. Sorted by
  // when the note was written, which is deliberately not when the page was
  // last saved — see src/fields/changeNote.ts.
  //
  // The list needs no limit. A page holds one note at a time, so it can never
  // be longer than the handbook has pages, and an entry leaves it when an
  // editor clears the field.
  const announced = pages.docs
    .filter((page) => {
      const chapterId = typeof page.chapter === 'object' ? page.chapter?.id : page.chapter
      return chapterId != null && byChapter.has(chapterId) && page.changeNote?.trim()
    })
    .sort((a, b) => (b.changeNoteAt ?? '').localeCompare(a.changeNoteAt ?? ''))

  return (
    <div className="handbok">
      <style>{fontFaces(process.env.NEXT_PUBLIC_BASE_PATH || '')}</style>
      <div className="handbok-inner">
        <header>
          <p className="kicker">WSJ27</p>
          <h1>Handboken</h1>
        </header>

        {announced.length > 0 && (
          <section aria-labelledby="senaste-andringarna" className="changelog">
            <h2 id="senaste-andringarna">Senaste ändringarna</h2>
            <ol>
              {announced.map((page) => (
                <li key={page.id}>
                  <p className="changelog-meta">
                    {page.changeNoteAt && (
                      <time dateTime={page.changeNoteAt}>{formatDate(page.changeNoteAt)}</time>
                    )}
                    <a href={`#${page.slug}`}>{page.title}</a>
                  </p>
                  <p className="changelog-note">{page.changeNote}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        <nav aria-label="Innehåll" className="toc">
          {chapters.docs.map((chapter) => (
            <div key={chapter.id} className="toc-chapter">
              <a href={`#${chapter.slug}`}>{chapter.name}</a>
              <ul>
                {(byChapter.get(chapter.id) ?? []).map((page) => (
                  <li key={page.id}>
                    <a href={`#${page.slug}`}>{page.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {chapters.docs.map((chapter) => (
          // The heading levels mirror the content: imported pages carry h3/h4
          // inside their rich text, so chapters are h1 and page titles h2.
          <section key={chapter.id} id={chapter.slug} className="chapter">
            <h1>{chapter.name}</h1>
            {(byChapter.get(chapter.id) ?? []).map((page) => (
              <article key={page.id} id={page.slug}>
                <h2>{page.title}</h2>
                {page.updatedAt && (
                  <p className="updated">
                    Uppdaterad <time dateTime={page.updatedAt}>{formatDate(page.updatedAt)}</time>
                  </p>
                )}
                <RichText data={page.content as SerializedEditorState} />
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

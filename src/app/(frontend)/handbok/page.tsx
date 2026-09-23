import React from 'react'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

import {
  fontFaces,
  formatDate,
  handbookLinks,
  loadHandbook,
  LOGO_ALT,
  logoSrc,
} from './handbok-data'
import { HandbokNav } from './HandbokNav'
import './handbok.css'

// Always render fresh from the database: the handbook is edited in the admin
// panel, and a stale static copy is worse than a few extra queries on a page
// with this little traffic.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Handboken – WSJ27',
  description: 'Hela ledarhandboken för WSJ27, som en sida.',
}

const CONTENT_ID = 'handbok-content'

export default async function HandbokPage() {
  const { chapters, changes } = await loadHandbook()
  const links = await handbookLinks()

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

  return (
    <div className="handbok">
      <style>{fontFaces(basePath)}</style>

      <a className="handbok-skip" href={`#${CONTENT_ID}`}>
        Hoppa till innehållet
      </a>

      <HandbokNav
        contentId={CONTENT_ID}
        printHref={links.print}
        chapters={chapters.map((chapter) => ({
          slug: chapter.slug,
          name: chapter.name,
          pages: chapter.pages.map((page) => ({ slug: page.slug, title: page.title })),
        }))}
      />

      <main className="handbok-main" id={CONTENT_ID}>
        <div className="handbok-inner">
          <header>
            {/* eslint-disable-next-line @next/next/no-img-element -- a fixed
                brand asset at its final size; next/image would only add a
                round trip through the optimizer, which localPatterns does not
                allow for public/ anyway. */}
            <img
              className="handbok-logo"
              src={logoSrc(basePath)}
              alt={LOGO_ALT}
              width={880}
              height={699}
            />
            <p className="kicker">WSJ27</p>
            <h1>Handboken</h1>
          </header>

          {changes.length > 0 && (
            <section aria-labelledby="senaste-andringarna" className="changelog">
              <h2 id="senaste-andringarna">Senaste ändringarna</h2>
              {changes.map((day) => (
                <div key={day.key} className="changelog-day">
                  <h3>
                    <time dateTime={day.key}>{day.label}</time>
                  </h3>
                  <ul>
                    {day.pages.map((page) => (
                      <li key={page.id}>
                        <a href={`#${page.slug}`}>{page.title}</a>
                        {' — '}
                        <span className="changelog-note">{page.changeNote}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {chapters.map((chapter) => (
            // The heading levels mirror the content: imported pages carry h3/h4
            // inside their rich text, so chapters are h1 and page titles h2.
            <section key={chapter.id} id={chapter.slug} className="chapter">
              <h1>{chapter.name}</h1>
              {chapter.pages.map((page) => (
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
      </main>
    </div>
  )
}

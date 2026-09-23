import React from 'react'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

import { fontFaces, formatDate, handbookLinks, loadHandbook } from '../handbok-data'
import { PrintButton } from './PrintButton'
import '../handbok.css'
import './utskrift.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Handboken – utskrift – WSJ27',
  description: 'Hela ledarhandboken för WSJ27 i en utskrivbar version.',
}

/**
 * The printable handbook.
 *
 * A separate route rather than print styles on the reading view, because the
 * two want different documents: the screen version is navigated and searched,
 * so it leads with what changed and keeps the menu within reach, while this one
 * is read front to back and needs the table of contents on paper, a chapter per
 * page break, and nothing that only works with a cursor.
 *
 * Typography is shared (handbok.css) so the printed handbook cannot drift from
 * the one on screen — only the chrome and the page furniture differ.
 */
export default async function UtskriftPage() {
  const { chapters, changes } = await loadHandbook()
  const links = await handbookLinks()
  const printedAt = formatDate(new Date().toISOString())

  return (
    <div className="handbok">
      <style>{fontFaces(process.env.NEXT_PUBLIC_BASE_PATH || '')}</style>

      <div className="utskrift-toolbar">
        <a href={links.root}>← Tillbaka till handboken</a>
        <PrintButton />
      </div>

      <div className="handbok-inner">
        <header>
          <p className="kicker">WSJ27</p>
          <h1>Handboken</h1>
          <p className="utskrift-printed">Utskriven {printedAt}</p>
        </header>

        <nav aria-label="Innehåll" className="utskrift-toc">
          <h2>Innehåll</h2>
          {chapters.map((chapter) => (
            <div key={chapter.id}>
              <p className="utskrift-toc-chapter">{chapter.name}</p>
              <ul>
                {chapter.pages.map((page) => (
                  <li key={page.id}>{page.title}</li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {changes.length > 0 && (
          <section aria-labelledby="utskrift-andringar" className="utskrift-changes">
            <h2 id="utskrift-andringar">Senaste ändringarna</h2>
            {changes.map((day) => (
              <div key={day.key}>
                <h3>{day.label}</h3>
                <ul>
                  {day.pages.map((page) => (
                    <li key={page.id}>
                      <strong>{page.title}</strong> — {page.changeNote}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {chapters.map((chapter) => (
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
    </div>
  )
}

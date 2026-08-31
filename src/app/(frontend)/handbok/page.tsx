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

  return (
    <div className="handbok">
      <div className="handbok-inner">
        <header>
          <p className="kicker">WSJ27</p>
          <h1>Handboken</h1>
        </header>

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
                <RichText data={page.content as SerializedEditorState} />
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

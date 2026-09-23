'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { type ArticleIndex, fold, highlightMatches, indexArticles } from './handbok-search'

export interface NavPage {
  slug: string
  title: string
}

export interface NavChapter {
  slug: string
  name: string
  pages: NavPage[]
}

const IconMenu = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
    <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const IconClose = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
    <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const IconPrinter = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none">
    <path
      d="M7 9V4h10v5M7 19H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 15h10v5H7z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * Navigation, search and the print link for the on-screen handbook.
 *
 * **The search index is read out of the rendered DOM, not shipped as props.**
 * The page already contains every word of the handbook — Bilaga 1 alone is
 * 48 000 characters — so sending a second copy for searching would roughly
 * double a page that is already long. Reading the DOM also cannot drift: what
 * is searchable is exactly what is on the page.
 *
 * **A hit is marked where it stands, not just counted.** The list answers
 * which page holds the word, which on a page of 48 000 characters leaves the
 * reader to find it by eye; the marks answer where. Both read the same index,
 * so the page the list names is the page the marks appear on — see
 * `handbok-search.ts`.
 */
export function HandbokNav({
  chapters,
  contentId,
  printHref,
}: {
  chapters: NavChapter[]
  contentId: string
  printHref: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [index, setIndex] = useState<Map<string, ArticleIndex> | null>(null)

  // Built on the first keystroke, from an event handler. Not on mount in an
  // effect — that is a setState the React compiler rejects as a cascading
  // render — and not in a ref, which may not be read while rendering. Reading
  // the DOM during render is out too, since this component renders on the
  // server as well.
  const buildIndex = useCallback(() => {
    setIndex((existing) => existing ?? indexArticles(contentId))
  }, [contentId])

  // Which page is being read, so the nav says where you are in a document this
  // long. `rootMargin` pulls the trigger line near the top of the viewport;
  // without it every heading below the fold counts as visible at once.
  useEffect(() => {
    const articles = document.querySelectorAll<HTMLElement>(`#${contentId} article[id]`)
    if (articles.length === 0) return
    const seen = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting)
        const first = Array.from(articles).find((a) => seen.get(a.id))
        if (first) setActive(first.id)
      },
      { rootMargin: '-10% 0px -75% 0px', threshold: 0 },
    )
    articles.forEach((a) => observer.observe(a))
    return () => observer.disconnect()
  }, [contentId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    searchRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const needle = fold(query.trim())
  const filtered = useMemo(() => {
    if (!needle) return chapters
    return chapters
      .map((chapter) => ({
        ...chapter,
        pages: chapter.pages.filter(
          (page) =>
            fold(page.title).includes(needle) || index?.get(page.slug)?.text.includes(needle),
        ),
      }))
      .filter((chapter) => chapter.pages.length > 0 || fold(chapter.name).includes(needle))
  }, [chapters, index, needle])

  const hits = filtered.reduce((n, c) => n + c.pages.length, 0)

  // The marks follow the query, and are cleared with it. The index exists by
  // the time a query does: both are set from the same keystroke.
  useEffect(() => {
    highlightMatches(index, needle)
    return () => highlightMatches(null, '')
  }, [index, needle])

  const close = useCallback(() => setOpen(false), [])

  return (
    <>
      <div className="handbok-topbar">
        <button
          type="button"
          className="handbok-iconbutton handbok-burger"
          aria-expanded={open}
          aria-controls="handbok-nav"
          aria-label={open ? 'Stäng menyn' : 'Öppna menyn'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <IconClose /> : <IconMenu />}
        </button>
        <span className="handbok-topbar-title">Handboken</span>
        <a
          className="handbok-iconbutton"
          href={printHref}
          title="Utskrivbar version"
          aria-label="Utskrivbar version"
        >
          <IconPrinter />
        </a>
      </div>

      <div
        className={`handbok-backdrop${open ? ' is-open' : ''}`}
        onClick={close}
        aria-hidden="true"
      />

      <nav
        id="handbok-nav"
        aria-label="Innehåll"
        className={`handbok-sidebar${open ? ' is-open' : ''}`}
      >
        <div className="handbok-search">
          <label htmlFor="handbok-search-input">Sök i handboken</label>
          <input
            id="handbok-search-input"
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Sök…"
            autoComplete="off"
            onChange={(e) => {
              buildIndex()
              setQuery(e.target.value)
            }}
          />
          <p aria-live="polite" className="handbok-search-count">
            {needle ? `${hits} träff${hits === 1 ? '' : 'ar'}` : ''}
          </p>
        </div>

        <div className="handbok-navlist">
          {filtered.map((chapter) => (
            <div key={chapter.slug} className="handbok-navchapter">
              <a href={`#${chapter.slug}`} onClick={close}>
                {chapter.name}
              </a>
              <ul>
                {chapter.pages.map((page) => (
                  <li key={page.slug}>
                    <a
                      href={`#${page.slug}`}
                      onClick={close}
                      aria-current={active === page.slug ? 'location' : undefined}
                    >
                      {page.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {needle && hits === 0 && <p className="handbok-noresult">Inget matchar ”{query}”.</p>}
        </div>
      </nav>
    </>
  )
}

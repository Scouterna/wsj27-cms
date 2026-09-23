import { describe, it, expect, beforeEach } from 'vitest'

import {
  fold,
  highlightMatches,
  indexArticle,
  indexArticles,
  matchRanges,
} from '@/app/(frontend)/handbok/handbok-search'

/** One article, as the handbook renders it: a heading and rich text. */
const render = (html: string) => {
  document.body.innerHTML = `<main id="handbok-content">${html}</main>`
  return document.querySelector('article') as HTMLElement
}

const texts = (html: string, query: string) =>
  matchRanges(indexArticle(render(html)), fold(query), 50).map((r) => r.toString())

describe('handbok search index', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('indexes exactly the text the reader sees', () => {
    // The sidebar counts a page as a hit from this string and the marks are
    // placed from it. Two foldings would be two answers to one question.
    const article = render('<article id="a"><h2>Förberedelser</h2><p>Packa väskan.</p></article>')
    expect(indexArticle(article).text).toBe(fold(article.textContent ?? ''))
  })

  it('finds a word written with accents from one written without', () => {
    expect(texts('<article id="a"><p>Inför lägret</p></article>', 'infor')).toEqual(['Inför'])
  })

  it('marks a word that is split across formatting', () => {
    // Bold in the middle of a word is one match over two text nodes.
    expect(
      texts('<article id="a"><p>Förbe<strong>redelser</strong> nu</p></article>', 'förberedelser'),
    ).toEqual(['Förberedelser'])
  })

  it('keeps the mark on the word after a character that folds to two', () => {
    // "ﬁ" folds to "fi", so every offset after it moves by one. Read from the
    // folded string alone, this marks "eutrustning" — one character early.
    expect(texts('<article id="a"><p>ﬁskeutrustning för alla</p></article>', 'utrustning')).toEqual(
      ['utrustning'],
    )
  })

  it('finds every occurrence, and stops at the limit', () => {
    const article = indexArticle(render('<article id="a"><p>lager lager lager</p></article>'))
    expect(matchRanges(article, 'lager', 50)).toHaveLength(3)
    expect(matchRanges(article, 'lager', 2)).toHaveLength(2)
  })

  it('finds a match that ends the article', () => {
    expect(texts('<article id="a"><p>Packa väskan</p></article>', 'väskan')).toEqual(['väskan'])
  })

  it('keys the index by the id the navigation links to', () => {
    render('<article id="kap-1"><p>ett</p></article><article id="kap-2"><p>två</p></article>')
    expect([...indexArticles('handbok-content').keys()]).toEqual(['kap-1', 'kap-2'])
  })

  it('does nothing at all without the Highlight API', () => {
    // Older browsers get the filtered list and no marks, not a broken page.
    const index = indexArticles('handbok-content')
    expect(() => highlightMatches(index, 'lager')).not.toThrow()
    expect(() => highlightMatches(null, '')).not.toThrow()
  })
})

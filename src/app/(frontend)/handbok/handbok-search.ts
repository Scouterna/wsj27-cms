/**
 * The handbook's search index, read out of the rendered page, and where each
 * hit sits in it.
 *
 * **One folded string per article serves both readers of it** — the sidebar,
 * which decides whether a page is a hit, and the marks in the text, which say
 * where. Folding the text twice would be two answers to the same question, and
 * the way they drift is a reader told a page matches on a page that shows
 * nothing marked.
 */

/** The accents NFKD leaves behind as characters of their own. */
const COMBINING = /[̀-ͯ]/g

/** Fold Swedish letters so "forberedelser" finds "Förberedelser". */
export const fold = (value: string): string =>
  value.toLowerCase().normalize('NFKD').replace(COMBINING, '')

interface TextRun {
  node: Text
  /** Where this node's text begins and ends in the article's folded text. */
  start: number
  end: number
  /**
   * The offset in the node of each folded character, or `null` when folding
   * left every character where it was — which it does for ordinary prose, so
   * the common case carries no array at all.
   */
  offsets: number[] | null
}

export interface ArticleIndex {
  /** The article's whole text, folded. What a query is matched against. */
  text: string
  /** Its text nodes in document order, so a match can be pointed at. */
  runs: TextRun[]
}

/**
 * Fold one text node, remembering where each character came from.
 *
 * Character by character rather than in one call, because folding is not
 * always one character to one: "ﬁ" becomes two and "½" three. The handbook is
 * imported from a word processor, which is exactly where those arrive from,
 * and one of them early in a paragraph shifts every offset after it — the mark
 * then sits beside the word instead of on it. Measured over the whole
 * handbook, ~394 000 characters: 11 ms this way against 6 ms for folding each
 * node in a single call, so being exact costs 5 ms once per page load.
 */
const foldRun = (value: string): { text: string; offsets: number[] | null } => {
  let text = ''
  let offsets: number[] | null = null
  let at = 0
  for (const ch of value) {
    // ASCII lowercases one-to-one and has nothing to decompose, which is most
    // of the document; the full fold is for the rest.
    const folded = ch.charCodeAt(0) < 128 ? ch.toLowerCase() : fold(ch)
    if (offsets === null && folded.length !== ch.length) {
      // The first character that moves the ones after it: everything up to
      // here mapped to itself, so that part of the map can be written out now.
      offsets = Array.from({ length: text.length }, (_, i) => i)
    }
    if (offsets !== null) for (let i = 0; i < folded.length; i++) offsets.push(at)
    text += folded
    at += ch.length
  }
  return { text, offsets }
}

/**
 * One article's text and the nodes it is spread across.
 *
 * The concatenated text nodes are the article's `textContent` exactly, so what
 * the sidebar counts and what the reader sees marked cannot disagree.
 */
export const indexArticle = (article: Element): ArticleIndex => {
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT)
  const runs: TextRun[] = []
  let text = ''
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue ?? ''
    if (!value) continue
    const folded = foldRun(value)
    runs.push({
      node: node as Text,
      start: text.length,
      end: text.length + folded.text.length,
      offsets: folded.offsets,
    })
    text += folded.text
  }
  return { text, runs }
}

/** Every article on the page, keyed by the id its nav entry links to. */
export const indexArticles = (contentId: string): Map<string, ArticleIndex> => {
  const index = new Map<string, ArticleIndex>()
  for (const article of document.querySelectorAll<HTMLElement>(`#${contentId} article[id]`)) {
    index.set(article.id, indexArticle(article))
  }
  return index
}

/** The node and offset that folded position `at` lands on. */
const boundary = (runs: TextRun[], at: number): { node: Text; offset: number } | null => {
  let low = 0
  let high = runs.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const run = runs[mid]
    if (at < run.start) high = mid - 1
    else if (at >= run.end) low = mid + 1
    else {
      const within = at - run.start
      return { node: run.node, offset: run.offsets ? run.offsets[within] : within }
    }
  }
  // The runs are contiguous, so the only position outside them all is the one
  // just past the last character — where a match ending the article ends.
  const last = runs[runs.length - 1]
  return last ? { node: last.node, offset: last.node.length } : null
}

/**
 * Where `needle` occurs in one article, as ranges a browser can paint.
 *
 * `limit` caps them because a one-letter query matches tens of thousands of
 * times in a document this long, and painting all of them would stall the
 * keystroke for nothing: a page marked everywhere says no more than an unmarked
 * one. The second letter is what fixes it, and typing it is what a reader does
 * next anyway.
 */
export const matchRanges = (index: ArticleIndex, needle: string, limit: number): Range[] => {
  const ranges: Range[] = []
  if (!needle) return ranges
  let from = 0
  while (ranges.length < limit) {
    const at = index.text.indexOf(needle, from)
    if (at < 0) break
    const start = boundary(index.runs, at)
    const end = boundary(index.runs, at + needle.length)
    if (start && end) {
      const range = document.createRange()
      range.setStart(start.node, start.offset)
      range.setEnd(end.node, end.offset)
      ranges.push(range)
    }
    from = at + needle.length
  }
  return ranges
}

/** The name `handbok.css` styles the marks under — the one string they share. */
export const HIGHLIGHT_NAME = 'handbok-traff'

/** Marks over the whole handbook, shared out across the articles that match. */
const MAX_MARKS = 2000

/**
 * Paint every hit in the text, or clear the marks when there is nothing to
 * find.
 *
 * Ranges over the existing text through the CSS Custom Highlight API, so the
 * rendered rich text is never rewritten: nothing to insert on a keystroke,
 * nothing to unpick on the next one, and no way for a mark to survive as
 * markup in a page an editor later exports. A browser without the API gets the
 * filtered list and no marks — the same handbook, only without the shortcut.
 */
export const highlightMatches = (index: Map<string, ArticleIndex> | null, needle: string): void => {
  if (typeof CSS === 'undefined' || !CSS.highlights) return
  if (!index || !needle) {
    CSS.highlights.delete(HIGHLIGHT_NAME)
    return
  }
  const ranges: Range[] = []
  for (const article of index.values()) {
    if (ranges.length >= MAX_MARKS) break
    ranges.push(...matchRanges(article, needle, MAX_MARKS - ranges.length))
  }
  if (ranges.length === 0) CSS.highlights.delete(HIGHLIGHT_NAME)
  else CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges))
}

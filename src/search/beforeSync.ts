import type { BeforeSync } from '@payloadcms/plugin-search/types'
import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import type { CollectionSlug } from 'payload'

/** Shape of an `info-page` read with `locale: 'all'` — localized fields become locale maps. */
type AllLocales = {
  content?: Record<string, SerializedEditorState | null | undefined>
  title?: Record<string, string | null | undefined>
}

/**
 * The search collection is intentionally NOT localized (see `localize: false` in
 * payload.config.ts). The plugin's afterChange hook only syncs the locale the
 * document was saved in, so a localized index would silently miss any locale the
 * editor never opened. Instead every locale is flattened into a single
 * `searchText` blob, so one save keeps the whole index correct and a query matches
 * regardless of which language the reader is using.
 */
/**
 * Upper bound for the flattened index, and the reason it is stated rather than
 * left to the default.
 *
 * Payload validates every text field against `defaultMaxTextLength` (40 000).
 * `searchText` holds every locale of a page at once, so it passes that mark
 * long before a page looks unusual — the handbook's Bilaga 1 flattens to
 * 48 207 characters. What happens then is the dangerous part: this hook runs
 * in the page's own `afterChange`, so the failed `search` document rolls back
 * the transaction that created the page. `payload.create` still returns a
 * document with an id, the plugin logs "Error syncing search document", and
 * the page is simply not there. An import reports success and silently loses a
 * page.
 *
 * So the limit is raised to somewhere no real page reaches, and the text is
 * truncated at it. A page that somehow exceeds even this loses the tail of its
 * searchable text, which is a bad day; losing the page is a worse one.
 */
export const SEARCH_TEXT_MAX = 500_000

export const beforeSync: BeforeSync = async ({
  collectionSlug,
  originalDoc,
  payload,
  req,
  searchDoc,
}) => {
  // `originalDoc` is resolved for a single locale. Re-read with `locale: 'all'` so
  // every translation ends up in the index.
  const allLocales = (await payload.findByID({
    id: originalDoc.id,
    collection: collectionSlug as CollectionSlug,
    depth: 0,
    draft: false,
    fallbackLocale: null,
    locale: 'all',
    req,
  })) as unknown as AllLocales

  const parts: string[] = []

  for (const title of Object.values(allLocales.title ?? {})) {
    if (title) {
      parts.push(title)
    }
  }

  for (const content of Object.values(allLocales.content ?? {})) {
    if (!content) {
      continue
    }

    try {
      parts.push(convertLexicalToPlaintext({ data: content }))
    } catch (err) {
      payload.logger.error({
        err,
        msg: `Search plugin: failed to flatten rich text for ${collectionSlug}:${originalDoc.id}`,
      })
    }
  }

  const defaultLocale = payload.config.localization
    ? payload.config.localization.defaultLocale
    : undefined

  return {
    ...searchDoc,
    title: (defaultLocale ? allLocales.title?.[defaultLocale] : undefined) || searchDoc.title,
    // Collapse whitespace so line breaks in rich text don't split words apart for `like` queries.
    searchText: parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, SEARCH_TEXT_MAX),
  }
}

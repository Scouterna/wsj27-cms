import type { FieldHook } from 'payload'

// URL-safe slug: Swedish letters fold to their base (å/ä → a, ö → o) via
// Unicode decomposition, everything else non-alphanumeric collapses to "-".
// Exported so scripts (the handbook import) produce the same slugs the hook
// would.
export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

/**
 * beforeValidate hook: format a manually entered slug, or derive one from the
 * document's title/name when the field is left empty. The slug itself is not
 * localized — one URL identity per document — so it derives from whichever
 * locale the document is created in (sv, in practice).
 */
export const formatSlug: FieldHook = ({ value, data }) => {
  const source =
    typeof value === 'string' && value.trim() !== '' ? value : (data?.title ?? data?.name)
  return typeof source === 'string' ? slugify(source) : value
}

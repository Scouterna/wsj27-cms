import type { FieldHook } from 'payload'

/**
 * Headroom for pages inside one chapter. The importer numbers pages by tens, so
 * a chapter would need a hundred of them before two positions collide — and a
 * collision only makes two pages tie, it corrupts nothing.
 */
export const CHAPTER_STRIDE = 1000

/** Where a page sits in the book, as one sortable number. */
export const bookPosition = (chapterOrder: number, pageOrder: number): number =>
  chapterOrder * CHAPTER_STRIDE + pageOrder

/**
 * Keeps `position` in step with the chapter and the page's own order.
 *
 * It exists because the admin list sorts on one column and `order` restarts at
 * zero in every chapter, so no field the handbook already had could express
 * book order. `defaultSort` cannot stand in for it either: the list view reads
 * that option only when it is a string —
 *
 *   query.sort = collectionPreferences?.sort ||
 *     (typeof collectionConfig.defaultSort === 'string' ? ... : undefined)
 *
 * — so an array of two fields is accepted by the API and silently ignored by
 * the admin, which then falls back to newest-first.
 *
 * Returns null for a page with no chapter. Postgres sorts nulls last, so those
 * land after the book rather than in front of it.
 */
export const setPosition: FieldHook = async ({ data, originalDoc, req }) => {
  const relation = data?.chapter ?? originalDoc?.chapter
  const chapterId = typeof relation === 'object' ? relation?.id : relation
  if (chapterId == null || !req?.payload) return null

  const order = typeof data?.order === 'number' ? data.order : (originalDoc?.order ?? 0)

  try {
    const chapter = await req.payload.findByID({
      collection: 'info-chapter',
      id: chapterId,
      depth: 0,
    })
    return bookPosition(chapter?.order ?? 0, order)
  } catch {
    // A chapter that cannot be read is not a reason to fail the save; the page
    // sorts last until the next write, which is visible and recoverable.
    return null
  }
}

import type { FieldHook } from 'payload'

/**
 * beforeChange hook for `changeNoteAt`: stamp the moment the reader-facing
 * change note was *written*, not the moment the page was last saved.
 *
 * The two dates have to be separate or the feature defeats itself. A page
 * carries "Uppdaterad <updatedAt>", which moves for every save including a
 * corrected comma. If the change list were sorted by that, a typo fix would
 * lift a months-old note back to the top and date it today — the list would
 * claim something was announced that was not. Sorting by when the note changed
 * means a save that does not touch the note does not touch the list.
 *
 * Clearing the note nulls the date, which is how an entry leaves the list: the
 * page keeps its updated date and drops out of the announcements.
 */
export const stampChangeNote: FieldHook = ({ originalDoc, siblingData, value }) => {
  const text = (input: unknown): string => (typeof input === 'string' ? input.trim() : '')

  const next = text(siblingData?.changeNote)
  const previous = text(originalDoc?.changeNote)

  if (next === previous) {
    return value
  }

  return next === '' ? null : new Date().toISOString()
}

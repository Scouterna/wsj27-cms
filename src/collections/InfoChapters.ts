import type { CollectionConfig } from 'payload'
import { isEditor } from '../access'
import { formatSlug } from '../fields/slug'
import { sql } from '@payloadcms/db-postgres'

import { bookPosition } from '../fields/position'

// Chapters group info pages (the leader handbook's five chapters, to begin
// with) and carry the ordering for navigation. They are editor data rather
// than code so that a new audience — participant pages, guardian pages — is a
// new chapter in the admin UI, not a deploy.
export const InfoChapters: CollectionConfig = {
  slug: 'info-chapter',
  // One string, not a per-language record — see InfoPage.
  labels: {
    singular: 'Handbok kapitel',
    plural: 'Handbok kapitel',
  },
  access: {
    read: () => true,
    create: isEditor,
    update: isEditor,
    delete: isEditor,
  },
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        // Moving a chapter moves every page in it, and `position` is the only
        // field that knows. Nothing else recomputes it: a page's own hook runs
        // when the page is saved, and these pages are not being saved.
        if (doc.order === previousDoc?.order) return

        // One statement, touching one column, through the adapter's own
        // connection. Both `payload.update` and `payload.db.updateOne` stamp
        // `updatedAt` — measured, not assumed — and that date is reader-facing
        // on /handbok: reordering a chapter would otherwise tell every reader
        // that all of its pages changed today, when not a word of them did.
        const drizzle = (
          req.payload.db as unknown as { drizzle?: { execute: (q: unknown) => Promise<unknown> } }
        ).drizzle
        if (!drizzle) return

        // The chapter's share of the number, worked out here rather than in
        // SQL: `$1 * $2` leaves Postgres with two unknowns and no operator to
        // choose ("operator is not unique: unknown * unknown"), and it keeps
        // the stride in one place.
        const base = bookPosition(doc.order ?? 0, 0)

        await drizzle.execute(
          sql`UPDATE "info_page" SET "position" = ${base}::numeric + "order" WHERE "chapter_id" = ${doc.id}`,
        )
      },
    ],
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'order'],
  },
  fields: [
    {
      name: 'name',
      label: 'Namn',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'slug',
      label: 'Tekniskt namn',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Sätts automatiskt från namnet om det lämnas tomt. Används i webbadresser.',
      },
      hooks: {
        beforeValidate: [formatSlug],
      },
    },
    {
      name: 'order',
      label: 'Ordning',
      type: 'number',
      required: true,
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description: 'Kapitlens ordning i navigationen, lägst först.',
      },
    },
  ],
}

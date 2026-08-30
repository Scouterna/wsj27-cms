import type { CollectionConfig } from 'payload'
import { isEditor } from '../access'
import { formatSlug } from '../fields/slug'

// Chapters group info pages (the leader handbook's five chapters, to begin
// with) and carry the ordering for navigation. They are editor data rather
// than code so that a new audience — participant pages, guardian pages — is a
// new chapter in the admin UI, not a deploy.
export const InfoChapters: CollectionConfig = {
  slug: 'info-chapter',
  labels: {
    singular: { sv: 'Kapitel', en: 'Chapter' },
    plural: { sv: 'Kapitel', en: 'Chapters' },
  },
  access: {
    read: () => true,
    create: isEditor,
    update: isEditor,
    delete: isEditor,
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

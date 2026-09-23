import type { CollectionConfig } from 'payload'
import { isEditor } from '../access'
import { formatSlug } from '../fields/slug'
import { stampChangeNote } from '../fields/changeNote'

export const InfoPage: CollectionConfig = {
  slug: 'info-page',
  // Handbook content is Swedish only, so the labels are one string rather than
  // a per-admin-language record: an editor running the admin in English sees
  // the same name as the collection's content carries.
  labels: {
    singular: 'Handbok',
    plural: 'Handbok',
  },
  access: {
    read: () => true,
    create: isEditor,
    update: isEditor,
    delete: isEditor,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'chapter', 'order', 'audience'],
  },
  versions: {
    drafts: true,
  },
  fields: [
    {
      name: 'title',
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
        description: 'Sätts automatiskt från titeln om det lämnas tomt. Används i webbadresser.',
      },
      hooks: {
        beforeValidate: [formatSlug],
      },
    },
    {
      name: 'chapter',
      label: 'Kapitel',
      type: 'relationship',
      relationTo: 'info-chapter',
      admin: {
        position: 'sidebar',
        description: 'Kapitlet sidan hör hemma i. Lämna tomt för fristående sidor.',
      },
    },
    {
      name: 'order',
      label: 'Ordning',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description: 'Sidans ordning inom kapitlet, lägst först.',
      },
    },
    {
      // A marker for the consuming app's navigation, not an access rule: the
      // read API stays public, and the CMS cannot authenticate plain leaders —
      // only users with a wsj27-cms role get a Payload user. Anything that
      // must actually be secret does not belong in this collection.
      name: 'audience',
      label: 'Målgrupp',
      type: 'select',
      required: true,
      defaultValue: 'alla',
      options: [
        { label: 'Alla', value: 'alla' },
        { label: 'Ledare', value: 'ledare' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      // Reader-facing: the note, not the timestamp, is what puts a page in
      // "Senaste ändringarna" on /handbok. Left empty the page still shows its
      // updated date — which is the point, since most saves are not news.
      name: 'changeNote',
      label: 'Vad ändrades',
      type: 'textarea',
      localized: true,
      admin: {
        position: 'sidebar',
        description:
          'En mening till läsarna om vad som ändrades. Den hamnar överst på handboken under "Senaste ändringarna". Lämna tomt för rättstavning och annat ingen behöver läsa om — sidans uppdaterat-datum sätts ändå. Töm fältet för att ta bort raden ur listan.',
      },
    },
    {
      name: 'changeNoteAt',
      label: 'Noten skrevs',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Sätts automatiskt när noten ändras. Se src/fields/changeNote.ts.',
      },
      hooks: {
        beforeChange: [stampChangeNote],
      },
    },
    {
      name: 'icon',
      type: 'text',
      // admin: {
      //   components: {
      //     Field: '/fields/IconField#IconField',
      //   },
      // },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
      localized: true,
    },
  ],
}

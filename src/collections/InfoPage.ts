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
  // The handbook's own order, not the order pages happened to be written in.
  // Without this the list opens newest-first, which after an import means the
  // pages it created last, backwards, with chapter one somewhere on page three.
  // `chapter.order` and not `chapter`: sorting on the relationship sorts by its
  // id, which matches the document today only because the import created the
  // chapters in order — a chapter inserted into a later Word version would take
  // the next free id and sort last. Payload does read the related field
  // (checked: `sort=chapter.name` returns them alphabetically), and a page with
  // no chapter still appears, at the end.
  defaultSort: ['chapter.order', 'order'],
  access: {
    read: () => true,
    create: isEditor,
    update: isEditor,
    delete: isEditor,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['chapter', 'order', 'title', 'updatedAt'],
    // 42 pages today, so the whole handbook is one screen and no chapter is
    // split across a page break in the list.
    pagination: { defaultLimit: 50 },
    // Payload marks this beta in 3.83 ("may change in future releases"); it
    // adds the group-by control to the list view, which is the same structure
    // the sort above gives, made explicit.
    groupBy: true,
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
      // Who the page is written for, and with it where it is shown: `publik`
      // appears on /handbok, `campfire` is left out of it and reaches readers
      // through the Campfire app instead.
      //
      // **This is not an access rule.** The read API stays public, so a
      // `campfire` page is still served by /api/info-page to anyone who asks —
      // it is out of the public handbook, not out of reach. The CMS cannot
      // authenticate plain leaders either; only users with a wsj27-cms role get
      // a Payload user. Anything that must actually be secret does not belong
      // in this collection.
      name: 'audience',
      label: 'Målgrupp',
      type: 'select',
      required: true,
      defaultValue: 'publik',
      options: [
        { label: 'Publik', value: 'publik' },
        { label: 'Campfire', value: 'campfire' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Campfire-sidor visas inte på den publika handboken.',
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

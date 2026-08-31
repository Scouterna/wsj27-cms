import {
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  LinkFeature,
  type lexicalEditor,
} from '@payloadcms/richtext-lexical'

/**
 * The rich-text feature set, shared between the editor in payload.config.ts
 * and scripts that convert HTML into the same lexical shape (the handbook
 * import) — a converter built from a different feature set silently drops
 * what it does not know, tables first of all.
 */
export const editorFeatures: NonNullable<Parameters<typeof lexicalEditor>[0]>['features'] = ({
  defaultFeatures,
}) => [
  // The default link feature is replaced by one that also offers internal
  // links, so editors link between info pages without hardcoding URLs.
  ...defaultFeatures.filter((feature) => feature.key !== 'link'),
  LinkFeature({ enabledCollections: ['info-page'] }),
  // The handbook is full of tables (addresses, budget, changelog).
  EXPERIMENTAL_TableFeature(),
  // Long documents: keep the toolbar visible instead of inline-only.
  FixedToolbarFeature(),
]

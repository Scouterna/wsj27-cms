import { postgresAdapter } from '@payloadcms/db-postgres'
import { searchPlugin } from '@payloadcms/plugin-search'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { migrations } from './migrations'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { en } from 'payload/i18n/en'
import { sv } from 'payload/i18n/sv'
import { InfoPage } from './collections/InfoPage'
import { InfoChapters } from './collections/InfoChapters'
import { editorFeatures } from './lib/editorFeatures'
import { beforeSync, SEARCH_TEXT_MAX } from './search/beforeSync'
import { isEditor } from './access'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  serverURL: process.env.SERVER_URL,
  i18n: {
    supportedLanguages: { sv, en },
  },
  localization: {
    defaultLocale: 'sv',
    locales: ['sv', 'en'],
  },
  admin: {
    user: Users.slug,
    theme: 'light',
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      beforeLogin: ['/components/BeforeLogin#BeforeLogin'],
    },
  },
  cors: {
    origins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [],
  },
  collections: [Users, Media, InfoPage, InfoChapters],
  // The feature set lives in src/lib/editorFeatures.ts, shared with the
  // handbook import script's HTML converter.
  editor: lexicalEditor({ features: editorFeatures }),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    prodMigrations: migrations,
  }),
  sharp,
  plugins: [
    searchPlugin({
      collections: ['info-page'],
      beforeSync,
      // See src/search/beforeSync.ts — all locales are flattened into one
      // non-localized `searchText` field instead of localizing the index.
      localize: false,
      searchOverrides: {
        fields: ({ defaultFields }) => [
          ...defaultFields,
          {
            name: 'searchText',
            type: 'textarea',
            // Explicit, because the default is 40 000 and a single page can
            // flatten past it — see SEARCH_TEXT_MAX for what that costs.
            maxLength: SEARCH_TEXT_MAX,
            admin: {
              readOnly: true,
            },
          },
        ],
        access: {
          // Reindexing requires update + delete on the search collection.
          delete: isEditor,
          update: isEditor,
        },
      },
    }),
  ],
  endpoints: [
    {
      // Consumed by the WSJ27 app shell to render the CMS tool in the
      // navigation (same contract as j26-app's J26_PUBLIC_APP_CONFIGS).
      // Served at /_services/cms/api/app-config.
      // req.user is populated by the wsj27-auth strategy only for users with a
      // wsj27-cms role, so returning 401 otherwise hides the tool from everyone
      // without CMS access.
      path: '/app-config',
      method: 'get',
      handler: (req) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        return Response.json({
          navigation: [
            {
              type: 'page',
              id: 'page_cms',
              label: 'Hantera innehåll',
              icon: 'edit',
              path: '/_services/cms/admin',
            },
          ],
        })
      },
    },
  ],
})

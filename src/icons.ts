import type { Metadata } from 'next'

/**
 * The browser-tab icon, for both halves of the app.
 *
 * **Two consumers, one declaration.** The frontend takes it through Next's
 * `metadata` export and the admin panel through `admin.meta` in
 * payload.config.ts, because Payload builds the admin `<head>` itself and
 * Next's file conventions (`app/favicon.ico`) never reach it. A second copy
 * would drift, and the half that drifted would be the admin — nobody looks at
 * a CMS tab and thinks about its icon.
 *
 * **The paths are base-path-prefixed by hand**, the same problem the brand
 * fonts and the contingent logotype have: everything in `public/` is served
 * under the base path, and Next does not prefix a URL it was handed. They stay
 * absolute from the host root on purpose, so the handbook's other address —
 * `/_services/handbok`, outside the base path — asks for the same file.
 *
 * The artwork is the contingent logotype reduced to what survives 16 px: its
 * own brush plate, and "27" cut out of the wordmark's own "2027" so the digits
 * keep the logotype's face. The complete logotype, which the guide asks for
 * wherever it can be used, is not one of the things that survives — four words
 * across sixteen pixels is a smudge. The World Scout emblem inside the mark
 * would have scaled, but it is the movement's, not the contingent's, and a tab
 * strip is exactly where that difference stops being visible. The README has
 * the recipe; the source image is in the graphic package, not in this repo.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

export const icons: Metadata['icons'] = {
  icon: [{ url: `${basePath}/favicon.ico`, sizes: '16x16 32x32 48x48', type: 'image/x-icon' }],
  apple: [{ url: `${basePath}/apple-touch-icon.png`, sizes: '180x180', type: 'image/png' }],
}

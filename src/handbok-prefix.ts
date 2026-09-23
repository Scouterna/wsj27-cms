/**
 * Shared by the middleware and the handbook pages, and deliberately its own
 * module: the middleware runs in its own bundle, so importing this from a page
 * module would drag `getPayload` into it, and importing it from the middleware
 * would drag the middleware into the pages.
 */

/** The handbook's public address, a sibling of the CMS base path. */
export const HANDBOK_PUBLIC_PATH = '/_services/handbok'

/** Request header the middleware sets so a page knows which address was used. */
export const HANDBOK_PREFIX_HEADER = 'x-handbok-prefix'

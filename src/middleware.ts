import { NextResponse, type NextRequest } from 'next/server'

import { HANDBOK_PREFIX_HEADER, HANDBOK_PUBLIC_PATH } from './handbok-prefix'

// Serve the handbook at /_services/handbok, a sibling of the CMS's own base
// path rather than a child of it.
//
// There is nowhere else this can happen. Traefik would need a Middleware CRD
// to rewrite the path and the wsj27 kubeconfig has no rights to create one. A
// next.config `rewrites()` entry is refused outright ("rewrites urls outside
// of the basePath"): `basePath: false` is the only way to match a path outside
// basePath, and Next then forbids an internal destination.
//
// Two consequences of basePath that this file is shaped by:
//
//   - **No `config.matcher`.** A matcher is basePath-relative — Next prefixes
//     it — so any matcher written here is a path under /_services/cms, and the
//     one path this exists for is not. Declaring one makes the middleware stop
//     running for it entirely, which is a silent 404, so the gate is the `if`
//     below and the cost is a string compare per request.
//   - **The match is the full public path**, because for a request outside
//     basePath Next leaves `nextUrl.pathname` unstripped.
//
// The page loads its JS, CSS and fonts from under the base path, so
// /_services/cms must stay routed for the short URL to render.
const BASE_PATH = process.env.NEXT_BASE_PATH || ''
const PUBLIC_PATH = HANDBOK_PUBLIC_PATH

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (BASE_PATH && (pathname === PUBLIC_PATH || pathname.startsWith(`${PUBLIC_PATH}/`))) {
    // The whole subtree, not just the page: the printable version lives at
    // /utskrift under it, and a short address that only covers its own front
    // page sends the reader back to the long one on the first click.
    const rest = pathname.slice(PUBLIC_PATH.length)

    // Which address the reader actually used. Only the middleware knows —
    // after the rewrite the app sees the base path — and the links have to
    // know, or every link out of the handbook leaves the short URL behind.
    const headers = new Headers(request.headers)
    headers.set(HANDBOK_PREFIX_HEADER, PUBLIC_PATH)

    return NextResponse.rewrite(new URL(`${BASE_PATH}/handbok${rest}`, request.url), {
      request: { headers },
    })
  }
  return NextResponse.next()
}

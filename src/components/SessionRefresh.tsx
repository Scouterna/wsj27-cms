import React from 'react'

/**
 * Keeps the wsj27-auth session alive while someone is working in the admin.
 *
 * The access token lives **300 seconds** (`ACCESS_TOKEN_TTL_SECONDS` in
 * wsj27-auth-api). The auth service ships a browser loop that reads the public
 * `wsj27-auth_expires-at` cookie and calls `/refresh` a minute before expiry,
 * and its README says plainly that consumer apps are to embed it: "Embed the
 * refresh script so sessions do not lapse while someone is using the app."
 *
 * The CMS never did. So editing a page for five minutes was enough to be
 * signed out mid-sentence, with nothing to explain it — the strategy simply
 * finds an expired token and reports no user.
 *
 * Registered as an admin *provider* rather than added to
 * `src/app/(payload)/layout.tsx`, which Payload generates and says it may
 * rewrite at any time. A provider wraps the whole admin, including the login
 * view, so the loop is running wherever the editor happens to be.
 *
 * The URL is derived from `AUTH_DISCOVERY_URL`, not written out: the service
 * has already moved once, from /auth to /api/auth. The script works out its own
 * refresh endpoint from where it was loaded, so pointing at the right copy is
 * all that is needed.
 */
const refreshScriptUrl = (): string | null => {
  const discovery = process.env.AUTH_DISCOVERY_URL
  if (!discovery) return null
  try {
    const base = new URL('.', discovery).href.replace(/\/\.well-known\/$/, '').replace(/\/$/, '')
    return `${base}/static/refresh.js`
  } catch {
    return null
  }
}

export const SessionRefresh: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const src = refreshScriptUrl()
  return (
    <>
      {src && <script defer src={src} />}
      {children}
    </>
  )
}

export default SessionRefresh

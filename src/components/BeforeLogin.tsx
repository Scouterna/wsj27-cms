import React from 'react'

/**
 * Shown on the admin login view. Local (email/password) login is disabled, so
 * Payload renders no form and this stands in its place.
 *
 * The links are the point of it. Landing here means the session is gone, and
 * the page used to say only "log in through the main app" — true, and no help
 * at all, since it left the reader to work out where that was.
 *
 * Both URLs are derived from configuration rather than written out: the auth
 * service is wherever `AUTH_DISCOVERY_URL` points (it moved from /auth to
 * /api/auth once already), and the admin is wherever `SERVER_URL` says the CMS
 * is served.
 *
 * `target="_top"` because the CMS is embedded in an iframe by the main app. The
 * login round trip has to happen in the top window — inside the frame it is
 * unreadable, and the identity provider will refuse to be framed anyway. In a
 * page that is not framed, `_top` is the page itself, so it costs nothing.
 */

/** `https://…/api/auth` from the discovery URL, without assuming the path. */
const authBase = (): string | null => {
  const discovery = process.env.AUTH_DISCOVERY_URL
  if (!discovery) return null
  try {
    return new URL('.', discovery).href.replace(/\/\.well-known\/$/, '').replace(/\/$/, '')
  } catch {
    return null
  }
}

const adminUrl = (): string | null => {
  const server = process.env.SERVER_URL
  return server ? `${server.replace(/\/$/, '')}/admin` : null
}

export const BeforeLogin: React.FC = () => {
  const base = authBase()
  const back = adminUrl()
  // Straight to the identity provider and back to the page they wanted. Only
  // when both halves are known — a half-built login URL is worse than none,
  // because it fails after the click rather than before it.
  const loginHref = base && back ? `${base}/login?redirect_uri=${encodeURIComponent(back)}` : null

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <p style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Du är utloggad.</p>
      <p style={{ marginBottom: '1rem', opacity: 0.7 }}>
        Sessionen har gått ut. Logga in igen så kommer du tillbaka hit.
      </p>
      <p style={{ marginBottom: '0.75rem' }}>
        {loginHref && (
          <a
            href={loginHref}
            target="_top"
            style={{
              display: 'inline-block',
              padding: '0.55rem 1.1rem',
              marginRight: '0.75rem',
              borderRadius: '4px',
              background: 'var(--theme-elevation-800)',
              color: 'var(--theme-elevation-0)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Logga in
          </a>
        )}
        {/* Not `next/link`: it would prefix the CMS's base path and send the
            reader back into the CMS, which is the one place they cannot log
            in. This has to leave the app entirely. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" target="_top">
          Till startsidan
        </a>
      </p>
      <p style={{ opacity: 0.7, fontSize: '0.9em' }}>
        Your session has expired. Log in again and you will be returned here.
      </p>
    </div>
  )
}

export default BeforeLogin

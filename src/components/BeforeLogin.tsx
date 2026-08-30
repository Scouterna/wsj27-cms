import React from 'react'

// Shown on the admin login view. Local (email/password) login is disabled, so
// the default form is not rendered — this message stands in its place. The CMS
// is embedded in an iframe by the main app, which owns the actual login flow.
export const BeforeLogin: React.FC = () => (
  <div style={{ marginBottom: '1.5rem' }}>
    <p style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
      Logga in via huvudappen för att fortsätta.
    </p>
    <p style={{ opacity: 0.7 }}>Please log in through the main app to continue.</p>
  </div>
)

export default BeforeLogin

import type { AuthStrategy, CollectionConfig } from 'payload'
import { ACCESS_TOKEN_COOKIE, getCookieValue, verifyAndGetUser } from '../lib/auth'
import { isAdmin } from '../access'

const arraysEqual = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index])

// Authenticate against the shared wsj27-auth service: verify the access token
// from the httpOnly cookie, then map it onto a local Payload user
// (just-in-time provisioning). Identity and roles are owned by the auth
// service — the local record is only a mirror so Payload's
// relationships/access control work.
const wsj27AuthStrategy: AuthStrategy = {
  name: 'wsj27-auth',
  authenticate: async ({ payload, headers }) => {
    const token = getCookieValue(headers.get('cookie'), ACCESS_TOKEN_COOKIE)
    if (!token) return { user: null }

    const claims = await verifyAndGetUser(token)
    // No valid token, or a valid token without any wsj27-cms role, is treated
    // as logged-out so the user lands on the "please log in" screen.
    if (!claims || claims.roles.length === 0) return { user: null }

    const roles = claims.roles.filter(
      (role): role is 'admin' | 'editor' => role === 'admin' || role === 'editor',
    )
    if (roles.length === 0) return { user: null }

    const existing = await payload.find({
      collection: 'users',
      where: { sub: { equals: claims.sub } },
      limit: 1,
    })

    let doc = existing.docs[0]

    if (!doc) {
      doc = await payload.create({
        collection: 'users',
        data: {
          sub: claims.sub,
          email: claims.email,
          name: claims.name,
          roles,
        },
      })
    } else if (
      doc.email !== claims.email ||
      doc.name !== claims.name ||
      !arraysEqual(doc.roles ?? [], roles)
    ) {
      // Keep the local mirror in sync when the auth service's claims drift.
      doc = await payload.update({
        collection: 'users',
        id: doc.id,
        data: {
          email: claims.email,
          name: claims.name,
          roles,
        },
      })
    }

    return { user: { ...doc, collection: 'users' } }
  },
}

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'roles'],
  },
  // SSO-only: no email/password login. Identity comes from the shared
  // wsj27-auth service via the custom auth strategy.
  auth: {
    disableLocalStrategy: true,
    strategies: [wsj27AuthStrategy],
  },
  access: {
    // Any provisioned user (who by definition has a wsj27-cms role) may reach
    // the admin panel; only admins may manage user records.
    admin: ({ req }) => Boolean(req.user),
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'sub',
      label: 'SSO-ID',
      type: 'text',
      required: true,
      unique: true,
      admin: { readOnly: true },
    },
    {
      name: 'email',
      label: 'E-post',
      type: 'text',
      admin: { readOnly: true },
    },
    {
      name: 'name',
      label: 'Namn',
      type: 'text',
      admin: { readOnly: true },
    },
    {
      name: 'roles',
      label: 'Roller',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Redaktör', value: 'editor' },
      ],
      // Roles are assigned upstream (wsj27-project-api's role map), not here.
      admin: { readOnly: true },
    },
  ],
}

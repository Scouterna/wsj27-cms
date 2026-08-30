import type { Access } from 'payload'
import type { User } from '../payload-types'

const hasRole = (user: unknown, role: string): boolean =>
  Boolean((user as User | null)?.roles?.includes(role as NonNullable<User['roles']>[number]))

/** Users with the `admin` role. Full access, including user management. */
export const isAdmin: Access = ({ req: { user } }) => hasRole(user, 'admin')

/** Users with the `admin` or `editor` role. May manage content. */
export const isEditor: Access = ({ req: { user } }) =>
  hasRole(user, 'admin') || hasRole(user, 'editor')

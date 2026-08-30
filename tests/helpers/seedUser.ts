import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

// SSO-only: users are provisioned from wsj27-auth claims, so a seeded test user
// is just a local mirror row (sub + roles), not an email/password account.
export const testUser = {
  sub: 'test-sub-0000',
  email: 'dev@payloadcms.com',
  name: 'Dev Tester',
  roles: ['admin'] as ('admin' | 'editor')[],
}

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  // Delete existing test user if any
  await payload.delete({
    collection: 'users',
    where: {
      sub: {
        equals: testUser.sub,
      },
    },
  })

  // Create fresh test user
  await payload.create({
    collection: 'users',
    data: testUser,
  })
}

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: {
      sub: {
        equals: testUser.sub,
      },
    },
  })
}

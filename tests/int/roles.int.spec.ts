import { describe, it, expect } from 'vitest'
import { cmsRolesFromClaims } from '@/lib/auth'

describe('cmsRolesFromClaims', () => {
  it('passes dedicated wsj27-cms roles through', () => {
    expect(cmsRolesFromClaims({ 'wsj27-cms': { roles: ['admin'] } })).toEqual(['admin'])
    expect(cmsRolesFromClaims({ 'wsj27-cms': { roles: ['editor'] } })).toEqual(['editor'])
  })

  it('maps CMT membership to editor', () => {
    expect(cmsRolesFromClaims({ wsj27: { roles: ['cmt:kommunikation:it'] } })).toEqual(['editor'])
    expect(cmsRolesFromClaims({ wsj27: { roles: ['cmt'] } })).toEqual(['editor'])
  })

  it('does not treat other project roles as CMS access', () => {
    expect(cmsRolesFromClaims({ wsj27: { roles: ['ledare:43'] } })).toEqual([])
    // Prefix trap: "cmt" must be the whole segment, not just how a role starts.
    expect(cmsRolesFromClaims({ wsj27: { roles: ['cmtx'] } })).toEqual([])
  })

  it('does not duplicate editor for CMT members who also hold it', () => {
    expect(
      cmsRolesFromClaims({
        'wsj27-cms': { roles: ['editor'] },
        wsj27: { roles: ['cmt:kommunikation:it'] },
      }),
    ).toEqual(['editor'])
  })

  it('keeps admin alongside the CMT-mapped editor', () => {
    expect(
      cmsRolesFromClaims({
        'wsj27-cms': { roles: ['admin'] },
        wsj27: { roles: ['cmt:program'] },
      }),
    ).toEqual(['admin', 'editor'])
  })

  it('yields nothing for an empty or absent claim', () => {
    expect(cmsRolesFromClaims(undefined)).toEqual([])
    expect(cmsRolesFromClaims({})).toEqual([])
  })
})

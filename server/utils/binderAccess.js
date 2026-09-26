const sid = (v) => (v == null ? '' : String(v))

const personalOnly = {
  id: 'personal',
  listFilter: (profileId) => ({ profileId }),
  roleFor: (binder, profileId) =>
    binder && sid(binder.profileId) === sid(profileId) ? 'owner' : null,
}

let policy = personalOnly

export function setBinderAccessPolicy(next) {
  if (!next || typeof next.listFilter !== 'function' || typeof next.roleFor !== 'function') {
    console.warn('[dex] ignoring binder access policy: does not implement the contract')
    return false
  }
  policy = next
  return true
}

export function activePolicyId() {
  return policy.id || 'unknown'
}

export const listFilterFor = (profileId) => policy.listFilter(profileId)
export const roleFor = (binder, profileId) => policy.roleFor(binder, profileId)

const RANK = { viewer: 1, contributor: 2, admin: 3, owner: 4 }

const atLeast = (role, min) => (RANK[role] || 0) >= RANK[min]

export const canView = (role) => atLeast(role, 'viewer')
export const canEditCards = (role) => atLeast(role, 'contributor')
export const canEditBinder = (role) => atLeast(role, 'admin')
export const canManage = (role) => atLeast(role, 'admin')
export const canDelete = (role) => atLeast(role, 'admin')

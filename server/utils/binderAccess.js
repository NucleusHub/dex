// Binder access policy.
//
// Out of the box Dex has no sharing at all: a binder belongs to the profile that
// created it and nobody else can see it. That baseline lives here as the default
// policy, and it is the ONLY thing the binder routes know about permissions.
//
// The shared-binders plugin replaces the policy at startup (see server/plugins),
// which is what turns on viewer/contributor/admin grants and group binders. With
// the plugin absent or disabled the routes are unchanged and every binder stays
// personal — the same "optional plugin owns a whole capability, host degrades
// cleanly" shape the localization plugin set (see plugins/README.md).
//
//   interface BinderAccessPolicy {
//     id: string
//     // Mongo filter for every binder this profile may open.
//     listFilter(profileId): Promise<object> | object
//     // The profile's role on a binder, or null when they may not see it.
//     // 'owner' | 'admin' | 'contributor' | 'viewer'
//     roleFor(binder, profileId): Promise<string|null> | string|null
//   }

const sid = (v) => (v == null ? '' : String(v))

const personalOnly = {
  id: 'personal',
  listFilter: (profileId) => ({ profileId }),
  roleFor: (binder, profileId) =>
    binder && sid(binder.profileId) === sid(profileId) ? 'owner' : null,
}

let policy = personalOnly

// Installed by the shared-binders plugin at startup. Falls back to the personal
// policy if handed something that doesn't implement the contract, so a broken
// plugin can't open other people's binders up by accident.
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

// ── Capabilities ─────────────────────────────────────────────────────────────
// Roles are ordered; every capability is a floor on that order. Keeping the
// mapping here (rather than in each route) means the plugin only has to decide
// WHO has a role, never what a role may do.
const RANK = { viewer: 1, contributor: 2, admin: 3, owner: 4 }

const atLeast = (role, min) => (RANK[role] || 0) >= RANK[min]

export const canView = (role) => atLeast(role, 'viewer')
// Slot the cards in and out — the day-to-day act of using a binder.
export const canEditCards = (role) => atLeast(role, 'contributor')
// Rename, re-cover, change layout, add/remove pages.
export const canEditBinder = (role) => atLeast(role, 'admin')
// Change who it's shared with, and delete it outright.
export const canManage = (role) => atLeast(role, 'admin')
export const canDelete = (role) => atLeast(role, 'admin')

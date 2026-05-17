// Single source of truth for role definitions.
// Used by route guards, sidebar nav, server-side field stripping,
// and RLS policy mirroring.

export type Role = 'owner' | 'admin' | 'seller' | 'distributor' | 'customer';

// Roles this admin app actively serves.
// Customer is excluded by design — they belong on the storefront.
export const ADMIN_ROLES = ['owner', 'admin', 'seller', 'distributor'] as const;
export type AdminRole = typeof ADMIN_ROLES[number];

// Owner-equivalent roles.
// Per RBAC spec: admin behaves identically to owner everywhere.
// If admin ever diverges, change this constant — not call sites.
export const OWNER_ROLES = ['owner', 'admin'] as const;
export type OwnerRole = typeof OWNER_ROLES[number];

export function isOwnerEquivalent(role: Role): role is OwnerRole {
  return role === 'owner' || role === 'admin';
}

export function isAdminRole(role: Role): role is AdminRole {
  return role !== 'customer';
}

export function isSellerRole(role: Role): boolean {
  return role === 'seller' || role === 'distributor';
}

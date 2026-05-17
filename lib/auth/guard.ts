import 'server-only';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  type Role,
  type OwnerRole,
  OWNER_ROLES,
  isAdminRole,
} from './roles';

export type CallerProfile = {
  id: string;
  auth_user_id: string;
  role: Role;
  full_name: string | null;
  email: string;
};

/**
 * Resolve the signed-in caller's profile.
 *
 *   - Unsigned                → redirect to /login
 *   - Signed in, no profile   → redirect to /login (broken state)
 *   - role = 'customer'       → redirect to /bounce
 *   - Otherwise               → return profile
 *
 * Use this once in app/(dashboard)/layout.tsx so every dashboard
 * page has a guaranteed admin caller. Pages/actions add stricter
 * checks on top via requireRole / requireOwner.
 */
export async function requireAdminCaller(): Promise<CallerProfile> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, auth_user_id, role, full_name')
    .eq('auth_user_id', user.id)
    .single();

  if (error || !profile) redirect('/login');

  if (!isAdminRole(profile.role as Role)) redirect('/bounce');

  return {
    id: profile.id,
    auth_user_id: profile.auth_user_id,
    role: profile.role as Role,
    full_name: profile.full_name,
    email: user.email ?? '',
  };
}

/**
 * Require the caller's role to be in `allowed`.
 *
 * Builds on requireAdminCaller, then notFound() if the role is
 * not in the allow-list. notFound (not redirect) avoids leaking
 * the existence of restricted surfaces — a seller hitting
 * /warehouses gets the standard 404.
 */
export async function requireRole<T extends Role>(
  allowed: readonly T[]
): Promise<CallerProfile & { role: T }> {
  const caller = await requireAdminCaller();
  if (!(allowed as readonly Role[]).includes(caller.role)) {
    notFound();
  }
  return caller as CallerProfile & { role: T };
}

/**
 * Sugar for requireRole(OWNER_ROLES).
 * Use for every owner-only page and server action.
 */
export async function requireOwner(): Promise<CallerProfile & { role: OwnerRole }> {
  return requireRole(OWNER_ROLES);
}

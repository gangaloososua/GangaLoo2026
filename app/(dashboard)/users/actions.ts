'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Roles this UI is allowed to create/assign.
// owner + admin + customer are intentionally excluded — see notes in handoff.
export type AssignableRole = 'seller' | 'distributor'
export type UserRole = 'owner' | 'admin' | 'seller' | 'distributor' | 'customer'

export type UserRow = {
  profile_id: string
  auth_user_id: string
  full_name: string
  email: string | null
  phone: string | null
  role: UserRole
  is_active: boolean
  last_sign_in_at: string | null
  auth_created_at: string | null
  banned: boolean
}

export type UnlinkedProfile = {
  id: string
  full_name: string
  role: UserRole
  email: string | null
  phone: string | null
}

/**
 * List every profile that has an auth_user_id link, joined with auth user data
 * (email, last_sign_in_at, banned status) from the admin API.
 */
export async function listUsers(): Promise<UserRow[]> {
  const supabase = await createClient()
  const admin = createAdminClient()

  // 1. Profiles with logins
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, auth_user_id, full_name, email, phone, role, is_active')
    .not('auth_user_id', 'is', null)
    .order('full_name', { ascending: true })

  if (profErr) {
    console.error('listUsers profiles error:', profErr)
    throw new Error('Failed to load users')
  }

  // 2. Auth users (paginate — admin API caps at 1000 per page; we expect <50)
  const { data: authData, error: authErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (authErr) {
    console.error('listUsers auth error:', authErr)
    throw new Error('Failed to load auth users')
  }

  const authById = new Map(
    authData.users.map((u) => [
      u.id,
      {
        email: u.email ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        created_at: u.created_at ?? null,
        banned_until: (u as { banned_until?: string }).banned_until ?? null,
      },
    ])
  )

  // 3. Merge
  const now = new Date()
  return (profiles ?? []).map((p) => {
    const a = authById.get(p.auth_user_id!)
    const bannedUntil = a?.banned_until ? new Date(a.banned_until) : null
    const banned = bannedUntil !== null && bannedUntil > now
    return {
      profile_id: p.id,
      auth_user_id: p.auth_user_id!,
      full_name: p.full_name,
      email: a?.email ?? p.email,
      phone: p.phone,
      role: p.role as UserRole,
      is_active: p.is_active,
      last_sign_in_at: a?.last_sign_in_at ?? null,
      auth_created_at: a?.created_at ?? null,
      banned,
    }
  })
}

/**
 * Get one user (profile + auth) by profile id. Used by the edit page.
 */
export async function getUser(profileId: string): Promise<UserRow | null> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, auth_user_id, full_name, email, phone, role, is_active')
    .eq('id', profileId)
    .maybeSingle()

  if (profErr) {
    console.error('getUser profile error:', profErr)
    throw new Error('Failed to load user')
  }
  if (!profile || !profile.auth_user_id) return null

  const { data: authData, error: authErr } =
    await admin.auth.admin.getUserById(profile.auth_user_id)

  if (authErr) {
    console.error('getUser auth error:', authErr)
    throw new Error('Failed to load auth user')
  }

  const a = authData.user
  const bannedUntil = (a as { banned_until?: string }).banned_until
    ? new Date((a as { banned_until?: string }).banned_until!)
    : null
  const banned = bannedUntil !== null && bannedUntil > new Date()

  return {
    profile_id: profile.id,
    auth_user_id: profile.auth_user_id,
    full_name: profile.full_name,
    email: a.email ?? profile.email,
    phone: profile.phone,
    role: profile.role as UserRole,
    is_active: profile.is_active,
    last_sign_in_at: a.last_sign_in_at ?? null,
    auth_created_at: a.created_at ?? null,
    banned,
  }
}

/**
 * List profiles that DON'T have a login yet — used by the "Promote existing"
 * mode of the new-user form. Excludes customers (they sign up themselves on
 * the future storefront).
 */
export async function listUnlinkedProfiles(): Promise<UnlinkedProfile[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, email, phone')
    .is('auth_user_id', null)
    .eq('is_active', true)
    .in('role', ['seller', 'distributor'])
    .order('full_name', { ascending: true })

  if (error) {
    console.error('listUnlinkedProfiles error:', error)
    throw new Error('Failed to load unlinked profiles')
  }

  return (data ?? []) as UnlinkedProfile[]
}

// ===========================================================================
// MUTATIONS
// ===========================================================================

type ActionResult = { ok: true } | { ok: false; error: string }

function readForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k)
    return typeof v === 'string' ? v.trim() : ''
  }
  return { get }
}

function validateEmail(email: string): string | null {
  if (!email) return 'Email is required'
  // Permissive check — the Supabase admin API does its own real validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email looks invalid'
  if (email.length > 254) return 'Email too long'
  return null
}

function validatePassword(pw: string): string | null {
  if (!pw) return 'Password is required'
  if (pw.length < 8) return 'Password must be at least 8 characters'
  if (pw.length > 72) return 'Password too long (max 72 chars)'
  return null
}

/**
 * Create a brand new user: new auth user + new profile, linked.
 * Used by the "Create new" mode of /users/new.
 */
export async function createNewUser(formData: FormData): Promise<ActionResult> {
  const { get } = readForm(formData)

  const fullName = get('full_name')
  const email = get('email')
  const phone = get('phone')
  const password = get('password')
  const role = get('role') as AssignableRole

  if (!fullName) return { ok: false, error: 'Full name is required' }
  const emailErr = validateEmail(email)
  if (emailErr) return { ok: false, error: emailErr }
  const pwErr = validatePassword(password)
  if (pwErr) return { ok: false, error: pwErr }
  if (role !== 'seller' && role !== 'distributor') {
    return { ok: false, error: 'Role must be seller or distributor' }
  }

  const supabase = await createClient()
  const admin = createAdminClient()

  // 1. Check email isn't already used by another auth user
  //    (the admin.createUser call would fail anyway, but we want a nice error)
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (existing.users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: 'A user with that email already exists' }
  }

  // 2. Create the auth user (pre-confirmed, no email sent)
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (authErr || !authData.user) {
    console.error('createNewUser auth error:', authErr)
    return { ok: false, error: authErr?.message ?? 'Failed to create auth user' }
  }

  const authUserId = authData.user.id

  // 3. Create the profile row, linked to the auth user
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .insert({
      auth_user_id: authUserId,
      full_name: fullName,
      email,
      phone: phone || null,
      role,
      is_active: true,
    })
    .select('id')
    .single()

  // 4. If profile insert failed, roll back the auth user so we don't orphan it
  if (profErr || !profile) {
    console.error('createNewUser profile error:', profErr)
    await admin.auth.admin.deleteUser(authUserId).catch((e) => {
      console.error('Failed to roll back auth user:', e)
    })
    return { ok: false, error: profErr?.message ?? 'Failed to create profile' }
  }

  revalidatePath('/users')
  revalidatePath('/people')
  return { ok: true }
}

/**
 * Promote an existing profile (no auth_user_id) to a user by creating an auth
 * account and linking it. Used by the "Promote existing" mode of /users/new.
 */
export async function promoteProfileToUser(formData: FormData): Promise<ActionResult> {
  const { get } = readForm(formData)

  const profileId = get('profile_id')
  const email = get('email')
  const password = get('password')

  if (!profileId) return { ok: false, error: 'Profile is required' }
  const emailErr = validateEmail(email)
  if (emailErr) return { ok: false, error: emailErr }
  const pwErr = validatePassword(password)
  if (pwErr) return { ok: false, error: pwErr }

  const supabase = await createClient()
  const admin = createAdminClient()

  // 1. Verify the profile exists, is unlinked, and is a promotable role
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, auth_user_id, role, is_active')
    .eq('id', profileId)
    .maybeSingle()

  if (pErr || !profile) {
    return { ok: false, error: 'Profile not found' }
  }
  if (profile.auth_user_id) {
    return { ok: false, error: 'This person already has a login' }
  }
  if (!profile.is_active) {
    return { ok: false, error: 'Profile is inactive — reactivate it first' }
  }
  if (profile.role !== 'seller' && profile.role !== 'distributor') {
    return {
      ok: false,
      error: `Cannot promote a ${profile.role} from this UI`,
    }
  }

  // 2. Email already used?
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (existing.users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: 'A user with that email already exists' }
  }

  // 3. Create auth user (pre-confirmed)
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: profile.full_name },
  })

  if (authErr || !authData.user) {
    console.error('promoteProfileToUser auth error:', authErr)
    return { ok: false, error: authErr?.message ?? 'Failed to create auth user' }
  }

  const authUserId = authData.user.id

  // 4. Link
  const { error: linkErr } = await supabase
    .from('profiles')
    .update({ auth_user_id: authUserId, email })
    .eq('id', profileId)

  if (linkErr) {
    console.error('promoteProfileToUser link error:', linkErr)
    await admin.auth.admin.deleteUser(authUserId).catch((e) => {
      console.error('Failed to roll back auth user:', e)
    })
    return { ok: false, error: linkErr.message }
  }

  revalidatePath('/users')
  revalidatePath('/people')
  return { ok: true }
}

/**
 * Change a user's role. Cannot demote an owner (the only owner is you).
 * Cannot promote to owner or admin from this UI.
 */
export async function changeUserRole(formData: FormData): Promise<ActionResult> {
  const { get } = readForm(formData)
  const profileId = get('profile_id')
  const newRole = get('role') as AssignableRole

  if (!profileId) return { ok: false, error: 'Profile is required' }
  if (newRole !== 'seller' && newRole !== 'distributor') {
    return { ok: false, error: 'Role must be seller or distributor' }
  }

  const supabase = await createClient()

  // Guard: never change an owner's role from this UI
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', profileId)
    .maybeSingle()

  if (pErr || !profile) {
    return { ok: false, error: 'Profile not found' }
  }
  if (profile.role === 'owner' || profile.role === 'admin') {
    return {
      ok: false,
      error: `Cannot change role of an ${profile.role} from this UI`,
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', profileId)

  if (error) {
    console.error('changeUserRole error:', error)
    return { ok: false, error: error.message }
  }

  revalidatePath('/users')
  revalidatePath(`/users/${profileId}/edit`)
  revalidatePath('/people')
  return { ok: true }
}

/**
 * Set a new password for a user. Used when staff forgets theirs and you want
 * to hand them a fresh temp password verbally.
 */
export async function resetUserPassword(formData: FormData): Promise<ActionResult> {
  const { get } = readForm(formData)
  const authUserId = get('auth_user_id')
  const password = get('password')

  if (!authUserId) return { ok: false, error: 'Auth user id is required' }
  const pwErr = validatePassword(password)
  if (pwErr) return { ok: false, error: pwErr }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(authUserId, { password })

  if (error) {
    console.error('resetUserPassword error:', error)
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

/**
 * Ban a user — they can't log in until unbanned. Also flips profiles.is_active
 * to false so they disappear from active-staff lists.
 *
 * Supabase admin API: ban_duration: '876000h' = 100 years (effectively forever).
 * 'none' clears the ban.
 */
export async function setUserBanned(formData: FormData): Promise<ActionResult> {
  const { get } = readForm(formData)
  const authUserId = get('auth_user_id')
  const profileId = get('profile_id')
  const banned = get('banned') === '1'

  if (!authUserId || !profileId) {
    return { ok: false, error: 'IDs are required' }
  }

  const supabase = await createClient()
  const admin = createAdminClient()

  const { error: authErr } = await admin.auth.admin.updateUserById(authUserId, {
    ban_duration: banned ? '876000h' : 'none',
  })

  if (authErr) {
    console.error('setUserBanned auth error:', authErr)
    return { ok: false, error: authErr.message }
  }

  const { error: profErr } = await supabase
    .from('profiles')
    .update({ is_active: !banned })
    .eq('id', profileId)

  if (profErr) {
    console.error('setUserBanned profile error:', profErr)
    return { ok: false, error: profErr.message }
  }

  revalidatePath('/users')
  revalidatePath(`/users/${profileId}/edit`)
  revalidatePath('/people')
  return { ok: true }
}

/**
 * Unlink a user — deletes the auth account, sets profiles.auth_user_id to null.
 * The profile itself stays. Use when someone leaves but you want to keep their
 * historical sales/commissions tied to their name.
 *
 * Guard: never unlink an owner.
 */
export async function unlinkUser(formData: FormData): Promise<ActionResult> {
  const { get } = readForm(formData)
  const profileId = get('profile_id')
  const authUserId = get('auth_user_id')

  if (!profileId || !authUserId) {
    return { ok: false, error: 'IDs are required' }
  }

  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', profileId)
    .maybeSingle()

  if (pErr || !profile) {
    return { ok: false, error: 'Profile not found' }
  }
  if (profile.role === 'owner') {
    return { ok: false, error: 'Cannot unlink the owner' }
  }

  // 1. Unlink first — if this fails, we don't want a dangling auth account
  const { error: unlinkErr } = await supabase
    .from('profiles')
    .update({ auth_user_id: null })
    .eq('id', profileId)

  if (unlinkErr) {
    console.error('unlinkUser unlink error:', unlinkErr)
    return { ok: false, error: unlinkErr.message }
  }

  // 2. Delete the auth user
  const { error: delErr } = await admin.auth.admin.deleteUser(authUserId)
  if (delErr) {
    // Profile is already unlinked; the auth user is orphaned. Log loudly.
    console.error('unlinkUser auth delete error (orphan!):', delErr)
    return {
      ok: false,
      error: `Unlinked, but auth user delete failed: ${delErr.message}. Delete it manually in Supabase Auth.`,
    }
  }

  revalidatePath('/users')
  revalidatePath('/people')
  return { ok: true }
}
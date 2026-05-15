'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type UserRole = 'owner' | 'admin' | 'seller' | 'distributor' | 'customer'
export type ClubTier = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum'

export type Profile = {
  id: string
  auth_user_id: string | null
  email: string | null
  phone: string | null
  full_name: string
  role: UserRole
  commission_percent_override: number | null
  club_tier: ClubTier
  club_joined_at: string | null
  birthday: string | null
  document_id: string | null
  address: string | null
  city: string | null
  is_active: boolean
  notes: string | null
  bonus_points: number
  is_club_member: boolean
  rnc: string | null
  credit_limit_cents: number
  customer_type: string | null
  created_at: string
}

export type ProfileListRow = Profile & {
  distributor_for: string[] // warehouse names where this profile is assigned as distributor
}

export type PeopleFilter = {
  role?: UserRole
  distributorOnly?: boolean
  activeStatus?: 'all' | 'active' | 'inactive'
  search?: string
}

const PROFILE_COLUMNS =
  'id, auth_user_id, email, phone, full_name, role, commission_percent_override, club_tier, club_joined_at, birthday, document_id, address, city, is_active, notes, bonus_points, is_club_member, rnc, credit_limit_cents, customer_type, created_at'

function readForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k)
    return typeof v === 'string' ? v.trim() : ''
  }
  const optional = (k: string) => {
    const v = get(k)
    return v.length === 0 ? null : v
  }
  const optionalNum = (k: string): number | null => {
    const v = get(k)
    if (v.length === 0) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const num = (k: string, fallback = 0) => {
    const v = formData.get(k)
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const bool = (k: string) => formData.get(k) === 'on' || formData.get(k) === 'true'

  const full_name = get('full_name')
  const role = (get('role') || 'customer') as UserRole
  const club_tier = (get('club_tier') || 'none') as ClubTier
  const club_joined_at = optional('club_joined_at')
  const birthday = optional('birthday')

  // dollars in form → cents in DB
  const credit_limit_dollars = optionalNum('credit_limit')
  const credit_limit_cents = credit_limit_dollars === null
    ? 0
    : Math.round(credit_limit_dollars * 100)

  return {
    full_name,
    role,
    email: optional('email'),
    phone: optional('phone'),
    commission_percent_override: optionalNum('commission_percent_override'),
    club_tier,
    club_joined_at,
    birthday,
    document_id: optional('document_id'),
    address: optional('address'),
    city: optional('city'),
    is_active: bool('is_active'),
    notes: optional('notes'),
    bonus_points: num('bonus_points'),
    is_club_member: bool('is_club_member'),
    rnc: optional('rnc'),
    credit_limit_cents,
    customer_type: optional('customer_type'),
  }
}
export async function listPeople(filter: PeopleFilter = {}): Promise<ProfileListRow[]> {
  const supabase = await createClient()

  let q = supabase.from('profiles').select(PROFILE_COLUMNS)

  if (filter.role) q = q.eq('role', filter.role)
  if (filter.activeStatus === 'active') q = q.eq('is_active', true)
  if (filter.activeStatus === 'inactive') q = q.eq('is_active', false)
  if (filter.search && filter.search.trim().length > 0) {
    const s = filter.search.trim().replace(/%/g, '')
    q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`)
  }

  const { data: rows, error } = await q.order('full_name')
  if (error) throw new Error(error.message)
  if (!rows) return []

  // Fetch warehouse-distributor assignments in one query
  const ids = rows.map((r) => r.id)
  let warehouseByDistributor = new Map<string, string[]>()
  if (ids.length > 0) {
    const { data: whs, error: whErr } = await supabase
      .from('warehouses')
      .select('name, distributor_id')
      .in('distributor_id', ids)
    if (whErr) throw new Error(whErr.message)
    for (const w of whs ?? []) {
      if (!w.distributor_id) continue
      const list = warehouseByDistributor.get(w.distributor_id) ?? []
      list.push(w.name)
      warehouseByDistributor.set(w.distributor_id, list)
    }
  }

  let result: ProfileListRow[] = rows.map((r) => ({
    ...r,
    distributor_for: warehouseByDistributor.get(r.id) ?? [],
  }))

  if (filter.distributorOnly) {
    result = result.filter((r) => r.distributor_for.length > 0)
  }

  return result
}

export async function getProfile(id: string): Promise<Profile | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data as Profile
}

export async function createProfile(formData: FormData) {
  const values = readForm(formData)
  if (!values.full_name) return { error: 'Name is required.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .insert(values)
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/people')
  redirect(`/people/${data.id}/edit?saved=1`)
}

export async function updateProfile(id: string, formData: FormData) {
  const values = readForm(formData)
  if (!values.full_name) return { error: 'Name is required.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/people')
  revalidatePath(`/people/${id}/edit`)
  return { success: true }
}

export async function deleteProfile(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').delete().eq('id', id)
  if (error) {
    // Most likely a FK constraint (sales reference this profile, etc.)
    return { error: 'This person is referenced by other records (sales, warehouses, etc.) and cannot be deleted. Mark as inactive instead.' }
  }

  revalidatePath('/people')
  return { success: true }
}
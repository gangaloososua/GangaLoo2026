'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'

export type WarehouseKind = 'store' | 'fulfillment' | 'virtual'

export type Warehouse = {
  id: string
  name: string
  slug: string
  kind: WarehouseKind
  description: string | null

  distributor_id: string | null
  distributor_commission_percent: number
  manager_id: string | null

  address: string | null
  city: string | null
  region: string | null
  phone: string | null
  whatsapp: string | null
  maps_url: string | null

  is_public: boolean
  display_order: number
  banner_url: string | null
  hero_text: string | null

  is_active: boolean
  created_at: string
}

export type WarehouseListRow = Warehouse & {
  distributor_name: string | null
  manager_name: string | null
}

export type StaffOption = {
  id: string
  full_name: string
}

const WAREHOUSE_COLUMNS =
  'id, name, slug, kind, description, distributor_id, distributor_commission_percent, manager_id, address, city, region, phone, whatsapp, maps_url, is_public, display_order, banner_url, hero_text, is_active, created_at'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function readForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k)
    return typeof v === 'string' ? v.trim() : ''
  }
  const optional = (k: string) => {
    const v = get(k)
    return v.length === 0 ? null : v
  }
  const num = (k: string, fallback = 0) => {
    const v = formData.get(k)
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const bool = (k: string) => formData.get(k) === 'on' || formData.get(k) === 'true'

  const name = get('name')
  const slug = get('slug') || slugify(name) || 'warehouse'
  const kindRaw = get('kind') || 'store'
  const kind = (['store', 'fulfillment', 'virtual'].includes(kindRaw)
    ? kindRaw
    : 'store') as WarehouseKind

  return {
    name,
    slug,
    kind,
    description: optional('description'),
    distributor_id: optional('distributor_id'),
    distributor_commission_percent: num('distributor_commission_percent'),
    manager_id: optional('manager_id'),
    address: optional('address'),
    city: optional('city'),
    region: optional('region'),
    phone: optional('phone'),
    whatsapp: optional('whatsapp'),
    maps_url: optional('maps_url'),
    is_public: bool('is_public'),
    display_order: num('display_order'),
    banner_url: optional('banner_url'),
    hero_text: optional('hero_text'),
    is_active: bool('is_active'),
  }
}

export async function listWarehouses(): Promise<WarehouseListRow[]> {
  await requireOwner()
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('warehouses')
    .select(WAREHOUSE_COLUMNS)
    .order('display_order')
    .order('name')

  if (error) throw new Error(error.message)
  if (!rows) return []

  const profileIds = new Set<string>()
  for (const r of rows) {
    if (r.distributor_id) profileIds.add(r.distributor_id)
    if (r.manager_id) profileIds.add(r.manager_id)
  }

  let nameById = new Map<string, string>()
  if (profileIds.size > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', Array.from(profileIds))
    if (pErr) throw new Error(pErr.message)
    nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? '']))
  }

  return rows.map((r) => ({
    ...r,
    distributor_name: r.distributor_id ? nameById.get(r.distributor_id) ?? null : null,
    manager_name: r.manager_id ? nameById.get(r.manager_id) ?? null : null,
  }))
}

export async function getWarehouse(id: string): Promise<Warehouse | null> {
  await requireOwner()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('warehouses')
    .select(WAREHOUSE_COLUMNS)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data as Warehouse
}

export async function listStaff(): Promise<StaffOption[]> {
  await requireOwner()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name')

  if (error) throw new Error(error.message)
  return (data ?? []).map((p) => ({ id: p.id, full_name: p.full_name ?? '(unnamed)' }))
}

export async function createWarehouse(formData: FormData) {
  await requireOwner()
  const values = readForm(formData)
  if (!values.name) return { error: 'Name is required.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('warehouses')
    .insert(values)
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/warehouses')
  redirect(`/warehouses/${data.id}/edit?saved=1`)
}

export async function updateWarehouse(id: string, formData: FormData) {
  await requireOwner()
  const values = readForm(formData)
  if (!values.name) return { error: 'Name is required.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('warehouses')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/warehouses')
  revalidatePath(`/warehouses/${id}/edit`)
  return { success: true }
}

export async function deleteWarehouse(id: string) {
  await requireOwner()
  const supabase = await createClient()
  const { error } = await supabase.from('warehouses').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/warehouses')
  return { success: true }
}

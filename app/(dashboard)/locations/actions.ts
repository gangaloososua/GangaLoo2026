'use server'
// Round 37b — locations server actions.
//
// create/rename/setActive/delete a storage_location. Gated to non-customer
// staff via requireRole; a distributor may only manage locations in a
// warehouse assigned to them (owner/admin may manage any). RLS on the tables
// is the backstop (staff-only); this is the app-layer gate, mirroring the
// pattern used by transfers/actions.ts.
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/guard'
import { isOwnerEquivalent, type Role } from '@/lib/auth/roles'
import { listWarehousesForDistributor } from '@/lib/stock-transfers'

export type LocationActionResult = { ok: true } | { ok: false; dup?: boolean }

const MANAGER_ROLES = ['owner', 'admin', 'distributor'] as const

async function canUseWarehouse(
  callerId: string,
  callerRole: Role,
  warehouseId: string,
): Promise<boolean> {
  if (isOwnerEquivalent(callerRole)) return true
  const mine = await listWarehousesForDistributor(callerId)
  return mine.some((w) => w.id === warehouseId)
}

async function warehouseOfLocation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  locationId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('storage_locations')
    .select('warehouse_id')
    .eq('id', locationId)
    .single()
  return (data?.warehouse_id as string | undefined) ?? null
}

export async function createLocation(
  warehouseId: string,
  name: string,
): Promise<LocationActionResult> {
  const caller = await requireRole(MANAGER_ROLES)
  const clean = name.trim()
  if (!warehouseId || !clean) return { ok: false }
  if (!(await canUseWarehouse(caller.id, caller.role, warehouseId))) return { ok: false }
  const supabase = await createClient()
  const { error } = await supabase
    .from('storage_locations')
    .insert({ warehouse_id: warehouseId, name: clean })
  if (error) return { ok: false, dup: error.code === '23505' }
  revalidatePath('/locations')
  return { ok: true }
}

export async function renameLocation(
  locationId: string,
  name: string,
): Promise<LocationActionResult> {
  const caller = await requireRole(MANAGER_ROLES)
  const clean = name.trim()
  if (!locationId || !clean) return { ok: false }
  const supabase = await createClient()
  const wh = await warehouseOfLocation(supabase, locationId)
  if (!wh || !(await canUseWarehouse(caller.id, caller.role, wh))) return { ok: false }
  const { error } = await supabase
    .from('storage_locations')
    .update({ name: clean })
    .eq('id', locationId)
  if (error) return { ok: false, dup: error.code === '23505' }
  revalidatePath('/locations')
  return { ok: true }
}

export async function setLocationActive(
  locationId: string,
  active: boolean,
): Promise<LocationActionResult> {
  const caller = await requireRole(MANAGER_ROLES)
  if (!locationId) return { ok: false }
  const supabase = await createClient()
  const wh = await warehouseOfLocation(supabase, locationId)
  if (!wh || !(await canUseWarehouse(caller.id, caller.role, wh))) return { ok: false }
  const { error } = await supabase
    .from('storage_locations')
    .update({ is_active: active })
    .eq('id', locationId)
  if (error) return { ok: false }
  revalidatePath('/locations')
  return { ok: true }
}

export async function deleteLocation(locationId: string): Promise<LocationActionResult> {
  const caller = await requireRole(MANAGER_ROLES)
  if (!locationId) return { ok: false }
  const supabase = await createClient()
  const wh = await warehouseOfLocation(supabase, locationId)
  if (!wh || !(await canUseWarehouse(caller.id, caller.role, wh))) return { ok: false }
  const { error } = await supabase.from('storage_locations').delete().eq('id', locationId)
  if (error) return { ok: false }
  revalidatePath('/locations')
  return { ok: true }
}

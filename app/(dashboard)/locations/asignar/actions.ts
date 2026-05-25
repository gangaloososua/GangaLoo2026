'use server'
// Round 37e/37f — product placement actions (Asignar productos + inline view).
//
// Read/write product_locations: how many units of a product sit in each
// storage_location. Gated to non-customer staff; a distributor may only touch
// locations in a warehouse assigned to them.
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/guard'
import { isOwnerEquivalent, type Role } from '@/lib/auth/roles'
import { listWarehousesForDistributor } from '@/lib/stock-transfers'

export type PlacementRow = { location_id: string; location_name: string; qty: number }
export type LocationProduct = { product_id: string; name: string; sku: string | null; qty: number }
export type PlacementResult = { ok: true } | { ok: false }
export type ListPlacementsResult = { ok: true; rows: PlacementRow[] } | { ok: false }
export type ListLocationProductsResult = { ok: true; rows: LocationProduct[] } | { ok: false }

const MANAGER_ROLES = ['owner', 'admin', 'distributor'] as const

async function canUseWarehouse(callerId: string, role: Role, warehouseId: string): Promise<boolean> {
  if (isOwnerEquivalent(role)) return true
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

// Products placed AT one location (for the inline expand on /locations).
export async function listLocationProducts(
  locationId: string,
): Promise<ListLocationProductsResult> {
  const caller = await requireRole(MANAGER_ROLES)
  if (!locationId) return { ok: false }
  const supabase = await createClient()
  const wh = await warehouseOfLocation(supabase, locationId)
  if (!wh || !(await canUseWarehouse(caller.id, caller.role, wh))) return { ok: false }
  const { data, error } = await supabase
    .from('product_locations')
    .select('qty, product:product_id ( id, name, sku )')
    .eq('location_id', locationId)
  if (error) return { ok: false }
  const rows: LocationProduct[] = ((data ?? []) as any[])
    .filter((r) => r.product)
    .map((r) => ({
      product_id: r.product.id as string,
      name: r.product.name as string,
      sku: (r.product.sku as string | null) ?? null,
      qty: Number(r.qty) || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { ok: true, rows }
}

// Placements for one PRODUCT in a warehouse (for the Asignar productos screen).
export async function listProductPlacements(
  productId: string,
  warehouseId: string,
): Promise<ListPlacementsResult> {
  const caller = await requireRole(MANAGER_ROLES)
  if (!productId || !warehouseId) return { ok: false }
  if (!(await canUseWarehouse(caller.id, caller.role, warehouseId))) return { ok: false }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('product_locations')
    .select('qty, location:location_id ( id, name, warehouse_id )')
    .eq('product_id', productId)
  if (error) return { ok: false }
  const rows: PlacementRow[] = ((data ?? []) as any[])
    .filter((r) => r.location && r.location.warehouse_id === warehouseId)
    .map((r) => ({
      location_id: r.location.id as string,
      location_name: r.location.name as string,
      qty: Number(r.qty) || 0,
    }))
    .sort((a, b) => a.location_name.localeCompare(b.location_name))
  return { ok: true, rows }
}

export async function setPlacement(
  productId: string,
  locationId: string,
  qty: number,
): Promise<PlacementResult> {
  const caller = await requireRole(MANAGER_ROLES)
  if (!productId || !locationId) return { ok: false }
  const supabase = await createClient()
  const wh = await warehouseOfLocation(supabase, locationId)
  if (!wh || !(await canUseWarehouse(caller.id, caller.role, wh))) return { ok: false }

  const n = Math.max(0, Math.floor(Number(qty) || 0))
  if (n <= 0) {
    const { error } = await supabase
      .from('product_locations')
      .delete()
      .eq('product_id', productId)
      .eq('location_id', locationId)
    if (error) return { ok: false }
  } else {
    const { error } = await supabase.from('product_locations').upsert(
      {
        product_id: productId,
        location_id: locationId,
        qty: n,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'product_id,location_id' },
    )
    if (error) return { ok: false }
  }
  revalidatePath('/locations')
  revalidatePath('/locations/asignar')
  return { ok: true }
}

export async function removePlacement(
  productId: string,
  locationId: string,
): Promise<PlacementResult> {
  const caller = await requireRole(MANAGER_ROLES)
  if (!productId || !locationId) return { ok: false }
  const supabase = await createClient()
  const wh = await warehouseOfLocation(supabase, locationId)
  if (!wh || !(await canUseWarehouse(caller.id, caller.role, wh))) return { ok: false }
  const { error } = await supabase
    .from('product_locations')
    .delete()
    .eq('product_id', productId)
    .eq('location_id', locationId)
  if (error) return { ok: false }
  revalidatePath('/locations')
  revalidatePath('/locations/asignar')
  return { ok: true }
}

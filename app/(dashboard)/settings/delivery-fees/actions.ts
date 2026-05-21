'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'
import {
  DELIVERY_FEES_KEY,
  type DeliveryFees,
  type WarehousePickupFee,
} from '@/lib/store-config-types'

// Force any incoming amount to a whole, non-negative cent value.
function toCents(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0
    ? Math.round(x)
    : 0
}

// Trim, drop blanks, de-duplicate case-insensitively (keep first spelling).
function normalizeCities(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of list) {
    if (typeof c !== 'string') continue
    const trimmed = c.trim()
    if (!trimmed) continue
    const fold = trimmed.toLowerCase()
    if (seen.has(fold)) continue
    seen.add(fold)
    out.push(trimmed)
  }
  return out
}

// Keep valid from -> to pairs only: both ids present, from != to, no dupes.
function normalizePickups(list: unknown): WarehousePickupFee[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: WarehousePickupFee[] = []
  for (const p of list) {
    if (!p || typeof p !== 'object') continue
    const row = p as Partial<WarehousePickupFee>
    if (typeof row.fromWarehouseId !== 'string') continue
    if (typeof row.toWarehouseId !== 'string') continue
    if (!row.fromWarehouseId || !row.toWarehouseId) continue
    if (row.fromWarehouseId === row.toWarehouseId) continue
    const pairKey = row.fromWarehouseId + '->' + row.toWarehouseId
    if (seen.has(pairKey)) continue
    seen.add(pairKey)
    out.push({
      fromWarehouseId: row.fromWarehouseId,
      toWarehouseId: row.toWarehouseId,
      feeCents: toCents(row.feeCents),
    })
  }
  return out
}

export async function saveDeliveryFees(
  input: DeliveryFees,
): Promise<{ success: true } | { error: string }> {
  await requireOwner()
  const clean: DeliveryFees = {
    localDeliveryCents: toCents(input?.localDeliveryCents),
    nationalDeliveryCents: toCents(input?.nationalDeliveryCents),
    localCities: normalizeCities(input?.localCities),
    warehousePickupFees: normalizePickups(input?.warehousePickupFees),
  }
  const now = new Date().toISOString()
  const supabase = await createClient()
  const { error } = await supabase
    .from('store_config')
    .upsert([{ key: DELIVERY_FEES_KEY, value: clean, updated_at: now }], {
      onConflict: 'key',
    })
  if (error) return { error: error.message }
  revalidatePath('/settings/delivery-fees')
  revalidatePath('/settings')
  return { success: true as const }
}
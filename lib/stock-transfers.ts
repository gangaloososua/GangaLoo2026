// Round 26d — stock transfers data layer (UI side).
//
// Read-only fetchers for the transfers screens and the distributor dashboard.
// The state-changing work (initiate / receive) goes through the RPCs from
// round-26d via server actions. Quantities are plain unit counts; cost is in
// PESOS on inventory_lots / stock_transfer_items (unit_cost_dop), matching the
// rest of the inventory layer.

import { createClient } from '@/lib/supabase/server'

export type TransferStatus = 'in_transit' | 'received' | 'cancelled'

export type TransferListRow = {
  id: string
  status: string
  from_warehouse_id: string
  from_warehouse_name: string
  to_warehouse_id: string
  to_warehouse_name: string
  initiated_at: string
  received_at: string | null
  item_count: number
  total_qty: number
  notes: string | null
}

export type TransferItem = {
  id: string
  product_id: string
  product_name: string
  product_sku: string | null
  qty: number
  unit_cost_dop: number | null
}

export type TransferDetail = TransferListRow & {
  items: TransferItem[]
}

export type WarehouseOption = { id: string; name: string }

const SELECT_HEADER = `
  id, status, from_warehouse_id, to_warehouse_id, initiated_at, received_at, notes,
  from_wh:from_warehouse_id ( id, name ),
  to_wh:to_warehouse_id ( id, name ),
  items:stock_transfer_items ( id, qty )
`

function mapListRow(row: any): TransferListRow {
  const items = Array.isArray(row.items) ? row.items : []
  return {
    id: row.id,
    status: row.status,
    from_warehouse_id: row.from_warehouse_id,
    from_warehouse_name: row.from_wh?.name ?? '—',
    to_warehouse_id: row.to_warehouse_id,
    to_warehouse_name: row.to_wh?.name ?? '—',
    initiated_at: row.initiated_at,
    received_at: row.received_at,
    item_count: items.length,
    total_qty: items.reduce((s: number, i: any) => s + (Number(i.qty) || 0), 0),
    notes: row.notes ?? null,
  }
}

export async function listTransfers(opts: {
  status?: TransferStatus
  toWarehouseId?: string
  limit?: number
} = {}): Promise<TransferListRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('stock_transfers')
    .select(SELECT_HEADER)
    .order('initiated_at', { ascending: false })
    .limit(opts.limit ?? 100)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.toWarehouseId) q = q.eq('to_warehouse_id', opts.toWarehouseId)
  const { data, error } = await q
  if (error) throw new Error(`listTransfers: ${error.message}`)
  return (data ?? []).map(mapListRow)
}

export async function getTransfer(id: string): Promise<TransferDetail | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('stock_transfers')
    .select(
      `
      id, status, from_warehouse_id, to_warehouse_id, initiated_at, received_at, notes,
      from_wh:from_warehouse_id ( id, name ),
      to_wh:to_warehouse_id ( id, name ),
      items:stock_transfer_items (
        id, qty, unit_cost_dop, product_id,
        product:product_id ( id, name, sku )
      )
    `,
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getTransfer: ${error.message}`)
  if (!data) return null

  const row = data as any
  const items = Array.isArray(row.items) ? row.items : []
  const base = mapListRow({ ...row, items })
  return {
    ...base,
    items: items
      .map((it: any) => ({
        id: it.id,
        product_id: it.product_id,
        product_name: it.product?.name ?? '—',
        product_sku: it.product?.sku ?? null,
        qty: Number(it.qty) || 0,
        unit_cost_dop: it.unit_cost_dop == null ? null : Number(it.unit_cost_dop),
      }))
      .sort((a: TransferItem, b: TransferItem) => a.product_name.localeCompare(b.product_name)),
  }
}

export async function listActiveWarehouses(): Promise<WarehouseOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
  if (error) throw new Error(`listActiveWarehouses: ${error.message}`)
  return (data ?? []).map((w) => ({ id: w.id as string, name: w.name as string }))
}

// The warehouse(s) a distributor runs (warehouses.distributor_id = them).
// One per the agreed model, but returns an array to stay correct if that
// ever changes.
export async function listWarehousesForDistributor(
  profileId: string,
): Promise<WarehouseOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, name')
    .eq('distributor_id', profileId)
    .eq('is_active', true)
    .order('name')
  if (error) throw new Error(`listWarehousesForDistributor: ${error.message}`)
  return (data ?? []).map((w) => ({ id: w.id as string, name: w.name as string }))
}

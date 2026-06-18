// Round 26d — stock transfers data layer (UI side).
//
// Read-only fetchers for the transfers screens and the distributor dashboard.
// The state-changing work (request / approve / decline / receive) goes through
// the RPCs via server actions. Quantities are plain unit counts; cost is in
// PESOS on inventory_lots / stock_transfer_items (unit_cost_dop).
//
// Round 36a — adds the request stage. A 'requested' transfer has NO shipped
// stock_transfer_items yet; its lines live in stock_transfer_requested_items.
// So list counts come from the requested items until it ships (in_transit).
//
// 2026-06-17 — the approve screen now needs to know how much is ACTUALLY in
// the source warehouse, so the owner can't approve more than is on hand.
// listPendingRequests attaches qty_available per requested line, read from
// v_inventory_current (sum of inventory_lots.qty_remaining per product +
// warehouse) — the SAME number approve_stock_transfer consumes against, so the
// dialog cap and the engine agree.

import { createClient } from '@/lib/supabase/server'

export type TransferStatus =
  | 'requested'
  | 'in_transit'
  | 'received'
  | 'rejected'
  | 'cancelled'

export type TransferListRow = {
  id: string
  status: string
  from_warehouse_id: string
  from_warehouse_name: string
  to_warehouse_id: string
  to_warehouse_name: string
  initiated_at: string
  received_at: string | null
  requested_at: string | null
  requested_by_name: string | null
  status_note: string | null
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

export type RequestedItem = {
  id: string
  product_id: string
  product_name: string
  product_sku: string | null
  qty: number
  // How many units are physically in the SOURCE warehouse right now (lot
  // qty_remaining). The approve dialog caps "Send" at min(qty, qty_available).
  qty_available: number
}

export type PendingRequest = TransferListRow & { items: RequestedItem[] }

export type WarehouseOption = { id: string; name: string }

const SELECT_HEADER = `
  id, status, from_warehouse_id, to_warehouse_id,
  initiated_at, received_at, requested_at, requested_by, status_note, notes,
  from_wh:from_warehouse_id ( id, name ),
  to_wh:to_warehouse_id ( id, name ),
  requester:requested_by ( id, full_name ),
  items:stock_transfer_items ( id, qty ),
  req_items:stock_transfer_requested_items ( id, qty )
`

const SELECT_REQUEST = `
  id, status, from_warehouse_id, to_warehouse_id,
  initiated_at, received_at, requested_at, requested_by, status_note, notes,
  from_wh:from_warehouse_id ( id, name ),
  to_wh:to_warehouse_id ( id, name ),
  requester:requested_by ( id, full_name ),
  items:stock_transfer_items ( id, qty ),
  req_items:stock_transfer_requested_items (
    id, qty, product_id,
    product:product_id ( id, name, sku )
  )
`

function mapListRow(row: any): TransferListRow {
  const shipped = Array.isArray(row.items) ? row.items : []
  const requested = Array.isArray(row.req_items) ? row.req_items : []
  // Until a transfer ships, its lines live in the requested-items table.
  const isShipped = row.status === 'in_transit' || row.status === 'received'
  const counted = isShipped ? shipped : requested
  return {
    id: row.id,
    status: row.status,
    from_warehouse_id: row.from_warehouse_id,
    from_warehouse_name: row.from_wh?.name ?? '—',
    to_warehouse_id: row.to_warehouse_id,
    to_warehouse_name: row.to_wh?.name ?? '—',
    initiated_at: row.initiated_at,
    received_at: row.received_at,
    requested_at: row.requested_at ?? null,
    requested_by_name: row.requester?.full_name ?? null,
    status_note: row.status_note ?? null,
    item_count: counted.length,
    total_qty: counted.reduce((s: number, i: any) => s + (Number(i.qty) || 0), 0),
    notes: row.notes ?? null,
  }
}

// availByProduct: product_id -> units on hand in the relevant SOURCE warehouse.
// Passed in so a request's lines show the right available number; defaults to
// 0 (treated as "none available") when a product isn't found in the source.
function mapRequestedItems(
  row: any,
  availByProduct: Record<string, number> = {},
): RequestedItem[] {
  const items = Array.isArray(row.req_items) ? row.req_items : []
  return items
    .map((it: any) => ({
      id: it.id,
      product_id: it.product_id,
      product_name: it.product?.name ?? '—',
      product_sku: it.product?.sku ?? null,
      qty: Number(it.qty) || 0,
      qty_available: availByProduct[it.product_id as string] ?? 0,
    }))
    .sort((a: RequestedItem, b: RequestedItem) =>
      a.product_name.localeCompare(b.product_name),
    )
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

// Owner/admin: all parked requests awaiting a decision, with their lines.
//
// Each request also gets, per line, how many units are actually in its SOURCE
// warehouse right now (qty_available) so the approve dialog can cap "Send" and
// the owner never approves more than is on hand. We read this from
// v_inventory_current (the same view the product search uses, and the same
// lot-derived number approve_stock_transfer consumes against), in ONE batched
// query keyed by (warehouse_id, product_id).
export async function listPendingRequests(): Promise<PendingRequest[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('stock_transfers')
    .select(SELECT_REQUEST)
    .eq('status', 'requested')
    .order('requested_at', { ascending: false })
  if (error) throw new Error(`listPendingRequests: ${error.message}`)

  const rows = data ?? []

  // Gather the distinct source warehouses and product ids across all requests
  // so we can look up on-hand once instead of per line.
  const warehouseIds = new Set<string>()
  const productIds = new Set<string>()
  for (const row of rows as any[]) {
    if (row.from_warehouse_id) warehouseIds.add(row.from_warehouse_id as string)
    const reqItems = Array.isArray(row.req_items) ? row.req_items : []
    for (const it of reqItems) {
      if (it.product_id) productIds.add(it.product_id as string)
    }
  }

  // availByWh: warehouse_id -> { product_id -> qty_on_hand }.
  const availByWh: Record<string, Record<string, number>> = {}
  if (warehouseIds.size > 0 && productIds.size > 0) {
    const { data: stock, error: stockErr } = await supabase
      .from('v_inventory_current')
      .select('product_id, warehouse_id, qty_on_hand')
      .in('warehouse_id', [...warehouseIds])
      .in('product_id', [...productIds])
    if (stockErr) throw new Error(`listPendingRequests stock: ${stockErr.message}`)
    for (const s of stock ?? []) {
      const wh = s.warehouse_id as string
      const pid = s.product_id as string
      if (!availByWh[wh]) availByWh[wh] = {}
      availByWh[wh][pid] = Number(s.qty_on_hand) || 0
    }
  }

  return (rows as any[]).map((row) => ({
    ...mapListRow(row),
    items: mapRequestedItems(row, availByWh[row.from_warehouse_id as string] ?? {}),
  }))
}

// Distributor: everything touching their warehouse (either side) or that they
// requested. Sorted newest-first by the most relevant timestamp.
export async function listTransfersForDistributor(
  profileId: string,
  warehouseId: string,
): Promise<TransferListRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('stock_transfers')
    .select(SELECT_HEADER)
    .or(
      `from_warehouse_id.eq.${warehouseId},to_warehouse_id.eq.${warehouseId},requested_by.eq.${profileId}`,
    )
    .limit(200)
  if (error) throw new Error(`listTransfersForDistributor: ${error.message}`)
  const rows = (data ?? []).map(mapListRow)
  const t = (r: TransferListRow): number => {
    const s = r.received_at || r.initiated_at || r.requested_at
    return s ? Date.parse(s) : 0
  }
  rows.sort((a, b) => t(b) - t(a))
  return rows
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
      .sort((a: TransferItem, b: TransferItem) =>
        a.product_name.localeCompare(b.product_name),
      ),
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

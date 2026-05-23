'use server'

// Round 26d — stock transfer server actions.
//
// initiateTransfer: owner/admin only (RPC re-checks). Creates an in_transit
// transfer, consuming the source FIFO.
// receiveTransfer: gated with requireAdminCaller so distributors pass the
// app-layer gate; the RPC then enforces "owner/admin OR the destination
// warehouse's distributor". Creates destination lots + completes the transfer.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner, requireAdminCaller } from '@/lib/auth/guard'

export type InitiateTransferResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export type InitiateTransferInput = {
  fromWarehouseId: string
  toWarehouseId: string
  notes?: string | null
  items: Array<{ productId: string; qty: number }>
}

export async function initiateTransfer(
  input: InitiateTransferInput,
): Promise<InitiateTransferResult> {
  await requireOwner()

  if (!input.fromWarehouseId || !input.toWarehouseId) {
    return { ok: false, error: 'Source and destination warehouses are required.' }
  }
  if (input.fromWarehouseId === input.toWarehouseId) {
    return { ok: false, error: 'Source and destination must be different.' }
  }
  if (!input.items.length) {
    return { ok: false, error: 'Add at least one product to transfer.' }
  }
  for (const it of input.items) {
    if (!it.productId) return { ok: false, error: 'Each line needs a product.' }
    if (!Number.isFinite(it.qty) || it.qty <= 0) {
      return { ok: false, error: 'Each quantity must be greater than zero.' }
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('initiate_stock_transfer', {
    p_from_warehouse_id: input.fromWarehouseId,
    p_to_warehouse_id: input.toWarehouseId,
    p_items: input.items.map((it) => ({ product_id: it.productId, qty: it.qty })),
    p_notes: input.notes?.trim() || null,
  })
  if (error) return { ok: false, error: error.message }

  const row = data as { id?: string } | null
  if (!row?.id) return { ok: false, error: 'Unexpected response creating transfer.' }

  revalidatePath('/transfers')
  revalidatePath('/inventory')
  return { ok: true, id: row.id }
}

export type ReceiveTransferResult = { ok: true } | { ok: false; error: string }

export async function receiveTransfer(transferId: string): Promise<ReceiveTransferResult> {
  // Distributors must pass — the RPC enforces that the caller is owner/admin
  // OR the distributor who runs the destination warehouse.
  await requireAdminCaller()
  if (!transferId) return { ok: false, error: 'Transfer id is required.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('receive_stock_transfer', {
    p_transfer_id: transferId,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/transfers')
  revalidatePath(`/transfers/${transferId}`)
  revalidatePath('/inventory')
  revalidatePath('/')
  return { ok: true }
}

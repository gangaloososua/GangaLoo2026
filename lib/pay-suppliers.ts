// Data layer for /purchases/pay (Pagar a proveedores).
//
// All read-only. The write is the pay_suppliers_batch RPC, called from the
// server action.
//
// listPendingPurchaseOrders:
//   pending POs (usd_total > 0) with supplier name + an auto-derived suggested
//   expense category. Matching strategy:
//     1) direct link — account_categories.supplier_id = po.supplier_id
//     2) name fallback — account_categories.name (case-insensitive) = supplier.name
//   This handles legacy data where supplier records exist multiple times under
//   different ids and only one is linked to the matching category.
//
// listDopMoneyAccounts:
//   active DOP accounts only — v1 records the receipt in DOP.
//
// listExpenseCategoryOptions:
//   every active expense category with its parent name, for the per-row picker
//   fallback when no automatic match exists.

import { createClient } from '@/lib/supabase/server'

export type PendingPurchaseOrder = {
  id: string
  ordered_at: string
  supplier_id: string
  supplier_name: string
  usd_total: number
  suggested_category_id: string | null
  suggested_category_name: string | null
}

export type MoneyAccountOption = {
  id: string
  name: string
  currency: string
  balance_cents: number
}

export type ExpenseCategoryOption = {
  id: string
  name: string
  parent_id: string | null
  parent_name: string | null
}

export async function listPendingPurchaseOrders(): Promise<PendingPurchaseOrder[]> {
  const supabase = await createClient()
  const { data: pos, error } = await supabase
    .from('purchase_orders')
    .select(
      `
      id, ordered_at, supplier_id, usd_total,
      supplier:supplier_id ( id, name )
    `,
    )
    .eq('status', 'pending')
    .gt('usd_total', 0)
    .order('ordered_at', { ascending: true })
  if (error) throw new Error(`listPendingPurchaseOrders: ${error.message}`)

  // Fetch ALL active expense categories so we can match by supplier_id OR
  // by name without N+1 queries.
  const { data: cats, error: catErr } = await supabase
    .from('account_categories')
    .select('id, name, supplier_id')
    .eq('type', 'expense')
    .eq('is_active', true)
  if (catErr) throw new Error(`listPendingPurchaseOrders categories: ${catErr.message}`)

  const catBySupplierId = new Map<string, { id: string; name: string }>()
  const catByLowerName = new Map<string, { id: string; name: string }>()
  for (const c of (cats ?? []) as any[]) {
    if (c.supplier_id) {
      catBySupplierId.set(c.supplier_id as string, { id: c.id, name: c.name })
    }
    const lower = String(c.name ?? '').trim().toLowerCase()
    if (lower && !catByLowerName.has(lower)) {
      catByLowerName.set(lower, { id: c.id, name: c.name })
    }
  }

  return (pos ?? []).map((p: any) => {
    const supplierName = String(p.supplier?.name ?? '').trim()
    let sugg = catBySupplierId.get(p.supplier_id) ?? null
    if (!sugg && supplierName) {
      sugg = catByLowerName.get(supplierName.toLowerCase()) ?? null
    }
    return {
      id: p.id,
      ordered_at: p.ordered_at,
      supplier_id: p.supplier_id,
      supplier_name: supplierName || '—',
      usd_total: Number(p.usd_total) || 0,
      suggested_category_id: sugg?.id ?? null,
      suggested_category_name: sugg?.name ?? null,
    }
  })
}

export async function listDopMoneyAccounts(): Promise<MoneyAccountOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('money_accounts')
    .select('id, name, currency, balance_cents')
    .eq('is_active', true)
    .eq('currency', 'DOP')
    .order('name')
  if (error) throw new Error(`listDopMoneyAccounts: ${error.message}`)
  return (data ?? []).map((a: any) => ({
    id: a.id as string,
    name: a.name as string,
    currency: a.currency as string,
    balance_cents: Number(a.balance_cents) || 0,
  }))
}

export async function listExpenseCategoryOptions(): Promise<ExpenseCategoryOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('account_categories')
    .select(
      `
      id, name, parent_id,
      parent:parent_id ( id, name )
    `,
    )
    .eq('type', 'expense')
    .eq('is_active', true)
    .order('name')
  if (error) throw new Error(`listExpenseCategoryOptions: ${error.message}`)
  return (data ?? []).map((c: any) => ({
    id: c.id as string,
    name: c.name as string,
    parent_id: c.parent_id ?? null,
    parent_name: c.parent?.name ?? null,
  }))
}

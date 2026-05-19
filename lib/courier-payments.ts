// ============================================================
// Round 14c.4 - Courier payments read surface
//
// SERVER-ONLY data layer. Imports next/headers transitively via
// createClient — do not import this file from a 'use client'
// component.
//
// Read only. No INSERT / UPDATE / DELETE against courier_payments
// or courier_payment_allocations. Writes go through the
// create_courier_payment RPC via app/(dashboard)/courier-payments
// /actions.ts.
//
// Spec: docs/round-14c-courier-payments.md
// ============================================================

import { createClient } from '@/lib/supabase/server'

// ============================================================
// Types
// ============================================================

export type CourierPaymentRow = {
  id: string
  courierId: string
  courierName: string
  paidAt: string // ISO timestamptz
  amountDopTotal: number
  moneyAccountId: string
  moneyAccountName: string
  description: string | null
  reference: string | null
  allocationCount: number
  createdAt: string
}

export type CourierPaymentAllocationRow = {
  id: string
  courierPaymentId: string
  purchaseOrderId: string
  purchaseOrderLegacyId: string | null
  purchaseOrderOrderedAt: string | null
  purchaseOrderStatus: string | null
  supplierId: string | null
  supplierName: string | null
  amountDop: number
  createdAt: string
}

export type ListCourierPaymentsOptions = {
  page?: number
  perPage?: number
  courierId?: string | null
  paidAfter?: string | null // ISO date
  paidBefore?: string | null // ISO date
}

export type ListCourierPaymentsResult = {
  rows: CourierPaymentRow[]
  total: number
  page: number
  perPage: number
}

export type CourierPaymentFilterOptions = {
  couriers: Array<{ id: string; name: string }>
}

// ============================================================
// Internal helpers
// ============================================================

type RawCourierPaymentRow = {
  id: string
  courier_id: string
  paid_at: string
  amount_dop_total: number | string
  money_account_id: string
  description: string | null
  reference: string | null
  created_at: string
}

function toNumber(v: number | string | null): number {
  if (v == null) return 0
  return typeof v === 'string' ? Number(v) : v
}

// ============================================================
// listCourierPayments
// ============================================================

export async function listCourierPayments(
  opts: ListCourierPaymentsOptions = {},
): Promise<ListCourierPaymentsResult> {
  const supabase = await createClient()
  const page = Math.max(1, opts.page ?? 1)
  const perPage = Math.max(1, Math.min(200, opts.perPage ?? 50))
  const from = (page - 1) * perPage
  const to = from + perPage - 1

  let q = supabase
    .from('courier_payments')
    .select(
      'id, courier_id, paid_at, amount_dop_total, money_account_id, description, reference, created_at',
      { count: 'exact' },
    )
    .order('paid_at', { ascending: false })
    .range(from, to)

  if (opts.courierId) q = q.eq('courier_id', opts.courierId)
  if (opts.paidAfter) q = q.gte('paid_at', opts.paidAfter)
  if (opts.paidBefore) q = q.lte('paid_at', opts.paidBefore)

  const { data, error, count } = await q
  if (error) throw error

  const raw = (data ?? []) as RawCourierPaymentRow[]
  const ids = raw.map((r) => r.id)
  const courierIds = Array.from(new Set(raw.map((r) => r.courier_id)))
  const accountIds = Array.from(new Set(raw.map((r) => r.money_account_id)))

  // Attach courier names
  const courierNameById = new Map<string, string>()
  if (courierIds.length > 0) {
    const { data: cs, error: csErr } = await supabase
      .from('suppliers')
      .select('id, name')
      .in('id', courierIds)
    if (csErr) throw csErr
    for (const c of (cs ?? []) as Array<{ id: string; name: string }>) {
      courierNameById.set(c.id, c.name)
    }
  }

  // Attach money-account names
  const accountNameById = new Map<string, string>()
  if (accountIds.length > 0) {
    const { data: ms, error: msErr } = await supabase
      .from('money_accounts')
      .select('id, name')
      .in('id', accountIds)
    if (msErr) throw msErr
    for (const m of (ms ?? []) as Array<{ id: string; name: string }>) {
      accountNameById.set(m.id, m.name)
    }
  }

  // Count allocations per payment
  const allocCountById = new Map<string, number>()
  if (ids.length > 0) {
    const { data: allocs, error: aErr } = await supabase
      .from('courier_payment_allocations')
      .select('courier_payment_id')
      .in('courier_payment_id', ids)
    if (aErr) throw aErr
    for (const a of (allocs ?? []) as Array<{ courier_payment_id: string }>) {
      allocCountById.set(
        a.courier_payment_id,
        (allocCountById.get(a.courier_payment_id) ?? 0) + 1,
      )
    }
  }

  const rows: CourierPaymentRow[] = raw.map((r) => ({
    id: r.id,
    courierId: r.courier_id,
    courierName: courierNameById.get(r.courier_id) ?? '(unknown courier)',
    paidAt: r.paid_at,
    amountDopTotal: toNumber(r.amount_dop_total),
    moneyAccountId: r.money_account_id,
    moneyAccountName: accountNameById.get(r.money_account_id) ?? '(unknown account)',
    description: r.description,
    reference: r.reference,
    allocationCount: allocCountById.get(r.id) ?? 0,
    createdAt: r.created_at,
  }))

  return { rows, total: count ?? 0, page, perPage }
}

// ============================================================
// getCourierPayment
// ============================================================

export async function getCourierPayment(id: string): Promise<CourierPaymentRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('courier_payments')
    .select(
      'id, courier_id, paid_at, amount_dop_total, money_account_id, description, reference, created_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const raw = data as RawCourierPaymentRow

  let courierName = '(unknown courier)'
  {
    const { data: c } = await supabase
      .from('suppliers')
      .select('name')
      .eq('id', raw.courier_id)
      .maybeSingle()
    if (c) courierName = (c as { name: string }).name
  }

  let moneyAccountName = '(unknown account)'
  {
    const { data: m } = await supabase
      .from('money_accounts')
      .select('name')
      .eq('id', raw.money_account_id)
      .maybeSingle()
    if (m) moneyAccountName = (m as { name: string }).name
  }

  const { count } = await supabase
    .from('courier_payment_allocations')
    .select('id', { count: 'exact', head: true })
    .eq('courier_payment_id', raw.id)

  return {
    id: raw.id,
    courierId: raw.courier_id,
    courierName,
    paidAt: raw.paid_at,
    amountDopTotal: toNumber(raw.amount_dop_total),
    moneyAccountId: raw.money_account_id,
    moneyAccountName,
    description: raw.description,
    reference: raw.reference,
    allocationCount: count ?? 0,
    createdAt: raw.created_at,
  }
}

// ============================================================
// getAllocationsForCourierPayment
// ============================================================

export async function getAllocationsForCourierPayment(
  courierPaymentId: string,
): Promise<CourierPaymentAllocationRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('courier_payment_allocations')
    .select('id, courier_payment_id, purchase_order_id, amount_dop, created_at')
    .eq('courier_payment_id', courierPaymentId)
    .order('created_at', { ascending: true })
  if (error) throw error

  type RawAlloc = {
    id: string
    courier_payment_id: string
    purchase_order_id: string
    amount_dop: number | string
    created_at: string
  }
  const raw = (data ?? []) as RawAlloc[]
  const poIds = Array.from(new Set(raw.map((a) => a.purchase_order_id)))

  type PoLite = {
    id: string
    legacy_id: string | null
    ordered_at: string | null
    status: string | null
    supplier_id: string | null
  }
  const poById = new Map<string, PoLite>()
  if (poIds.length > 0) {
    const { data: pos, error: poErr } = await supabase
      .from('purchase_orders')
      .select('id, legacy_id, ordered_at, status, supplier_id')
      .in('id', poIds)
    if (poErr) throw poErr
    for (const p of (pos ?? []) as PoLite[]) {
      poById.set(p.id, p)
    }
  }

  const supplierIds = Array.from(
    new Set(
      Array.from(poById.values())
        .map((p) => p.supplier_id)
        .filter((x): x is string => !!x),
    ),
  )
  const supplierNameById = new Map<string, string>()
  if (supplierIds.length > 0) {
    const { data: ss, error: sErr } = await supabase
      .from('suppliers')
      .select('id, name')
      .in('id', supplierIds)
    if (sErr) throw sErr
    for (const s of (ss ?? []) as Array<{ id: string; name: string }>) {
      supplierNameById.set(s.id, s.name)
    }
  }

  return raw.map((a) => {
    const po = poById.get(a.purchase_order_id) ?? null
    return {
      id: a.id,
      courierPaymentId: a.courier_payment_id,
      purchaseOrderId: a.purchase_order_id,
      purchaseOrderLegacyId: po?.legacy_id ?? null,
      purchaseOrderOrderedAt: po?.ordered_at ?? null,
      purchaseOrderStatus: po?.status ?? null,
      supplierId: po?.supplier_id ?? null,
      supplierName: po?.supplier_id
        ? supplierNameById.get(po.supplier_id) ?? null
        : null,
      amountDop: toNumber(a.amount_dop),
      createdAt: a.created_at,
    }
  })
}

// ============================================================
// getCourierPaymentFilterOptions
// ============================================================

export async function getCourierPaymentFilterOptions(): Promise<CourierPaymentFilterOptions> {
  const supabase = await createClient()
  const { data: cpRows, error: cpErr } = await supabase
    .from('courier_payments')
    .select('courier_id')
    .not('courier_id', 'is', null)
  if (cpErr) throw cpErr

  const courierIds = Array.from(
    new Set(
      ((cpRows ?? []) as Array<{ courier_id: string }>)
        .map((r) => r.courier_id),
    ),
  )

  if (courierIds.length === 0) return { couriers: [] }

  const { data: ss, error: sErr } = await supabase
    .from('suppliers')
    .select('id, name')
    .in('id', courierIds)
    .order('name', { ascending: true })
  if (sErr) throw sErr

  return {
    couriers: ((ss ?? []) as Array<{ id: string; name: string }>).map((s) => ({
      id: s.id,
      name: s.name,
    })),
  }
}

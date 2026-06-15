// app/(dashboard)/us-orders/page.tsx
// US dropship orders — admin list + detail, fulfilment stages, and ledger
// posting (sale income + supplier cost). Owner only.
//
// us_orders is RLS-locked (service-role only) -> read via the admin client,
// like payroll_*. Money accounts + account categories live in owner-readable
// tables -> regular server client (same as payroll/page.tsx).

import { requireOwner } from '@/lib/auth/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { listAccounts } from '@/lib/money-accounts'
import { UsOrdersView } from './us-orders-view'
import type {
  UsOrder,
  UsOrderItem,
  UsTimelineEntry,
  UsOrderStatus,
  MoneyAccountOption,
  AccountCategoryOption,
} from '@/lib/us-orders'

export const dynamic = 'force-dynamic'

type OrderRaw = {
  id: string
  created_at: string
  customer_name: string
  customer_email: string
  customer_phone: string | null
  ship_line1: string
  ship_line2: string | null
  ship_city: string
  ship_state: string
  ship_zip: string
  ship_country: string
  items: unknown
  subtotal_usd: number | string
  shipping_usd: number | string
  tax_usd: number | string
  total_usd: number | string
  status: string
  payment_method: string | null
  payment_ref: string | null
  paid_at: string | null
  supplier_ref: string | null
  supplier_cost_usd: number | string | null
  internal_notes: string | null
  timeline: unknown
  income_transaction_id: string | null
  supplier_transaction_id: string | null
}

type CatRaw = { id: string; name: string; scope: string | null; type: string }

const num = (x: unknown): number => {
  if (typeof x === 'number' && Number.isFinite(x)) return x
  if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return Number(x)
  return 0
}

export default async function UsOrdersPage() {
  await requireOwner()
  const admin = createAdminClient()
  const server = await createClient()

  const [ordRes, catRes, accounts] = await Promise.all([
    admin
      .from('us_orders')
      .select('*')
      .order('created_at', { ascending: false }),
    server
      .from('account_categories')
      .select('id, name, scope, type')
      .in('type', ['income', 'expense'])
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
    listAccounts({ includePrivateAndMixed: true }),
  ])

  if (ordRes.error) throw new Error(ordRes.error.message)
  if (catRes.error) throw new Error(catRes.error.message)

  const orders: UsOrder[] = ((ordRes.data ?? []) as unknown as OrderRaw[]).map((o) => {
    const items: UsOrderItem[] = Array.isArray(o.items)
      ? (o.items as UsOrderItem[]).map((it) => ({
          product_id: String(it.product_id ?? ''),
          name: String(it.name ?? ''),
          slug: String(it.slug ?? ''),
          qty: num(it.qty),
          price_usd: num(it.price_usd),
        }))
      : []
    const timeline: UsTimelineEntry[] = Array.isArray(o.timeline)
      ? (o.timeline as UsTimelineEntry[])
      : []
    return {
      id: o.id,
      createdAt: o.created_at,
      customerName: o.customer_name,
      customerEmail: o.customer_email,
      customerPhone: o.customer_phone,
      shipLine1: o.ship_line1,
      shipLine2: o.ship_line2,
      shipCity: o.ship_city,
      shipState: o.ship_state,
      shipZip: o.ship_zip,
      shipCountry: o.ship_country,
      items,
      subtotalUsd: num(o.subtotal_usd),
      shippingUsd: num(o.shipping_usd),
      taxUsd: num(o.tax_usd),
      totalUsd: num(o.total_usd),
      status: o.status as UsOrderStatus,
      paymentMethod: o.payment_method,
      paymentRef: o.payment_ref,
      paidAt: o.paid_at,
      supplierRef: o.supplier_ref,
      supplierCostUsd: o.supplier_cost_usd == null ? null : num(o.supplier_cost_usd),
      internalNotes: o.internal_notes,
      timeline,
      incomeTransactionId: o.income_transaction_id,
      supplierTransactionId: o.supplier_transaction_id,
    }
  })

  const moneyAccounts: MoneyAccountOption[] = (accounts ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    scope: a.scope,
    currency: a.currency,
  }))

  const cats = (catRes.data ?? []) as unknown as CatRaw[]
  const incomeCategories: AccountCategoryOption[] = cats
    .filter((c) => c.type === 'income')
    .map((c) => ({ id: c.id, name: c.name, scope: c.scope ?? '' }))
  const expenseCategories: AccountCategoryOption[] = cats
    .filter((c) => c.type === 'expense')
    .map((c) => ({ id: c.id, name: c.name, scope: c.scope ?? '' }))

  return (
    <UsOrdersView
      orders={orders}
      moneyAccounts={moneyAccounts}
      incomeCategories={incomeCategories}
      expenseCategories={expenseCategories}
    />
  )
}

'use client'

// Round 16.3 — Discount rules list table
// Round 42  — coupon kind: label + code/channel summary
// Round 85  — bundle kind: label + item list summary
// Edit      — promotion rows get an Edit (pencil) link to /[id]/edit
// 2026-09-26 — grouped boxes (deal slot / kind / store) + closed 'Off / expired' box

import * as React from 'react'
import { useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { setRuleActive, deleteRule } from './actions'
import type { DiscountRuleRow } from '@/lib/discount-rules'

type Props = {
  rules: DiscountRuleRow[]
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatPercent(n: number | null): string {
  if (n == null) return '—'
  return `${n.toFixed(2)}%`
}

function formatKindLabel(kind: string): string {
  switch (kind) {
    case 'customer_override':
      return 'Customer override'
    case 'club_tier':
      return 'Club tier'
    case 'bulk':
      return 'Bulk quantity'
    case 'promotion':
      return 'Promotion'
    case 'logistics_surcharge':
      return 'Logistics surcharge'
    case 'coupon':
      return 'Coupon'
    case 'bundle':
      return 'Bundle'
    default:
      return kind
  }
}

function scopeSummary(r: DiscountRuleRow): string {
  // Round 42: coupons summarise differently — code, channel, store.
  if (r.kind === 'coupon') {
    const parts: string[] = []
    if (r.code) parts.push(`Code: ${r.code}`)
    parts.push(
      r.scopeChannel === 'pos'
        ? 'In-person'
        : r.scopeChannel === 'online'
          ? 'Online'
          : 'Online & in-person',
    )
    parts.push(
      r.scopeSourceWarehouseName
        ? `Store: ${r.scopeSourceWarehouseName}`
        : 'All stores',
    )
    return parts.join(' • ')
  }

  // Round 85: bundles list their products, e.g. "1× Wig + 1× Shampoo".
  if (r.kind === 'bundle') {
    const items = r.bundleItems
      .map((i) => `${i.qty}× ${i.productName ?? 'Unknown product'}`)
      .join(' + ')
    const store = r.scopeWarehouseName
      ? `Store: ${r.scopeWarehouseName}`
      : 'All stores'
    return [items || 'No products', store].join(' • ')
  }

  const parts: string[] = []
  if (r.scopeCustomerName) parts.push(`Customer: ${r.scopeCustomerName}`)
  if (r.scopeClubTier && r.scopeClubTier !== 'none')
    parts.push(`Tier: ${r.scopeClubTier}`)
  if (r.scopeProductName) parts.push(`Product: ${r.scopeProductName}`)
  if (r.scopeCategoryName) parts.push(`Category: ${r.scopeCategoryName}`)
  if (r.kind === 'bulk' && !r.scopeProductId && !r.scopeCategoryId)
    parts.push('All products')
  if (r.scopeWarehouseName) parts.push(`Warehouse: ${r.scopeWarehouseName}`)
  if (r.scopeSourceWarehouseName)
    parts.push(`From: ${r.scopeSourceWarehouseName}`)
  if (r.scopeFulfillmentWarehouseName)
    parts.push(`To: ${r.scopeFulfillmentWarehouseName}`)
  if (r.thresholdQty != null) parts.push(`Min qty: ${r.thresholdQty}`)
  return parts.join(' • ') || '—'
}

function windowSummary(r: DiscountRuleRow): string {
  if (!r.startsAt && !r.endsAt) return 'Always'
  return `${formatDate(r.startsAt)} → ${formatDate(r.endsAt)}`
}

function amountSummary(r: DiscountRuleRow): string {
  // Round 85: a bundle's deltaCents is its set TOTAL price, not a discount.
  if (r.kind === 'bundle' && r.deltaCents != null)
    return (
      'Price ' +
      new Intl.NumberFormat('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(r.deltaCents / 100) +
      ' DOP'
    )
  if (r.deltaPercent != null) return formatPercent(r.deltaPercent)
  if (r.deltaCents != null)
    return (
      new Intl.NumberFormat('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(r.deltaCents / 100) + ' DOP'
    )
  return '—'
}

export function DiscountRulesListTable({ rules }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleToggleActive(rule: DiscountRuleRow) {
    startTransition(async () => {
      const result = await setRuleActive({
        ruleId: rule.id,
        isActive: !rule.isActive,
      })
      if (!result.ok) {
        toast.error(result.error)
      } else {
        toast.success(rule.isActive ? 'Rule deactivated.' : 'Rule activated.')
      }
    })
  }

  function handleDelete(rule: DiscountRuleRow) {
    if (
      !confirm(
        `Delete rule "${rule.name}"? Hard delete cannot be undone; consider deactivating instead.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await deleteRule({ ruleId: rule.id })
      if (!result.ok) {
        toast.error(result.error)
      } else {
        toast.success('Rule deleted.')
      }
    })
  }

  // Grouped view (2026-09-26): boxes per kind / deal slot / store, with
  // switched-off and expired rules in a closed box at the bottom.
  const [nowMs] = React.useState(() => Date.now())
  const isExpired = (r: DiscountRuleRow) =>
    r.endsAt != null && new Date(r.endsAt).getTime() < nowMs
  const current = rules.filter((r) => r.isActive && !isExpired(r))
  const retired = rules.filter((r) => !r.isActive || isExpired(r))
  const groups = groupRules(current)

  function renderTable(list: DiscountRuleRow[], showKind: boolean) {
    const sorted = [...list].sort((a, b) => b.priority - a.priority)
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[70px]">Active</TableHead>
            <TableHead>Name</TableHead>
            {showKind ? <TableHead>Kind</TableHead> : null}
            <TableHead>Scope</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Window</TableHead>
            <TableHead className="text-right">Priority</TableHead>
            <TableHead className="w-[90px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => (
            <TableRow key={r.id} className={r.isActive ? '' : 'opacity-60'}>
              <TableCell>
                <Button
                  variant={r.isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleToggleActive(r)}
                  disabled={isPending}
                  className="h-7 px-2 text-xs"
                >
                  {r.isActive ? 'On' : 'Off'}
                </Button>
              </TableCell>
              <TableCell className="min-w-[140px] whitespace-normal font-medium">{r.name}</TableCell>
              {showKind ? (
                <TableCell className="text-muted-foreground">{formatKindLabel(r.kind)}</TableCell>
              ) : null}
              <TableCell className="min-w-[220px] whitespace-normal text-xs text-muted-foreground">
                {scopeSummary(r)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {amountSummary(r)}
                {r.commissionPercent != null ? (
                  <div className="text-[11px] text-muted-foreground">
                    Comm. {r.commissionPercent}%
                  </div>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-normal text-xs text-muted-foreground">
                {windowSummary(r)}
                {statusTag(r, nowMs)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.priority}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  {/* Edit is wired for promotion and bundle rules. */}
                  {r.kind === 'promotion' || r.kind === 'bundle' ? (
                    <Button asChild variant="ghost" size="icon" aria-label="Edit rule">
                      <Link href={`/discount-rules/${r.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(r)}
                    disabled={isPending}
                    aria-label="Delete rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="text-sm text-muted-foreground">
            {current.length} running now · {retired.length} off or expired
          </p>
          <Button asChild>
            <Link href="/discount-rules/new">
              <Plus className="mr-1 h-4 w-4" />
              New rule
            </Link>
          </Button>
        </CardContent>
      </Card>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No discount rules yet. Create one to get started.
          </CardContent>
        </Card>
      ) : null}

      {groups.map((g) => (
        <Card key={g.key}>
          <CardContent className="p-0">
            <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-base font-semibold">
                {g.title}
                {g.store ? (
                  <span className="font-normal text-muted-foreground"> · {g.store}</span>
                ) : null}
              </h2>
              <span className="text-xs text-muted-foreground">
                {g.rules.length} {g.rules.length === 1 ? 'rule' : 'rules'}
              </span>
            </div>
            {renderTable(g.rules, false)}
          </CardContent>
        </Card>
      ))}

      {retired.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <details>
              <summary className="cursor-pointer select-none px-4 py-3 text-base font-semibold">
                Off / expired
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {retired.length} {retired.length === 1 ? 'rule' : 'rules'} · click to show
                </span>
              </summary>
              <div className="border-t">{renderTable(retired, true)}</div>
            </details>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

// ----------------------------------------------------------------------
// Grouping for the boxed view.
// Order: daily deals, weekly deals, other promotions (each split by store),
// bundles, coupons, club tiers, customer overrides, bulk, surcharges.
// ----------------------------------------------------------------------
type RuleGroup = {
  key: string
  title: string
  store: string | null
  rules: DiscountRuleRow[]
}

const GROUP_ORDER: Array<{ id: string; title: string; byStore: boolean }> = [
  { id: 'daily', title: 'Ofertas del día', byStore: true },
  { id: 'weekly', title: 'Ofertas de la semana', byStore: true },
  { id: 'promotion', title: 'Other promotions', byStore: true },
  { id: 'bundle', title: 'Combos (bundles)', byStore: false },
  { id: 'coupon', title: 'Coupons', byStore: false },
  { id: 'club_tier', title: 'Club tiers', byStore: false },
  { id: 'customer_override', title: 'Customer overrides', byStore: false },
  { id: 'bulk', title: 'Bulk quantity', byStore: false },
  { id: 'logistics_surcharge', title: 'Surcharges', byStore: false },
]

function groupId(r: DiscountRuleRow): string {
  if (r.kind === 'promotion') return r.dealSlot ?? 'promotion'
  return r.kind
}

function groupRules(list: DiscountRuleRow[]): RuleGroup[] {
  const out: RuleGroup[] = []
  const known = new Set(GROUP_ORDER.map((g) => g.id))
  for (const g of GROUP_ORDER) {
    const inGroup = list.filter((r) => groupId(r) === g.id)
    if (inGroup.length === 0) continue
    if (!g.byStore) {
      out.push({ key: g.id, title: g.title, store: null, rules: inGroup })
      continue
    }
    const stores = new Map<string, DiscountRuleRow[]>()
    for (const r of inGroup) {
      const store = r.scopeWarehouseName ?? 'All stores'
      stores.set(store, [...(stores.get(store) ?? []), r])
    }
    const names = [...stores.keys()].sort((a, b) =>
      a === 'All stores' ? 1 : b === 'All stores' ? -1 : a.localeCompare(b),
    )
    for (const name of names) {
      out.push({ key: `${g.id}:${name}`, title: g.title, store: name, rules: stores.get(name)! })
    }
  }
  const other = list.filter((r) => !known.has(groupId(r)))
  if (other.length > 0) out.push({ key: 'other', title: 'Other', store: null, rules: other })
  return out
}

function statusTag(r: DiscountRuleRow, nowMs: number): React.ReactNode {
  if (!r.isActive) return null
  if (r.endsAt && new Date(r.endsAt).getTime() < nowMs) {
    return <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">Expired</span>
  }
  if (r.startsAt && new Date(r.startsAt).getTime() > nowMs) {
    return <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">Upcoming</span>
  }
  return <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">Live</span>
}

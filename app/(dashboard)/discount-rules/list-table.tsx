'use client'

// Round 16.3 — Discount rules list table

import * as React from 'react'
import { useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
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
    default:
      return kind
  }
}

function scopeSummary(r: DiscountRuleRow): string {
  const parts: string[] = []
  if (r.scopeCustomerName) parts.push(`Customer: ${r.scopeCustomerName}`)
  if (r.scopeClubTier && r.scopeClubTier !== 'none')
    parts.push(`Tier: ${r.scopeClubTier}`)
  if (r.scopeProductName) parts.push(`Product: ${r.scopeProductName}`)
  if (r.scopeCategoryName) parts.push(`Category: ${r.scopeCategoryName}`)
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
  if (r.deltaPercent != null) return formatPercent(r.deltaPercent)
  if (r.deltaCents != null)
    return new Intl.NumberFormat('en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(r.deltaCents / 100) + ' DOP'
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
        toast.success(
          rule.isActive ? 'Rule deactivated.' : 'Rule activated.',
        )
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

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <Card>
        <CardContent className="flex items-center justify-end py-4">
          <Button asChild>
            <Link href="/discount-rules/new">
              <Plus className="mr-1 h-4 w-4" />
              New rule
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Active</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Window</TableHead>
                <TableHead className="text-right">Priority</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No discount rules yet. Create one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((r) => (
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
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatKindLabel(r.kind)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {scopeSummary(r)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {amountSummary(r)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {windowSummary(r)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.priority}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(r)}
                        disabled={isPending}
                        aria-label="Delete rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

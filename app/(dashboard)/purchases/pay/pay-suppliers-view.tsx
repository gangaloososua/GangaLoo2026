'use client'

import {
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDOP, formatDate } from '@/lib/format'
import type {
  PendingPurchaseOrder,
  MoneyAccountOption,
  ExpenseCategoryOption,
} from '@/lib/pay-suppliers'
import { paySuppliersBatch } from './pay-suppliers-actions'

type RowState = { included: boolean; dopStr: string; categoryId: string }

type CategoryGroup = {
  top: ExpenseCategoryOption
  children: ExpenseCategoryOption[]
}

function parseDopToCents(s: string): number {
  const cleaned = (s || '').replace(/,/g, '').trim()
  if (!cleaned) return 0
  const n = Number(cleaned)
  if (!isFinite(n) || n <= 0) return 0
  return Math.round(n * 100)
}

function nowLocalIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

const inputCls = 'w-full rounded-md border px-3 py-2 text-sm'
const selectCls = 'w-full rounded-md border bg-background px-3 py-2 text-sm'
const numericCls = 'rounded-md border px-3 py-2 text-sm text-right tabular-nums'

// Grouped category <select>: top-level sections via <optgroup>, sub-categories
// nested + sorted underneath. Parents that have children are also selectable
// as "<name> (general)".
function CategorySelect({
  value,
  onChange,
  disabled,
  groups,
  orphans,
}: {
  value: string
  onChange: (id: string) => void
  disabled: boolean
  groups: CategoryGroup[]
  orphans: ExpenseCategoryOption[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`${selectCls} ${disabled ? 'opacity-50' : ''}`}
    >
      <option value="">— Pick category —</option>
      {groups.map((g) =>
        g.children.length > 0 ? (
          <optgroup key={g.top.id} label={g.top.name}>
            <option value={g.top.id}>{g.top.name} (general)</option>
            {g.children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={g.top.id} value={g.top.id}>
            {g.top.name}
          </option>
        ),
      )}
      {orphans.length > 0 && (
        <optgroup label="Other">
          {orphans.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

export function PaySuppliersView({
  pendingPOs,
  accounts,
  expenseCategories,
}: {
  pendingPOs: PendingPurchaseOrder[]
  accounts: MoneyAccountOption[]
  expenseCategories: ExpenseCategoryOption[]
}) {
  const router = useRouter()
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [paidAt, setPaidAt] = useState(nowLocalIso())
  const [reference, setReference] = useState('')
  const [officialRate, setOfficialRate] = useState('')
  const [totalDop, setTotalDop] = useState('')
  const [notes, setNotes] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {}
    for (const po of pendingPOs) {
      init[po.id] = {
        included: false,
        dopStr: '',
        categoryId: po.suggested_category_id ?? '',
      }
    }
    return init
  })

  // Group categories once: top-levels (sorted), each with its children (sorted);
  // orphans (child whose parent isn't in the active set) collected separately.
  const { groups, orphans } = useMemo(() => {
    const tops = expenseCategories.filter((c) => !c.parent_id)
    const topIds = new Set(tops.map((t) => t.id))
    const childrenByParent = new Map<string, ExpenseCategoryOption[]>()
    const orphanList: ExpenseCategoryOption[] = []
    for (const c of expenseCategories) {
      if (!c.parent_id) continue
      if (topIds.has(c.parent_id)) {
        const arr = childrenByParent.get(c.parent_id) ?? []
        arr.push(c)
        childrenByParent.set(c.parent_id, arr)
      } else {
        orphanList.push(c)
      }
    }
    const byName = (a: ExpenseCategoryOption, b: ExpenseCategoryOption) =>
      a.name.localeCompare(b.name)
    const grouped: CategoryGroup[] = tops
      .slice()
      .sort(byName)
      .map((top) => ({
        top,
        children: (childrenByParent.get(top.id) ?? []).slice().sort(byName),
      }))
    return { groups: grouped, orphans: orphanList.slice().sort(byName) }
  }, [expenseCategories])

  const totalDopCents = useMemo(() => parseDopToCents(totalDop), [totalDop])
  const officialRateNum = useMemo(() => {
    const n = Number(officialRate)
    return isFinite(n) && n > 0 ? n : 0
  }, [officialRate])
  const allocatedCents = useMemo(() => {
    let total = 0
    for (const po of pendingPOs) {
      const r = rows[po.id]
      if (r?.included) total += parseDopToCents(r.dopStr)
    }
    return total
  }, [pendingPOs, rows])
  const includedCount = useMemo(
    () => pendingPOs.filter((p) => rows[p.id]?.included).length,
    [pendingPOs, rows],
  )
  const remainingCents = totalDopCents - allocatedCents

  const updateRow = (poId: string, patch: Partial<RowState>) => {
    setRows((r) => ({ ...r, [poId]: { ...r[poId], ...patch } }))
  }

  const toggleIncluded = (poId: string, next: boolean) => {
    setRows((r) => ({
      ...r,
      [poId]: {
        ...r[poId],
        included: next,
        dopStr: next ? r[poId]?.dopStr ?? '' : '',
      },
    }))
  }

  const fillProportionally = () => {
    if (totalDopCents <= 0) {
      setError('Set the total bank withdrawal first.')
      return
    }
    const included = pendingPOs.filter((p) => rows[p.id]?.included)
    if (included.length === 0) {
      setError('Tick the orders you want to pay first.')
      return
    }
    setError(null)
    const usdSum = included.reduce((s, p) => s + p.usd_total, 0)
    if (usdSum <= 0) return

    const next: Record<string, RowState> = { ...rows }
    let assigned = 0
    included.forEach((po, idx) => {
      const cents =
        idx === included.length - 1
          ? totalDopCents - assigned
          : Math.round((po.usd_total / usdSum) * totalDopCents)
      if (idx !== included.length - 1) assigned += cents
      next[po.id] = { ...next[po.id], dopStr: (cents / 100).toFixed(2) }
    })
    setRows(next)
  }

  const submit = () => {
    setError(null)
    if (!accountId) {
      setError('Choose an account.')
      return
    }
    if (officialRateNum <= 0) {
      setError('Official rate must be greater than 0.')
      return
    }
    if (totalDopCents <= 0) {
      setError('Enter the total bank withdrawal.')
      return
    }
    if (includedCount === 0) {
      setError('Tick the orders you want to pay.')
      return
    }
    if (remainingCents !== 0) {
      setError(
        `Allocations must sum exactly to the total — off by ${formatDOP(Math.abs(remainingCents))}.`,
      )
      return
    }

    const allocations = pendingPOs
      .map((po) => {
        const r = rows[po.id]
        if (!r?.included) return null
        const cents = parseDopToCents(r.dopStr)
        if (cents <= 0) return null
        return { poId: po.id, dopAmountCents: cents, categoryId: r.categoryId ?? '' }
      })
      .filter(
        (x): x is { poId: string; dopAmountCents: number; categoryId: string } =>
          x !== null,
      )

    if (allocations.length === 0) {
      setError('Allocate to at least one order (greater than 0).')
      return
    }
    for (const a of allocations) {
      if (!a.categoryId) {
        const po = pendingPOs.find((p) => p.id === a.poId)
        setError(`Pick an expense category for ${po?.supplier_name ?? 'one of the orders'}.`)
        return
      }
    }

    startTransition(async () => {
      const res = await paySuppliersBatch({
        accountId,
        paidAt: new Date(paidAt).toISOString(),
        reference: reference.trim() || null,
        officialRate: officialRateNum,
        allocations,
        notes: notes.trim() || null,
      })
      if (!res.ok) {
        setError(res.error)
      } else {
        router.push('/purchases')
      }
    })
  }

  const tallyColor =
    totalDopCents === 0
      ? 'text-muted-foreground'
      : remainingCents === 0
        ? 'text-emerald-600'
        : 'text-rose-600'

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bank withdrawal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="From account">
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={selectCls}
              >
                <option value="">— Pick an account —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Paid on">
              <input
                type="datetime-local"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Bank reference">
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. BR-2026-05-27-001"
                className={inputCls}
              />
            </Field>
            <Field label="Official rate (DOP / USD)">
              <input
                type="number"
                step="0.0001"
                min="0"
                value={officialRate}
                onChange={(e) => setOfficialRate(e.target.value)}
                placeholder="62.5"
                className={inputCls}
              />
            </Field>
            <Field label="Total bank withdrawal (DOP)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={totalDop}
                onChange={(e) => setTotalDop(e.target.value)}
                placeholder="21276.79"
                className={inputCls}
              />
            </Field>
            <Field label="Notes (optional)">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">
            Pending orders
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({includedCount} of {pendingPOs.length} selected)
            </span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={fillProportionally}
            disabled={pending || totalDopCents <= 0 || includedCount === 0}
          >
            Split proportionally
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {pendingPOs.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">
              No pending orders to pay.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 font-medium" style={{ width: 36 }}></th>
                    <th className="px-3 py-2 font-medium">Supplier</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">USD</th>
                    <th className="px-3 py-2 text-right font-medium">Fair share</th>
                    <th className="px-3 py-2 text-right font-medium">DOP allocated</th>
                    <th className="px-6 py-2 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pendingPOs.map((po) => {
                    const row = rows[po.id]
                    const fairShare =
                      officialRateNum > 0 ? po.usd_total * officialRateNum : 0
                    const enabled = !!row?.included
                    const dim = enabled ? '' : 'opacity-50'
                    return (
                      <tr key={po.id} className={enabled ? 'bg-muted/20' : ''}>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => toggleIncluded(po.id, e.target.checked)}
                            className="h-4 w-4"
                            aria-label={`Include ${po.supplier_name}`}
                          />
                        </td>
                        <td className={`px-3 py-2 ${dim}`}>{po.supplier_name}</td>
                        <td
                          className={`whitespace-nowrap px-3 py-2 text-muted-foreground ${dim}`}
                        >
                          {formatDate(po.ordered_at)}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${dim}`}>
                          ${po.usd_total.toFixed(2)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums text-muted-foreground ${dim}`}
                        >
                          {fairShare > 0 ? fairShare.toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row?.dopStr ?? ''}
                            onChange={(e) => updateRow(po.id, { dopStr: e.target.value })}
                            placeholder="0.00"
                            disabled={!enabled}
                            className={`${numericCls} w-32 ${enabled ? '' : 'opacity-50'}`}
                          />
                        </td>
                        <td className="px-6 py-2">
                          <CategorySelect
                            value={row?.categoryId ?? ''}
                            onChange={(id) => updateRow(po.id, { categoryId: id })}
                            disabled={!enabled}
                            groups={groups}
                            orphans={orphans}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-baseline justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap gap-6">
            <Stat label="Allocated" value={formatDOP(allocatedCents)} />
            <Stat label="Total" value={formatDOP(totalDopCents)} />
            <Stat label="Remaining" value={formatDOP(remainingCents)} valueCls={tallyColor} />
          </div>
          <Button
            onClick={submit}
            disabled={
              pending || totalDopCents === 0 || includedCount === 0 || remainingCents !== 0
            }
            size="lg"
          >
            {pending ? 'Saving…' : 'Confirm payment'}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="px-6 py-3 text-sm text-rose-600">{error}</CardContent>
        </Card>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function Stat({
  label,
  value,
  valueCls,
}: {
  label: string
  value: string
  valueCls?: string
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${valueCls ?? ''}`}>{value}</div>
    </div>
  )
}

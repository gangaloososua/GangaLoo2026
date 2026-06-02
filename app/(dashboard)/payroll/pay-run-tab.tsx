'use client'

// app/(dashboard)/payroll/pay-run-tab.tsx
// The pay calculator. Pick an employee + date range (with quick presets), and
// it shows: fixed pay components (× periods, editable), + extra-day pay for days
// worked beyond the 5-day Tue–Sat baseline, − attendance deductions, − advances,
// = net to pay. Advances post REAL money to the ledger (account + expense
// category required) and are reversible. Money in CENTS throughout.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addAdvance, removeAdvance, loadPayRunData } from './actions'
import {
  formatDOP,
  countPeriods,
  isoDate,
  parseDate,
  dateRangeList,
  isBaselineWorkDay,
  FREQUENCY_LABEL,
  type PayComponent,
  type PayrollEmployeeRow,
  type AttendanceRecord,
  type AdvanceRecord,
  type MoneyAccountOption,
  type ExpenseCategoryOption,
} from '@/lib/payroll'

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

function pesosToCents(s: string): number {
  const n = Number((s || '').trim())
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0
}

function thisWeek(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = (day + 6) % 7
  const mon = new Date(now)
  mon.setDate(now.getDate() - diffToMon)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { start: isoDate(mon), end: isoDate(sun) }
}
function thisFortnight(): { start: string; end: string } {
  const w = thisWeek()
  const end = parseDate(w.end)
  end.setDate(end.getDate() + 7)
  return { start: w.start, end: isoDate(end) }
}
function thisMonth(): { start: string; end: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  return { start: isoDate(start), end: isoDate(end) }
}

export function PayRunTab({
  employees,
  components,
  moneyAccounts,
  expenseCategories,
}: {
  employees: PayrollEmployeeRow[]
  components: PayComponent[]
  moneyAccounts: MoneyAccountOption[]
  expenseCategories: ExpenseCategoryOption[]
}) {
  const active = employees.filter((e) => e.is_active)
  const [employeeId, setEmployeeId] = useState(active[0]?.id ?? '')
  const init = thisWeek()
  const [start, setStart] = useState(init.start)
  const [end, setEnd] = useState(init.end)

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [advances, setAdvances] = useState<AdvanceRecord[]>([])
  const [loading, setLoading] = useState(false)

  const [periods, setPeriods] = useState<Record<string, number>>({})

  // New-advance form (now requires account + category).
  const [advDate, setAdvDate] = useState(isoDate(new Date()))
  const [advAmount, setAdvAmount] = useState('')
  const [advNote, setAdvNote] = useState('')
  const [advAccount, setAdvAccount] = useState(moneyAccounts[0]?.id ?? '')
  const [advCategory, setAdvCategory] = useState('')
  const [advBusy, setAdvBusy] = useState(false)

  const emp = employees.find((e) => e.id === employeeId) || null
  const empComponents = useMemo(
    () => components.filter((c) => c.employee_id === employeeId && c.is_active),
    [components, employeeId],
  )

  useEffect(() => {
    const next: Record<string, number> = {}
    for (const c of empComponents) next[c.id] = countPeriods(c.frequency, start, end)
    setPeriods(next)
  }, [empComponents, start, end])

  const load = useCallback(async () => {
    if (!employeeId) {
      setAttendance([])
      setAdvances([])
      return
    }
    setLoading(true)
    const res = await loadPayRunData(employeeId, start, end)
    setLoading(false)
    if (res.ok) {
      setAttendance(res.data.attendance)
      setAdvances(res.data.advances)
    } else {
      toast.error(res.error)
    }
  }, [employeeId, start, end])

  useEffect(() => {
    load()
  }, [load])

  function preset(which: 'week' | 'fortnight' | 'month') {
    const r = which === 'week' ? thisWeek() : which === 'fortnight' ? thisFortnight() : thisMonth()
    setStart(r.start)
    setEnd(r.end)
  }

  async function onAddAdvance() {
    if (!employeeId) {
      toast.error('Pick an employee.')
      return
    }
    if (pesosToCents(advAmount) <= 0) {
      toast.error('Enter an advance amount.')
      return
    }
    if (!advAccount) {
      toast.error('Pick the account it was paid from.')
      return
    }
    if (!advCategory) {
      toast.error('Pick an expense category.')
      return
    }
    setAdvBusy(true)
    const res = await addAdvance({
      employeeId,
      advanceDate: advDate,
      amountCents: pesosToCents(advAmount),
      note: advNote,
      moneyAccountId: advAccount,
      categoryId: advCategory,
    })
    setAdvBusy(false)
    if (res.ok) {
      toast.success('Advance recorded (posted to accounting)')
      setAdvAmount('')
      setAdvNote('')
      load()
    } else {
      toast.error(res.error)
    }
  }

  async function onRemoveAdvance(id: string) {
    if (!confirm('Remove this advance? Its accounting entry will be reversed.')) return
    const res = await removeAdvance(id)
    if (res.ok) {
      toast.success('Advance removed and reversed')
      load()
    } else {
      toast.error(res.error)
    }
  }

  const componentLines = empComponents.map((c) => {
    const p = periods[c.id] ?? 0
    return { c, periods: p, subtotal: c.amount_cents * p }
  })
  const payTotal = componentLines.reduce((s, l) => s + l.subtotal, 0)

  const inRange = dateRangeList(start, end)
  const baselineDays = inRange.filter((d) => isBaselineWorkDay(d)).length
  const workedDays = attendance.filter(
    (a) => a.status === 'present' || a.status === 'late',
  ).length
  const extraDays = Math.max(0, workedDays - baselineDays)
  const extraDayRate = emp?.extra_day_pay_cents ?? 0
  const extraPay = extraDays * extraDayRate

  let lateDed = 0
  let absentDed = 0
  for (const a of attendance) {
    if (a.status === 'late') lateDed += a.deduction_cents || 0
    else if (a.status === 'absent') absentDed += a.deduction_cents || 0
  }
  const deductions = lateDed + absentDed
  const advanceTotal = advances.reduce((s, a) => s + (a.amount_cents || 0), 0)

  const net = payTotal + extraPay - deductions - advanceTotal

  if (active.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No active employees yet. Add one in the Employees tab first.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Employee</Label>
          <select
            className={`${selectClass} min-w-[12rem]`}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            {active.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" className="w-40" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" className="w-40" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => preset('week')}>This week</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => preset('fortnight')}>Fortnight</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => preset('month')}>This month</Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="rounded-md border p-4">
        <div className="mb-2 text-sm font-medium">Pay due</div>
        {componentLines.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            This employee has no pay components. Add them in the Employees tab.
          </p>
        ) : (
          <div className="space-y-2">
            {componentLines.map(({ c, periods: p, subtotal }) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                <div className="min-w-[10rem] flex-1">
                  <span className="font-medium">{c.label}</span>{' '}
                  <span className="text-muted-foreground">
                    {formatDOP(c.amount_cents)} · {FREQUENCY_LABEL[c.frequency]}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">×</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    className="h-8 w-16"
                    value={String(p)}
                    onChange={(e) =>
                      setPeriods((prev) => ({
                        ...prev,
                        [c.id]: Math.max(0, Math.round(Number(e.target.value) || 0)),
                      }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">periods</span>
                </div>
                <div className="w-28 text-right font-medium">{formatDOP(subtotal)}</div>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 text-sm font-medium">
              <span>Subtotal</span>
              <span>{formatDOP(payTotal)}</span>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Period counts are auto-suggested from the date range — adjust any if a period is partial.
        </p>
      </div>

      <div className="rounded-md border p-4 text-sm">
        <div className="mb-1 font-medium">Extra days worked</div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {workedDays} worked · {baselineDays} normal (Tue–Sat) → {extraDays} extra ×{' '}
            {formatDOP(extraDayRate)}
          </span>
          <span className="font-medium">+ {formatDOP(extraPay)}</span>
        </div>
        {extraDayRate === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Set an &ldquo;Extra day pay&rdquo; amount on the employee to use this.
          </p>
        )}
      </div>

      <div className="rounded-md border p-4 text-sm">
        <div className="mb-1 font-medium">Deductions (from attendance)</div>
        <div className="flex justify-between text-muted-foreground">
          <span>Late</span>
          <span>− {formatDOP(lateDed)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Absent</span>
          <span>− {formatDOP(absentDed)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t pt-1 font-medium">
          <span>Total deductions</span>
          <span>− {formatDOP(deductions)}</span>
        </div>
      </div>

      <div className="rounded-md border p-4">
        <div className="mb-2 text-sm font-medium">Advances in this range</div>
        {advances.length === 0 ? (
          <p className="mb-3 text-xs text-muted-foreground">No advances in this range.</p>
        ) : (
          <div className="mb-3 space-y-1">
            {advances.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {a.advance_date}
                  {a.note ? ` · ${a.note}` : ''}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium">− {formatDOP(a.amount_cents)}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveAdvance(a.id)}>
                    Remove
                  </Button>
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-1 text-sm font-medium">
              <span>Total advances</span>
              <span>− {formatDOP(advanceTotal)}</span>
            </div>
          </div>
        )}

        <div className="grid items-end gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={advDate} onChange={(e) => setAdvDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount (RD$)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={advAmount}
              onChange={(e) => setAdvAmount(e.target.value)}
              placeholder="1000"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Note</Label>
            <Input value={advNote} onChange={(e) => setAdvNote(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Paid from account</Label>
            <select
              className={selectClass}
              value={advAccount}
              onChange={(e) => setAdvAccount(e.target.value)}
            >
              <option value="">Select account…</option>
              {moneyAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency}{a.scope !== 'business' ? ` · ${a.scope}` : ''})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Expense category</Label>
            <select
              className={selectClass}
              value={advCategory}
              onChange={(e) => setAdvCategory(e.target.value)}
            >
              <option value="">Select category…</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" onClick={onAddAdvance} disabled={advBusy}>
            {advBusy ? 'Adding…' : 'Add advance'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Adding an advance posts it as a real expense from the chosen account.
          Removing it reverses that entry.
        </p>
      </div>

      <div className="rounded-md border-2 border-primary/40 bg-primary/5 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Net to pay
          </span>
          <span className="text-2xl font-bold">{formatDOP(net)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Pay {formatDOP(payTotal)} + extra {formatDOP(extraPay)} − deductions{' '}
          {formatDOP(deductions)} − advances {formatDOP(advanceTotal)}
        </p>
      </div>
    </div>
  )
}

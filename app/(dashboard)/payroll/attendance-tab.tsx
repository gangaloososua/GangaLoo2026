'use client'

// app/(dashboard)/payroll/attendance-tab.tsx
// Whole-month attendance grid. Pick an employee + month; every day shows a
// Present/Late/Absent control. Days are assumed worked unless marked Late or
// Absent, which reveals a per-day deduction box (pre-filled from the employee's
// default). "Save month" upserts the whole month at once. Money in CENTS.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loadAttendance, saveAttendanceMonth } from './actions'
import {
  MONTH_NAMES,
  monthDayList,
  formatDOP,
  type AttendanceStatus,
  type PayrollEmployeeRow,
} from '@/lib/payroll'

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

type DayState = { status: AttendanceStatus; deduction: string; note: string }

function pesosToCents(s: string): number {
  const n = Number((s || '').trim())
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0
}
function centsToPesos(c: number): string {
  return c ? String(c / 100) : ''
}
function weekday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en', {
    weekday: 'short',
  })
}
function dayNum(dateStr: string): string {
  return String(Number(dateStr.split('-')[2]))
}

export function AttendanceTab({
  employees,
}: {
  employees: PayrollEmployeeRow[]
}) {
  const active = employees.filter((e) => e.is_active)
  const now = new Date()
  const [employeeId, setEmployeeId] = useState(active[0]?.id ?? '')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12
  const [days, setDays] = useState<Record<string, DayState>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const emp = employees.find((e) => e.id === employeeId) || null
  const dateList = monthDayList(year, month)

  const load = useCallback(async () => {
    if (!employeeId) {
      setDays({})
      return
    }
    setLoading(true)
    const res = await loadAttendance(employeeId, year, month)
    setLoading(false)
    const base: Record<string, DayState> = {}
    for (const ds of monthDayList(year, month)) {
      base[ds] = { status: 'present', deduction: '', note: '' }
    }
    if (res.ok) {
      for (const r of res.rows) {
        base[r.work_date] = {
          status: r.status,
          deduction: r.status === 'present' ? '' : centsToPesos(r.deduction_cents),
          note: r.note ?? '',
        }
      }
    } else {
      toast.error(res.error)
    }
    setDays(base)
  }, [employeeId, year, month])

  useEffect(() => {
    load()
  }, [load])

  function setStatus(date: string, status: AttendanceStatus) {
    setDays((prev) => {
      const cur = prev[date] ?? { status: 'present', deduction: '', note: '' }
      let deduction = cur.deduction
      if (status === 'present') {
        deduction = ''
      } else if (!deduction) {
        const def =
          status === 'late'
            ? emp?.default_late_deduction_cents
            : emp?.default_absent_deduction_cents
        deduction = def ? centsToPesos(def) : ''
      }
      return { ...prev, [date]: { ...cur, status, deduction } }
    })
  }
  function setDeduction(date: string, v: string) {
    setDays((prev) => ({
      ...prev,
      [date]: { ...(prev[date] ?? { status: 'present', deduction: '', note: '' }), deduction: v },
    }))
  }
  function setNote(date: string, v: string) {
    setDays((prev) => ({
      ...prev,
      [date]: { ...(prev[date] ?? { status: 'present', deduction: '', note: '' }), note: v },
    }))
  }

  function prevMonth() {
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else {
      setMonth((m) => m - 1)
    }
  }
  function nextMonth() {
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  async function onSave() {
    if (!employeeId) {
      toast.error('Pick an employee.')
      return
    }
    setSaving(true)
    const payload = dateList.map((ds) => {
      const s = days[ds] ?? { status: 'present', deduction: '', note: '' }
      return {
        workDate: ds,
        status: s.status,
        deductionCents: pesosToCents(s.deduction),
        note: s.note,
      }
    })
    const res = await saveAttendanceMonth(employeeId, payload)
    setSaving(false)
    if (res.ok) toast.success('Attendance saved')
    else toast.error(res.error)
  }

  let lateCount = 0
  let absentCount = 0
  let totalDeduction = 0
  for (const ds of dateList) {
    const s = days[ds]
    if (!s) continue
    if (s.status === 'late') {
      lateCount++
      totalDeduction += pesosToCents(s.deduction)
    } else if (s.status === 'absent') {
      absentCount++
      totalDeduction += pesosToCents(s.deduction)
    }
  }

  if (active.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No active employees yet. Add one in the Employees tab first.
      </p>
    )
  }

  return (
    <div className="space-y-4">
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
          <Label className="text-xs">Month</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={prevMonth}>
              ‹
            </Button>
            <div className="min-w-[9rem] text-center text-sm font-medium">
              {MONTH_NAMES[month - 1]} {year}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={nextMonth}>
              ›
            </Button>
          </div>
        </div>
        <div className="ml-auto">
          <Button type="button" onClick={onSave} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save month'}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Days are assumed worked unless you mark them Late or Absent. The deduction
        pre-fills from this employee&apos;s default — change it per day as needed.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-1">
          {dateList.map((ds) => {
            const s = days[ds] ?? { status: 'present', deduction: '', note: '' }
            const isException = s.status === 'late' || s.status === 'absent'
            return (
              <div
                key={ds}
                className="flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-sm"
              >
                <div className="w-20 shrink-0">
                  <span className="font-medium">{dayNum(ds)}</span>{' '}
                  <span className="text-muted-foreground">{weekday(ds)}</span>
                </div>
                <div className="flex gap-1">
                  {(['present', 'late', 'absent'] as AttendanceStatus[]).map((st) => (
                    <Button
                      key={st}
                      type="button"
                      size="sm"
                      variant={s.status === st ? 'default' : 'outline'}
                      onClick={() => setStatus(ds, st)}
                    >
                      {st === 'present' ? 'Present' : st === 'late' ? 'Late' : 'Absent'}
                    </Button>
                  ))}
                </div>
                {isException && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Deduct RD$</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="1"
                      className="h-8 w-28"
                      value={s.deduction}
                      onChange={(e) => setDeduction(ds, e.target.value)}
                      placeholder="0"
                    />
                  </div>
                )}
                <Input
                  className="h-8 min-w-[8rem] flex-1"
                  value={s.note}
                  onChange={(e) => setNote(ds, e.target.value)}
                  placeholder="Note (optional)"
                />
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <span className="font-medium">This month:</span> {lateCount} late ·{' '}
        {absentCount} absent · total deductions {formatDOP(totalDeduction)}
      </div>
    </div>
  )
}

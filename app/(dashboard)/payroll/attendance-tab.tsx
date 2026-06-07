'use client'

// app/(dashboard)/payroll/attendance-tab.tsx
// Whole-month attendance grid. Work week is Tue–Sat; Sun & Mon default to
// "Off" (greyed, no deduction) but can be turned into a normal work day with
// "+ Mark" for the occasional weekend shift. Days are assumed worked unless
// marked Late or Absent, which reveals a per-day deduction box (pre-filled from
// the employee's default). "Save month" upserts the whole month, INCLUDING Off
// days (saved with status 'off'), so a normal day set Off stays Off after a
// refresh. Money in CENTS.

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

// A day in the grid. `off` = a rest day the user hasn't activated (or set Off).
type DayState = { status: AttendanceStatus; deduction: string; note: string; off: boolean }

function pesosToCents(s: string): number {
  const n = Number((s || '').trim())
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0
}
function centsToPesos(c: number): string {
  return c ? String(c / 100) : ''
}
// 0 = Sun, 1 = Mon ... 6 = Sat
function dow(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).getDay()
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
// Rest days by default: Sunday (0) and Monday (1).
function isRestDay(dateStr: string): boolean {
  const d = dow(dateStr)
  return d === 0 || d === 1
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
      base[ds] = {
        status: 'present',
        deduction: '',
        note: '',
        off: isRestDay(ds), // Sun/Mon start as Off when there's no saved row
      }
    }
    if (res.ok) {
      // A saved row is the source of truth. status 'off' -> the day is Off;
      // otherwise it's a recorded work day. (status keeps a sane 'present'
      // value for off rows so "+ Mark" activates cleanly.)
      for (const r of res.rows) {
        const isOff = r.status === 'off'
        base[r.work_date] = {
          status: isOff ? 'present' : r.status,
          deduction:
            r.status === 'late' || r.status === 'absent'
              ? centsToPesos(r.deduction_cents)
              : '',
          note: r.note ?? '',
          off: isOff,
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

  function activateDay(date: string) {
    setDays((prev) => {
      const cur = prev[date] ?? { status: 'present', deduction: '', note: '', off: true }
      return { ...prev, [date]: { ...cur, off: false } }
    })
  }
  function makeOff(date: string) {
    setDays((prev) => {
      const cur = prev[date] ?? { status: 'present', deduction: '', note: '', off: false }
      return { ...prev, [date]: { ...cur, off: true, status: 'present', deduction: '' } }
    })
  }
  function setStatus(date: string, status: AttendanceStatus) {
    setDays((prev) => {
      const cur = prev[date] ?? { status: 'present', deduction: '', note: '', off: false }
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
      [date]: { ...(prev[date] ?? { status: 'present', deduction: '', note: '', off: false }), deduction: v },
    }))
  }
  function setNote(date: string, v: string) {
    setDays((prev) => ({
      ...prev,
      [date]: { ...(prev[date] ?? { status: 'present', deduction: '', note: '', off: false }), note: v },
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
    // Save every day's true state, including Off (status 'off'), so an Off day
    // persists and overwrites any earlier worked record for that date.
    const payload = dateList
      .map((ds) => ({ ds, s: days[ds] }))
      .filter((x) => !!x.s)
      .map(({ ds, s }) => ({
        workDate: ds,
        status: (s!.off ? 'off' : s!.status) as AttendanceStatus,
        deductionCents: s!.off ? 0 : pesosToCents(s!.deduction),
        note: s!.note,
      }))
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
    if (!s || s.off) continue
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
        Work week is Tue–Sat. Sun &amp; Mon show as Off — tap &ldquo;+ Mark&rdquo; if
        someone worked one. Days are assumed worked unless marked Late or Absent;
        the deduction pre-fills from this employee&apos;s default.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-1">
          {dateList.map((ds) => {
            const s = days[ds] ?? {
              status: 'present' as AttendanceStatus,
              deduction: '',
              note: '',
              off: isRestDay(ds),
            }

            // Off day: greyed, with a "+ Mark" to activate it.
            if (s.off) {
              return (
                <div
                  key={ds}
                  className="flex items-center gap-2 rounded border border-dashed px-3 py-2 text-sm text-muted-foreground"
                >
                  <div className="w-20 shrink-0">
                    <span className="font-medium">{dayNum(ds)}</span>{' '}
                    <span>{weekday(ds)}</span>
                  </div>
                  <span className="italic">Off</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => activateDay(ds)}
                  >
                    + Mark
                  </Button>
                </div>
              )
            }

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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => makeOff(ds)}
                >
                  Set Off
                </Button>
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

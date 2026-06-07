'use client'

// Reports - Balance Sheet snapshot controls.
//
// A "Live (today) / saved month" dropdown plus a "Save this month's snapshot"
// button. Also auto-banks the current month the first time the page is opened
// in a month that has no snapshot yet, so history keeps building hands-off.

import { useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { saveSnapshotAction } from './actions'

type Meta = { period_month: string; captured_at: string }

function monthLabel(iso: string): string {
  // 'YYYY-MM-DD' -> 'June 2026'
  const [y, m] = iso.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export function SnapshotControls({
  months,
  selectedMonth,
  currentMonthIso,
}: {
  months: Meta[]
  selectedMonth: string | null
  currentMonthIso: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const autoTried = useRef(false)

  // Bank the current month once, the first visit of a new month.
  useEffect(() => {
    if (autoTried.current) return
    autoTried.current = true
    const haveThisMonth = months.some((mo) => mo.period_month === currentMonthIso)
    if (!haveThisMonth) {
      startTransition(async () => {
        await saveSnapshotAction()
        router.refresh()
      })
    }
  }, [months, currentMonthIso, router])

  function onSelect(value: string) {
    if (value === 'live') router.push('/reports/balance-sheet')
    else router.push(`/reports/balance-sheet?month=${value}`)
  }

  function onSaveNow() {
    startTransition(async () => {
      await saveSnapshotAction()
      router.push('/reports/balance-sheet')
      router.refresh()
    })
  }

  const value = selectedMonth ?? 'live'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value}
        onChange={(e) => onSelect(e.target.value)}
        disabled={pending}
        className="h-9 rounded-md border bg-card px-2 text-sm"
        aria-label="Balance sheet date"
      >
        <option value="live">Live (today)</option>
        {months.map((mo) => (
          <option key={mo.period_month} value={mo.period_month}>
            {monthLabel(mo.period_month)}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onSaveNow}
        disabled={pending}
      >
        {pending ? 'Saving...' : "Save this month's snapshot"}
      </Button>
    </div>
  )
}

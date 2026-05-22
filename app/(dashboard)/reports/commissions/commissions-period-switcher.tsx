'use client'

// Reports - Commissions period switcher. Mirrors the sales switcher; pushes to
// /reports/commissions with ?period= (and ?start=/?end= for custom).

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const BASE = '/reports/commissions'

const OPTIONS: { value: string; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'this-year', label: 'This year' },
]

export function CommissionsPeriodSwitcher({
  current,
  start,
  end,
}: {
  current: string
  start: string
  end: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showCustom, setShowCustom] = useState(current === 'custom')
  const [from, setFrom] = useState(start)
  const [to, setTo] = useState(end)

  function select(value: string) {
    setShowCustom(value === 'custom')
    if (value === 'custom') return
    const params = new URLSearchParams(searchParams.toString())
    params.delete('start')
    params.delete('end')
    if (value === 'this-month') params.delete('period')
    else params.set('period', value)
    const qs = params.toString()
    router.push(qs ? `${BASE}?${qs}` : BASE)
  }

  function applyCustom() {
    if (!from || !to) return
    const params = new URLSearchParams()
    params.set('period', 'custom')
    params.set('start', from)
    params.set('end', to)
    router.push(`${BASE}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="inline-flex rounded-md border bg-card p-0.5">
        {OPTIONS.map((o) => (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={o.value === current ? 'default' : 'ghost'}
            className="h-8"
            onClick={() => select(o.value)}
          >
            {o.label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={current === 'custom' ? 'default' : 'ghost'}
          className="h-8"
          onClick={() => select('custom')}
        >
          Custom
        </Button>
      </div>

      {showCustom ? (
        <div className="inline-flex flex-wrap items-center gap-2 rounded-md border bg-card px-2 py-1.5">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-7 rounded border bg-background px-2 text-sm"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-7 rounded border bg-background px-2 text-sm"
          />
          <Button type="button" size="sm" className="h-7" onClick={applyCustom} disabled={!from || !to}>
            Apply
          </Button>
        </div>
      ) : null}
    </div>
  )
}

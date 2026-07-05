'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

// Round 25a - dashboard period switcher.
// Updates the ?period= query param; the server page re-renders with new data.

// The dashboard lives at /panel (not /). Navigate there so ?period= is read
// by the dashboard page instead of falling through to the landing page.
const BASE = '/panel'

const OPTIONS: { value: string; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-30', label: 'Last 30 days' },
  { value: 'this-year', label: 'This year' },
]

export function DashboardPeriodSwitcher({ current }: { current: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'this-month') params.delete('period')
    else params.set('period', value)
    const qs = params.toString()
    router.push(qs ? `${BASE}?${qs}` : BASE)
  }

  return (
    <div className="inline-flex rounded-md border bg-card p-0.5">
      {OPTIONS.map((o) => {
        const active = o.value === current
        return (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={active ? 'default' : 'ghost'}
            className="h-8"
            onClick={() => select(o.value)}
          >
            {o.label}
          </Button>
        )
      })}
    </div>
  )
}

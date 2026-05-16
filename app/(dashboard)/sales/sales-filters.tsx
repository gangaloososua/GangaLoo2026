'use client'

import { useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type LookupItem = { id: string; name: string }

type Props = {
  sellers: LookupItem[]
  warehouses: LookupItem[]
  currentFilters: {
    search: string
    status: string
    sellerId: string
    warehouseId: string
    dateFrom: string
    dateTo: string
  }
}

// Sentinel for "no filter" inside <Select>. Radix Select forbids an empty
// string as an item value, so we use this token and translate it back to
// an absent URL param.
const ALL = '__all__'

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'paid', label: 'Paid' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function SalesFilters({ sellers, warehouses, currentFilters }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === '' || value === ALL) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    // Any filter change resets pagination
    params.delete('page')
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  function clearAll() {
    startTransition(() => {
      router.push(pathname)
    })
  }

  const hasAny =
    !!currentFilters.search ||
    !!currentFilters.status ||
    !!currentFilters.sellerId ||
    !!currentFilters.warehouseId ||
    !!currentFilters.dateFrom ||
    !!currentFilters.dateTo

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1">
          <Label htmlFor="f-search" className="text-xs">
            Invoice
          </Label>
          <Input
            id="f-search"
            placeholder="FAC-2885…"
            defaultValue={currentFilters.search}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim()
              if (v !== currentFilters.search) update('search', v)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = e.currentTarget.value.trim()
                if (v !== currentFilters.search) update('search', v)
              }
            }}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select
            value={currentFilters.status || ALL}
            onValueChange={(v) => update('status', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Seller</Label>
          <Select
            value={currentFilters.sellerId || ALL}
            onValueChange={(v) => update('sellerId', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any seller" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any seller</SelectItem>
              {sellers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Warehouse</Label>
          <Select
            value={currentFilters.warehouseId || ALL}
            onValueChange={(v) => update('warehouseId', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any warehouse" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any warehouse</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="f-from" className="text-xs">
            From
          </Label>
          <Input
            id="f-from"
            type="date"
            defaultValue={currentFilters.dateFrom}
            onChange={(e) => update('dateFrom', e.currentTarget.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="f-to" className="text-xs">
            To
          </Label>
          <Input
            id="f-to"
            type="date"
            defaultValue={currentFilters.dateTo}
            onChange={(e) => update('dateTo', e.currentTarget.value)}
          />
        </div>
      </div>

      {hasAny && (
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        </div>
      )}
    </div>
  )
}

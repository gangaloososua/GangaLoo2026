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
import { type Locale, t } from '@/lib/i18n/dictionary'

type LookupItem = { id: string; name: string }

type Props = {
  sellers: LookupItem[]
  warehouses: LookupItem[]
  canFilterBySeller?: boolean
  locale: Locale
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

const STATUS_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: 'draft', labelKey: 'status.draft' },
  { value: 'confirmed', labelKey: 'status.confirmed' },
  { value: 'paid', labelKey: 'status.paid' },
  { value: 'partially_paid', labelKey: 'status.partiallyPaid' },
  { value: 'refunded', labelKey: 'status.refunded' },
  { value: 'cancelled', labelKey: 'status.cancelled' },
]

export function SalesFilters({ sellers, warehouses, currentFilters, canFilterBySeller = true, locale }: Props) {
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
            {t(locale, 'sales.col.invoice')}
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
          <Label className="text-xs">{t(locale, 'sales.col.status')}</Label>
          <Select
            value={currentFilters.status || ALL}
            onValueChange={(v) => update('status', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t(locale, 'filter.anyStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t(locale, 'filter.anyStatus')}</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {t(locale, s.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canFilterBySeller && (
          <div className="space-y-1">
          <Label className="text-xs">{t(locale, 'sales.col.seller')}</Label>
          <Select
            value={currentFilters.sellerId || ALL}
            onValueChange={(v) => update('sellerId', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t(locale, 'filter.anySeller')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t(locale, 'filter.anySeller')}</SelectItem>
              {sellers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">{t(locale, 'sales.col.warehouse')}</Label>
          <Select
            value={currentFilters.warehouseId || ALL}
            onValueChange={(v) => update('warehouseId', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t(locale, 'filter.anyWarehouse')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t(locale, 'filter.anyWarehouse')}</SelectItem>
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
            {t(locale, 'filter.from')}
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
            {t(locale, 'filter.to')}
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
            {t(locale, 'filter.clear')}
          </Button>
        </div>
      )}
    </div>
  )
}

'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { AccountStatementModal } from './account-statement-modal'
import type { MoneyAccount } from '@/lib/money-accounts'
import type { Currency, EffectiveRatesResult } from '@/lib/exchange-rates-types'

// shadcn Select forbids "" as a value; sentinel for "no group filter".
const GROUP_SENTINEL = '__all__'

type CurrentFilters = {
  includePrivateAndMixed: boolean
  includeInactive: boolean
  search: string
  group: string
}

type Props = {
  accounts: MoneyAccount[]
  rates: EffectiveRatesResult
  groupTags: string[]
  currentFilters: CurrentFilters
}

// Currency ordering: DOP, EUR, USD, then others alphabetical.
function currencyOrder(c: string): number {
  switch (c) {
    case 'DOP': return 0
    case 'EUR': return 1
    case 'USD': return 2
    default: return 100 + c.charCodeAt(0)
  }
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatMonth(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  DOP: '₱',
  USD: '$',
  EUR: '€',
}

function formatBalance(cents: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? ''
  const major = cents / 100
  const formatted = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major)
  return `${symbol}${formatted}`
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'bank': return 'Bank'
    case 'cash': return 'Cash'
    case 'card': return 'Card'
    case 'digital': return 'Digital'
    case 'credit_line': return 'Credit line'
    default: return kind
  }
}

function scopeLabel(scope: string): string {
  switch (scope) {
    case 'business': return 'Business'
    case 'private': return 'Private'
    case 'mixed': return 'Mixed'
    default: return scope
  }
}

export function MoneyAccountsListTable({
  accounts,
  rates,
  groupTags,
  currentFilters,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Local input state for snappy typing; URL update is debounced.
  const [searchInput, setSearchInput] = React.useState(currentFilters.search)

  // Stay in sync with external URL changes (back/forward nav).
  React.useEffect(() => {
    setSearchInput(currentFilters.search)
  }, [currentFilters.search])

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (value === null || value === '' || value === GROUP_SENTINEL) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  // Debounce search input -> URL.
  React.useEffect(() => {
    if (searchInput === currentFilters.search) return
    const t = setTimeout(() => {
      updateParam('q', searchInput)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  function setToggle(key: 'private' | 'inactive', on: boolean) {
    updateParam(key, on ? '1' : null)
  }

  // Apply client-side filters: search and group. Privacy/active scoping
  // was already applied by the server fetch.
  const visible = React.useMemo(() => {
    const q = currentFilters.search.trim().toLowerCase()
    const g = currentFilters.group
    return accounts.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q)) return false
      if (g && a.group_tag !== g) return false
      return true
    })
  }, [accounts, currentFilters.search, currentFilters.group])

  // Group by currency, ordered DOP / EUR / USD / others alpha.
  const groups = React.useMemo(() => {
    const map = new Map<string, MoneyAccount[]>()
    for (const a of visible) {
      const list = map.get(a.currency) ?? []
      list.push(a)
      map.set(a.currency, list)
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) => currencyOrder(a) - currencyOrder(b),
    )
  }, [visible])

  // DOP-equivalent grand total + rates lines.
  const { grandTotalDopCents, ratesUsedLine, missingLine } = React.useMemo(() => {
    let total = 0
    const usedParts: string[] = ['DOP (base)']
    const missing: string[] = []

    for (const [currency, list] of groups) {
      const subtotal = list.reduce((s, a) => s + a.balance_cents, 0)
      if (currency === 'DOP') {
        total += subtotal
        continue
      }
      const eff = rates.rates[currency as Currency]
      if (eff) {
        total += subtotal * eff.rate
        usedParts.push(`${currency} via ${formatMonth(eff.year, eff.month)}`)
      } else {
        missing.push(currency)
      }
    }

    // Pick up anything the server flagged as missing too (defensive).
    for (const c of rates.missing) {
      if (!missing.includes(c)) missing.push(c)
    }

    return {
      grandTotalDopCents: Math.round(total),
      ratesUsedLine: `Conversion rates: ${usedParts.join(', ')}`,
      missingLine:
        missing.length > 0
          ? `Missing rates: ${missing.join(', ')} (not included in total)`
          : null,
    }
  }, [groups, rates])

  const showScopeColumn = currentFilters.includePrivateAndMixed

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="grid gap-1.5">
            <Label htmlFor="ma-search" className="text-xs">Search</Label>
            <Input
              id="ma-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Filter by name..."
              className="w-56"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ma-group" className="text-xs">Group</Label>
            <Select
              value={currentFilters.group || GROUP_SENTINEL}
              onValueChange={(v) => updateParam('group', v)}
            >
              <SelectTrigger id="ma-group" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GROUP_SENTINEL}>All groups</SelectItem>
                {groupTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="ma-private"
              checked={currentFilters.includePrivateAndMixed}
              onCheckedChange={(v) => setToggle('private', v)}
            />
            <Label htmlFor="ma-private" className="text-sm">
              Show private + mixed
            </Label>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="ma-inactive"
              checked={currentFilters.includeInactive}
              onCheckedChange={(v) => setToggle('inactive', v)}
            />
            <Label htmlFor="ma-inactive" className="text-sm">
              Show inactive
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Grouped table or empty state */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No accounts match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([currency, list]) => {
            const subtotalCents = list.reduce((s, a) => s + a.balance_cents, 0)
            return (
              <div key={currency} className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {currency}
                  </h2>
                  <div className="text-sm tabular-nums">
                    Subtotal: {formatBalance(subtotalCents, currency)}
                  </div>
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Kind</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Status</TableHead>
                        {showScopeColumn && <TableHead>Scope</TableHead>}
                        <TableHead className="w-24 text-right">Manage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{kindLabel(a.kind)}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {a.group_tag ?? '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatBalance(a.balance_cents, a.currency)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={a.is_active ? 'default' : 'secondary'}>
                              {a.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          {showScopeColumn && (
                            <TableCell>
                              <Badge variant="outline">{scopeLabel(a.scope)}</Badge>
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <AccountStatementModal accountId={a.id} accountName={a.name} />
                              <Button asChild variant="ghost" size="sm">
                                <Link href={`/money-accounts/${a.id}/edit`}>
                                  <Pencil className="mr-1 size-3.5" />
                                  Edit
                                </Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Summary panel */}
      {groups.length > 0 && (
        <Card>
          <CardContent className="space-y-1 pt-6">
            <div className="text-base font-semibold">
              DOP-equivalent total: {formatBalance(grandTotalDopCents, 'DOP')}
            </div>
            <div className="text-sm text-muted-foreground">{ratesUsedLine}</div>
            {missingLine && (
              <div className="text-sm text-amber-700 dark:text-amber-400">
                {missingLine}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

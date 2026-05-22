'use client'

// Per-account "Movimientos" statement modal. Opens from the Money Accounts
// table; lazy-loads the statement via the read-only getAccountStatement action
// the first time it's opened. Read-only in stage 1 (no save yet - that's the
// stage-2 "Recalcular / set starting saldo" control).
//
// SALDO column shows the true running balance at each movement (opening +
// cumulative), computed in SQL across ALL movements. The year/month/tipo
// filters only HIDE rows - they never recompute the saldo, so a filtered view
// still shows each row's real account balance at that point in time (this
// matches how the old system behaved). The header stat cards are always
// account-wide totals, never filter-dependent.
//
// Table layout: table-fixed with explicit column widths so the six columns
// (incl. the money columns) always fit inside the modal; the Descripción
// column takes the remaining width and truncates long text. The scroll box
// uses min-h-0 + flex-1 + overflow-auto so rows stay contained and scroll
// inside the dialog instead of spilling onto the page.

import * as React from 'react'
import { Receipt } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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

import { getAccountStatement } from './statement-actions'
import type {
  AccountStatement,
  StatementMovement,
  StatementTipo,
} from '@/lib/account-statement'

const TIPOS: StatementTipo[] = [
  'Cobros',
  'Transacciones',
  'Compras',
  'Transferencias',
  'Comisiones',
  'Courier',
]

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const CURRENCY_PREFIX: Record<string, string> = {
  DOP: 'RD$',
  USD: 'US$',
  EUR: '€',
}

/** Format cents with the account's currency. Signed (negatives get a minus). */
function money(cents: number, currency: string): string {
  const prefix = CURRENCY_PREFIX[currency] ?? `${currency} `
  const sign = cents < 0 ? '-' : ''
  const n = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100)
  return `${sign}${prefix}${n}`
}

/** Magnitude only (for the entrada/salida columns, where the column itself
 *  already signals the direction). */
function moneyAbs(cents: number, currency: string): string {
  return money(Math.abs(cents), currency)
}

const dateFmt = new Intl.DateTimeFormat('es-DO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d)
}

type Props = {
  accountId: string
  accountName: string
}

export function AccountStatementModal({ accountId, accountName }: Props) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [data, setData] = React.useState<AccountStatement | null>(null)

  // Filters.
  const [tipo, setTipo] = React.useState<'Todos' | StatementTipo>('Todos')
  const [year, setYear] = React.useState<string>('all')
  const [month, setMonth] = React.useState<string>('all')

  // Lazy-load the statement the first time the modal opens.
  React.useEffect(() => {
    if (!open || data) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getAccountStatement(accountId)
      .then((res) => { if (!cancelled) setData(res) })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, accountId, data])

  const currency = data?.account.currency ?? 'DOP'

  // Distinct years present in the movements, newest first.
  const years = React.useMemo(() => {
    if (!data) return [] as number[]
    const set = new Set<number>()
    for (const m of data.movements) {
      const y = new Date(m.occurred_at).getFullYear()
      if (!Number.isNaN(y)) set.add(y)
    }
    return Array.from(set).sort((a, b) => b - a)
  }, [data])

  const visibleMovements = React.useMemo<StatementMovement[]>(() => {
    if (!data) return []
    return data.movements.filter((m) => {
      if (tipo !== 'Todos' && m.tipo !== tipo) return false
      const d = new Date(m.occurred_at)
      if (year !== 'all' && d.getFullYear() !== Number(year)) return false
      if (month !== 'all' && d.getMonth() !== Number(month)) return false
      return true
    })
  }, [data, tipo, year, month])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Receipt className="mr-1 size-3.5" />
          Movimientos
        </Button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[88vh] w-[95vw] flex-col gap-3 overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>📋 Movimientos — {accountName}</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.movement_count} movimientos · Saldo actual: ${money(data.computed_balance_cents, currency)}`
              : 'Cargando movimientos…'}
          </DialogDescription>
        </DialogHeader>

        {/* Header stat cards (always account-wide, never filtered) */}
        {data && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Saldo actual
              </div>
              <div className="text-xl font-bold tabular-nums">
                {money(data.computed_balance_cents, currency)}
              </div>
              {data.computed_balance_cents !== data.stored_balance_cents && (
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  Saldo guardado: {money(data.stored_balance_cents, currency)}
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total entradas
              </div>
              <div className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                + {moneyAbs(data.entradas.total_cents, currency)}
              </div>
              <div className="text-xs text-muted-foreground">
                {data.entradas.count} movimientos
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total salidas
              </div>
              <div className="text-xl font-bold tabular-nums text-red-600 dark:text-red-400">
                − {moneyAbs(data.salidas.total_cents, currency)}
              </div>
              <div className="text-xs text-muted-foreground">
                {data.salidas.count} movimientos
              </div>
            </div>
          </div>
        )}

        {/* Filters: year, month, tipo pills */}
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los años</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los meses</SelectItem>
                {MONTHS_ES.map((name, i) => (
                  <SelectItem key={name} value={String(i)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={tipo === 'Todos' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTipo('Todos')}
              >
                Todos
              </Button>
              {TIPOS.map((t) => (
                <Button
                  key={t}
                  variant={tipo === t ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTipo(t)}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Movements table (contained scroll, fixed column widths) */}
        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          {loading && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Cargando…
            </div>
          )}
          {error && (
            <div className="py-12 text-center text-sm text-red-600">
              No se pudo cargar: {error}
            </div>
          )}
          {data && !loading && (
            <Table className="w-full table-fixed">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-28">Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="w-32">Tipo</TableHead>
                  <TableHead className="w-32 text-right">Entrada</TableHead>
                  <TableHead className="w-32 text-right">Salida</TableHead>
                  <TableHead className="w-32 text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMovements.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No hay movimientos para este filtro.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleMovements.map((m) => {
                    const isIn = m.amount_cents >= 0
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(m.occurred_at)}
                        </TableCell>
                        <TableCell
                          className="truncate font-medium"
                          title={m.description ?? undefined}
                        >
                          {m.description ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{m.tipo}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                          {isIn ? moneyAbs(m.amount_cents, currency) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums text-red-600 dark:text-red-400">
                          {!isIn ? moneyAbs(m.amount_cents, currency) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                          {money(m.saldo_cents, currency)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

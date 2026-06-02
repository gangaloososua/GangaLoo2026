'use client'

// app/(dashboard)/mi-pago/mi-pago-view.tsx
// Read-only self pay view. Week/month toggle with prev/next. Bilingual
// (es for sellers/distributors, en for owner/admin). No edit controls.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { loadMyPay, type MyPaySummary } from './actions'
import { formatDOP, isoDate, parseDate, MONTH_NAMES } from '@/lib/payroll'

type Mode = 'week' | 'month'

function weekRange(offset: number): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = (day + 6) % 7
  const mon = new Date(now)
  mon.setDate(now.getDate() - diffToMon + offset * 7)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { start: isoDate(mon), end: isoDate(sun) }
}
function monthRange(offset: number): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { start: isoDate(start), end: isoDate(end) }
}
function prettyDate(d: string): string {
  const dt = parseDate(d)
  return `${dt.getDate()} ${MONTH_NAMES[dt.getMonth()].slice(0, 3)}`
}

export function MiPagoView({ locale }: { locale: string }) {
  const es = locale === 'es'
  const t = (en: string, esTxt: string) => (es ? esTxt : en)

  const [mode, setMode] = useState<Mode>('week')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<MyPaySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const range = useMemo(
    () => (mode === 'week' ? weekRange(offset) : monthRange(offset)),
    [mode, offset],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    const res = await loadMyPay(range.start, range.end)
    setLoading(false)
    if (res.ok) setData(res.data)
    else setErr(res.error)
  }, [range.start, range.end])

  useEffect(() => {
    load()
  }, [load])

  function setModeReset(m: Mode) {
    setMode(m)
    setOffset(0)
  }

  const label =
    mode === 'week'
      ? `${prettyDate(range.start)} – ${prettyDate(range.end)}`
      : `${MONTH_NAMES[parseDate(range.start).getMonth()]} ${parseDate(range.start).getFullYear()}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('My pay', 'Mi pago')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'Your pay, attendance and advances.',
            'Tu pago, asistencia y adelantos.',
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          <Button
            type="button"
            variant={mode === 'week' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setModeReset('week')}
          >
            {t('Week', 'Semana')}
          </Button>
          <Button
            type="button"
            variant={mode === 'month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setModeReset('month')}
          >
            {t('Month', 'Mes')}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOffset((o) => o - 1)}>
            ‹
          </Button>
          <div className="min-w-[10rem] text-center text-sm font-medium">{label}</div>
          <Button type="button" variant="outline" size="sm" onClick={() => setOffset((o) => o + 1)}>
            ›
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">{t('Loading…', 'Cargando…')}</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}

      {!loading && data && !data.on_payroll && (
        <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
          {t(
            'You are not set up on payroll. Ask the owner if you think this is a mistake.',
            'No estás configurado en nómina. Consulta con el dueño si crees que es un error.',
          )}
        </div>
      )}

      {!loading && data && data.on_payroll && (
        <div className="space-y-4">
          {/* Pay */}
          <div className="rounded-md border p-4">
            <div className="mb-2 text-sm font-medium">{t('Pay', 'Pago')}</div>
            {(data.components ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('No pay set up yet.', 'Aún no hay pago configurado.')}
              </p>
            ) : (
              <div className="space-y-1">
                {(data.components ?? []).map((c, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {c.label} · {formatDOP(c.amount_cents)} × {c.periods}
                    </span>
                    <span className="font-medium">{formatDOP(c.subtotal_cents)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1 text-sm font-medium">
                  <span>{t('Subtotal', 'Subtotal')}</span>
                  <span>{formatDOP(data.pay_total_cents ?? 0)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Extra days */}
          {(data.extra_days ?? 0) > 0 && (
            <div className="rounded-md border p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('Extra days', 'Días extra')} ({data.extra_days})
                </span>
                <span className="font-medium">+ {formatDOP(data.extra_pay_cents ?? 0)}</span>
              </div>
            </div>
          )}

          {/* Deductions */}
          <div className="rounded-md border p-4 text-sm">
            <div className="mb-1 font-medium">{t('Deductions', 'Deducciones')}</div>
            <div className="flex justify-between text-muted-foreground">
              <span>
                {t('Late', 'Tardanzas')} ({data.late_days ?? 0})
              </span>
              <span>− {formatDOP(data.late_deduction_cents ?? 0)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>
                {t('Absent', 'Ausencias')} ({data.absent_days ?? 0})
              </span>
              <span>− {formatDOP(data.absent_deduction_cents ?? 0)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t pt-1 font-medium">
              <span>{t('Total deductions', 'Total deducciones')}</span>
              <span>− {formatDOP(data.deductions_cents ?? 0)}</span>
            </div>
          </div>

          {/* Advances */}
          <div className="rounded-md border p-4 text-sm">
            <div className="mb-1 font-medium">{t('Advances', 'Adelantos')}</div>
            {(data.advances ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('None in this period.', 'Ninguno en este período.')}
              </p>
            ) : (
              <div className="space-y-1">
                {(data.advances ?? []).map((a, i) => (
                  <div key={i} className="flex justify-between text-muted-foreground">
                    <span>
                      {a.advance_date}
                      {a.note ? ` · ${a.note}` : ''}
                    </span>
                    <span>− {formatDOP(a.amount_cents)}</span>
                  </div>
                ))}
                <div className="mt-1 flex justify-between border-t pt-1 font-medium">
                  <span>{t('Total advances', 'Total adelantos')}</span>
                  <span>− {formatDOP(data.advances_cents ?? 0)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Net */}
          <div className="rounded-md border-2 border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {t('Net to receive', 'Neto a recibir')}
              </span>
              <span className="text-2xl font-bold">{formatDOP(data.net_cents ?? 0)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

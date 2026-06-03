'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveProductCostCalc, applyCalculatorPrice } from '../actions'
import type { ExchangeRate } from '@/lib/exchange-rates-types'
import {
  computeFinalPrice,
  type CostCalcState as _CostCalcState,
} from './calc-utils'

// Re-export so existing imports `import { type CostCalcState } from './calculator-tab'`
// keep working without touching product-form.tsx imports.
export type CostCalcState = _CostCalcState

// Real purchase-cost summary for ONE product, returned by the SQL function
// get_product_purchase_cost_summary. Amounts are in PESOS (not cents).
export type PurchaseCostSummary = {
  product_id: string
  line_count: number
  purchase_count: number
  total_units: number
  total_landed_dop: number
  weighted_avg_unit_dop: number | null
  last_unit_dop: number | null
  last_purchase_at: string | null
}

const EMPTY: CostCalcState = {
  base_cost_usd: null,
  shipping_usd: null,
  tax_percent: null,
  discount_usd: null,
  exchange_rate: null,
  transport_dop_per_unit: null,
  margin_percent: null,
  commission_percent: null,
}

function fmtDOP(n: number): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('es-DO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
}

function parseNum(s: string): number | null {
  const trimmed = s.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

// Seed the raw-text fields from a numeric state (used on first load).
function textFromState(s: CostCalcState): Record<keyof CostCalcState, string> {
  const out = {} as Record<keyof CostCalcState, string>
  ;(Object.keys(s) as (keyof CostCalcState)[]).forEach((k) => {
    out[k] = s[k] == null ? '' : String(s[k])
  })
  return out
}

type Mode = 'create' | 'edit'

export function CalculatorTab({
  mode,
  productId,
  initialState,
  productCommissionPercent,
  productTargetPaybackPercent,
  currentRate,
  purchaseCostSummary = null,
}: {
  mode: Mode
  productId?: string
  initialState: CostCalcState | null
  productCommissionPercent: number
  productTargetPaybackPercent: number | null
  currentRate: ExchangeRate | null
  purchaseCostSummary?: PurchaseCostSummary | null
}) {
  const router = useRouter()

  const buildInitial = (): CostCalcState => ({
    ...EMPTY,
    ...(initialState ?? {}),
    exchange_rate:
      initialState?.exchange_rate ?? (currentRate ? currentRate.rate : null),
    commission_percent:
      initialState?.commission_percent ?? productCommissionPercent,
  })

  // Numeric state drives the calculation and the save. `text` holds exactly what
  // the user typed per field, so decimals like "105.80" (and partial states like
  // "105." or "105.0") display as typed instead of being collapsed to a number
  // on every keystroke.
  const [state, setState] = useState<CostCalcState>(buildInitial)
  const [text, setText] = useState<Record<keyof CostCalcState, string>>(() =>
    textFromState(buildInitial()),
  )
  const [isSavingState, startSaveState] = useTransition()
  const [isSaveAndApply, startSaveAndApply] = useTransition()

  const calc = useMemo(() => computeFinalPrice(state), [state])

  function set<K extends keyof CostCalcState>(key: K, raw: string) {
    setText((t) => ({ ...t, [key]: raw }))
    setState((s) => ({ ...s, [key]: parseNum(raw) }))
  }

  function onSaveState() {
    if (!productId) return
    startSaveState(async () => {
      const res = await saveProductCostCalc(productId, state)
      if (res.ok) toast.success('Calculator state saved')
      else toast.error(res.error ?? 'Failed to save')
    })
  }

  // Edit-mode primary: save calc inputs + push final price into products.price_cents.
  function onSaveAndApply() {
    if (!productId) return
    if (calc.priceRounded == null || calc.priceRounded <= 0) {
      toast.error('Fill all calculator fields first')
      return
    }
    const priceCents = Math.round(calc.priceRounded * 100)
    startSaveAndApply(async () => {
      const saveRes = await saveProductCostCalc(productId, state)
      if (!saveRes.ok) {
        toast.error(saveRes.error ?? 'Failed to save calculator')
        return
      }
      const applyRes = await applyCalculatorPrice(productId, priceCents)
      if (!applyRes.ok) {
        toast.error(applyRes.error ?? 'Failed to apply price')
        return
      }
      toast.success(`Saved · unit price set to ${fmtDOP(priceCents / 100)}`)
      router.refresh()
    })
  }

  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth() + 1
  let rateHint = 'No monthly rate set — enter manually.'
  if (currentRate) {
    const isCurrent = currentRate.year === curY && currentRate.month === curM
    const label = `${currentRate.year}-${String(currentRate.month).padStart(2, '0')}`
    rateHint = isCurrent
      ? `Monthly planning rate: ${currentRate.rate} (${label})`
      : `Monthly planning rate: ${currentRate.rate} (${label} — no rate set for ${curY}-${String(curM).padStart(2, '0')} yet)`
  }

  const canApply = calc.priceRounded != null && calc.priceRounded > 0
  const busy = isSavingState || isSaveAndApply

  return (
    <div className="space-y-6">
      {mode === 'edit' && purchaseCostSummary && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            What you&apos;ve actually paid
          </div>
          {purchaseCostSummary.weighted_avg_unit_dop != null ? (
            <>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-bold">
                  {fmtDOP(purchaseCostSummary.weighted_avg_unit_dop)}
                </span>
                <span className="text-sm text-muted-foreground">
                  average cost per unit
                </span>
              </div>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">Units bought</div>
                  <div className="font-medium">
                    {purchaseCostSummary.total_units}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Purchases</div>
                  <div className="font-medium">
                    {purchaseCostSummary.purchase_count}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Most recent cost
                  </div>
                  <div className="font-medium">
                    {purchaseCostSummary.last_unit_dop != null
                      ? fmtDOP(purchaseCostSummary.last_unit_dop)
                      : '—'}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Weighted average landed cost across paid / received / completed
                purchase orders
                {purchaseCostSummary.last_purchase_at
                  ? ` · last bought ${fmtDate(purchaseCostSummary.last_purchase_at)}`
                  : ''}
                . This is what you really paid — the boxes below are an estimate
                for setting a new price.
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              No purchases recorded yet for this product. Once you receive a
              supplier order, your real average cost will show here.
            </p>
          )}
        </div>
      )}

      {mode === 'create' && (
        <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
          Fill the calculator here if you want — when you click <strong>Create</strong>,
          the final rounded price will be saved as the product&apos;s unit price.
          Leave it blank to use the manual price from the Pricing tab.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="base_cost_usd">Base cost (USD)</Label>
          <Input
            id="base_cost_usd"
            type="text"
            inputMode="decimal"
            value={text.base_cost_usd}
            onChange={(e) => set('base_cost_usd', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Supplier unit cost in USD.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="shipping_usd">Inbound shipping per unit (USD)</Label>
          <Input
            id="shipping_usd"
            type="text"
            inputMode="decimal"
            value={text.shipping_usd}
            onChange={(e) => set('shipping_usd', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">International freight share, in USD.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tax_percent">Tax (%)</Label>
          <Input
            id="tax_percent"
            type="text"
            inputMode="decimal"
            value={text.tax_percent}
            onChange={(e) => set('tax_percent', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Tax / customs duty %, applied to (base + shipping).
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="discount_usd">Discount (USD)</Label>
          <Input
            id="discount_usd"
            type="text"
            inputMode="decimal"
            value={text.discount_usd}
            onChange={(e) => set('discount_usd', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Per-unit supplier discount, in USD. Subtracted from cost.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="exchange_rate">Exchange rate (USD → DOP)</Label>
          <Input
            id="exchange_rate"
            type="text"
            inputMode="decimal"
            value={text.exchange_rate}
            onChange={(e) => set('exchange_rate', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{rateHint}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="transport_dop">Local transport per unit (DOP)</Label>
          <Input
            id="transport_dop"
            type="text"
            inputMode="decimal"
            value={text.transport_dop_per_unit}
            onChange={(e) => set('transport_dop_per_unit', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Last-mile transport, already in DOP.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="margin_percent">Target margin (%)</Label>
          <Input
            id="margin_percent"
            type="text"
            inputMode="decimal"
            value={text.margin_percent}
            onChange={(e) => set('margin_percent', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Applied to landed cost.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="commission_percent">Commission (%)</Label>
          <Input
            id="commission_percent"
            type="text"
            inputMode="decimal"
            value={text.commission_percent}
            onChange={(e) => set('commission_percent', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {mode === 'create'
              ? 'Type the seller commission % to use for this calc.'
              : "Defaults from product. Editing here is what-if only — doesn't change the saved value."}
          </p>
        </div>

        {productTargetPaybackPercent != null && (
          <div className="space-y-2">
            <Label>Target payback (%)</Label>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              {productTargetPaybackPercent}%
            </div>
            <p className="text-xs text-muted-foreground">
              Cashback receivable info. Not part of the price calc.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-md border bg-card p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Landed cost
            </div>
            <div className="text-2xl font-bold">
              {calc.landed != null ? fmtDOP(calc.landed) : ' '}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              (base + shipping) × (1 + tax%) − discount, then × rate + transport
            </p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Suggested price (raw)
            </div>
            <div className="text-2xl font-bold">
              {calc.price != null ? fmtDOP(calc.price) : ' '}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              landed × (1 + margin%) × (1 − commission%)
            </p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Final price (rounded)
            </div>
            <div className="text-2xl font-bold">
              {calc.priceRounded != null ? fmtDOP(calc.priceRounded) : ' '}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Up to next 25 (≤3000), 50 (≤5000), or 100. What gets applied.
            </p>
          </div>
        </div>
      </div>

      {mode === 'edit' && productId ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onSaveState}
            disabled={busy}
          >
            {isSavingState ? 'Saving…' : 'Save calculator only'}
          </Button>
          <Button
            type="button"
            onClick={onSaveAndApply}
            disabled={!canApply || busy}
          >
            {isSaveAndApply ? 'Saving & applying…' : 'Save & set as unit price'}
          </Button>
        </div>
      ) : (
        // Create mode: the main form's Create button handles submission.
        // We carry the calc state along as a hidden form input the server reads.
        <input
          type="hidden"
          name="cost_calc_json"
          value={JSON.stringify(state)}
        />
      )}
    </div>
  )
}

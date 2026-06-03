'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  initialPriceCents?: number
  initialClubPriceCents?: number | null
  initialCommissionPercent?: number
  initialTargetPaybackPercent?: number | null
  initialSalePriceCents?: number | null
  initialSaleDiscountPct?: number | null
}

const centsToDop = (c: number | null | undefined): string =>
  c == null ? '' : (c / 100).toString()

const formatDop = (cents: number): string =>
  'RD$' +
  (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })

type SaleMode = 'none' | 'pct' | 'price'

export function PricingTab({
  initialPriceCents = 0,
  initialClubPriceCents = null,
  initialCommissionPercent = 0,
  initialTargetPaybackPercent = null,
  initialSalePriceCents = null,
  initialSaleDiscountPct = null,
}: Props) {
  // Regular price is controlled so the sale preview can react live.
  const [priceText, setPriceText] = useState(centsToDop(initialPriceCents))

  const initialMode: SaleMode =
    initialSaleDiscountPct != null
      ? 'pct'
      : initialSalePriceCents != null
        ? 'price'
        : 'none'
  const [saleMode, setSaleMode] = useState<SaleMode>(initialMode)
  const [salePctText, setSalePctText] = useState(
    initialSaleDiscountPct != null ? initialSaleDiscountPct.toString() : '',
  )
  const [salePriceText, setSalePriceText] = useState(
    initialSalePriceCents != null
      ? (initialSalePriceCents / 100).toString()
      : '',
  )

  const regularCents = (() => {
    const n = parseFloat(priceText)
    return Number.isNaN(n) ? 0 : Math.round(n * 100)
  })()

  let previewCents: number | null = null
  let previewNote = ''
  if (saleMode === 'pct') {
    const pct = parseFloat(salePctText)
    if (!Number.isNaN(pct) && pct > 0 && pct < 100 && regularCents > 0) {
      previewCents = Math.round(regularCents * (1 - pct / 100))
      previewNote = `${pct}% off`
    }
  } else if (saleMode === 'price') {
    const sp = parseFloat(salePriceText)
    if (!Number.isNaN(sp) && sp > 0) {
      previewCents = Math.round(sp * 100)
      if (regularCents > 0 && previewCents < regularCents) {
        const pctOff = Math.round((1 - previewCents / regularCents) * 100)
        previewNote = `${pctOff}% off`
      }
    }
  }

  const previewTooHigh =
    previewCents != null && regularCents > 0 && previewCents >= regularCents

  const modeBtn = (m: SaleMode, label: string) => (
    <button
      type="button"
      onClick={() => setSaleMode(m)}
      className={
        'rounded-md border px-3 py-1.5 text-sm ' +
        (saleMode === m
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-background')
      }
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="grid gap-2">
        <Label htmlFor="price_dop">Price (DOP)</Label>
        <Input
          id="price_dop"
          name="price_dop"
          type="number"
          step="1"
          min="0"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          placeholder="0"
        />
        <p className="text-xs text-muted-foreground">
          Regular retail price in pesos. Leave blank if you&apos;ll set it from
          the Calculator tab &mdash; the calculator&apos;s final price overrides
          this value when it&apos;s filled in.
        </p>
      </div>

      <div className="grid gap-2 rounded-lg border p-4">
        <Label>Sale price / discount</Label>
        <p className="text-xs text-muted-foreground">
          Optional. Put this product on sale without making a discount rule.
          Pick percent off, or type the exact sale price. This becomes the price
          customers pay &mdash; online and at the register.
        </p>

        <input type="hidden" name="sale_mode" value={saleMode} />

        <div className="flex gap-2 pt-1">
          {modeBtn('none', 'No sale')}
          {modeBtn('pct', 'Percent off')}
          {modeBtn('price', 'Sale price')}
        </div>

        {saleMode === 'pct' && (
          <div className="grid gap-2 pt-2">
            <Label htmlFor="sale_pct">Percent off (%)</Label>
            <Input
              id="sale_pct"
              name="sale_pct"
              type="number"
              step="0.5"
              min="0"
              max="99"
              value={salePctText}
              onChange={(e) => setSalePctText(e.target.value)}
              placeholder="e.g. 15"
            />
          </div>
        )}
        {saleMode === 'price' && (
          <div className="grid gap-2 pt-2">
            <Label htmlFor="sale_price_dop">Sale price (DOP)</Label>
            <Input
              id="sale_price_dop"
              name="sale_price_dop"
              type="number"
              step="1"
              min="0"
              value={salePriceText}
              onChange={(e) => setSalePriceText(e.target.value)}
              placeholder="e.g. 499"
            />
          </div>
        )}

        {saleMode !== 'price' && (
          <input type="hidden" name="sale_price_dop" value="" />
        )}
        {saleMode !== 'pct' && <input type="hidden" name="sale_pct" value="" />}

        {saleMode !== 'none' && previewCents != null && !previewTooHigh && (
          <p className="pt-1 text-sm font-medium text-green-700">
            Customers pay {formatDop(previewCents)}
            {previewNote ? ` (${previewNote})` : ''}
            {regularCents > 0 && (
              <span className="font-normal text-muted-foreground">
                {' '}
                &mdash; was {formatDop(regularCents)}
              </span>
            )}
          </p>
        )}
        {saleMode !== 'none' && previewTooHigh && (
          <p className="pt-1 text-sm font-medium text-destructive">
            That sale price is not lower than the regular price, so it will be
            ignored.
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="club_price_dop">Club price (DOP)</Label>
        <Input
          id="club_price_dop"
          name="club_price_dop"
          type="number"
          step="1"
          min="0"
          defaultValue={centsToDop(initialClubPriceCents)}
          placeholder="(none)"
        />
        <p className="text-xs text-muted-foreground">
          Optional. Reduced price for club members. Leave blank if same as
          regular. (If both a club price and a sale price apply, members pay
          whichever is lower.)
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="commission_percent">Seller commission (%)</Label>
        <Input
          id="commission_percent"
          name="commission_percent"
          type="number"
          step="0.1"
          min="0"
          max="100"
          defaultValue={initialCommissionPercent?.toString() ?? '0'}
          placeholder="0"
        />
        <p className="text-xs text-muted-foreground">
          Default % the seller earns on this product. Can be overridden per
          seller on the People page.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="target_payback_percent">Cashback / payback (%)</Label>
        <Input
          id="target_payback_percent"
          name="target_payback_percent"
          type="number"
          step="0.1"
          min="0"
          max="100"
          defaultValue={
            initialTargetPaybackPercent != null
              ? initialTargetPaybackPercent.toString()
              : ''
          }
          placeholder="(none)"
        />
        <p className="text-xs text-muted-foreground">
          Cashback rate from supplier (e.g. 7% from AliExpress). Used for the
          cashback report; not included in the price calculation.
        </p>
      </div>
    </div>
  )
}
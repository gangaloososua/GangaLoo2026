'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  initialPriceCents?: number
  initialClubPriceCents?: number | null
  initialCommissionPercent?: number
  initialTargetPaybackPercent?: number | null
}

const centsToDop = (c: number | null | undefined): string =>
  c == null ? '' : (c / 100).toString()

export function PricingTab({
  initialPriceCents = 0,
  initialClubPriceCents = null,
  initialCommissionPercent = 0,
  initialTargetPaybackPercent = null,
}: Props) {
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
          defaultValue={centsToDop(initialPriceCents)}
          placeholder="0"
        />
        <p className="text-xs text-muted-foreground">
          Regular retail price in pesos. Leave blank if you'll set it from the
          Calculator tab — the calculator's final price overrides this value
          when it's filled in.
        </p>
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
          regular.
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

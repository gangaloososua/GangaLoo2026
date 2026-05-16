'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Trash2 } from 'lucide-react'
import { formatDOP } from '@/lib/format'
import { ProductSearch } from './product-search'
import type {
  CustomerPickerItem,
  ProductSearchResult,
  SellerOption,
} from '@/lib/sales'

type LookupItem = { id: string; name: string }

type Props = {
  customers: CustomerPickerItem[]
  sellers: SellerOption[]
  defaultSellerId: string | null
  warehouses: LookupItem[]
}

// Sentinel for "walk-in" in the customer Select. Radix forbids "" as a value.
const WALKIN = '__walkin__'

const FULFILLMENT_OPTIONS: Array<{
  value: 'in_store' | 'pickup' | 'delivery'
  label: string
  hint: string
}> = [
  { value: 'in_store', label: 'In-store', hint: 'Customer buys and walks out with it' },
  { value: 'pickup', label: 'Pickup', hint: 'Customer collects later from this warehouse' },
  { value: 'delivery', label: 'Delivery', hint: 'Sent from this warehouse to the customer' },
]

// A cart line. unit_price_cents is the resolved default at add-time; the
// operator can edit it. qty_on_hand_at_add is the stock indicator we froze
// when the product was added (re-fetching as the cart grows is overkill).
type CartLine = {
  line_id: string
  product_id: string
  sku: string
  name: string
  primary_image_url: string | null
  commission_percent: number
  unit_price_cents: number
  qty: number
  line_discount_cents: number
  qty_on_hand_at_add: number
}

// Pick the default unit price: warehouse override > club price (if customer
// has a non-none tier) > base price.
function resolveDefaultPrice(
  product: ProductSearchResult,
  customerHasClubTier: boolean
): number {
  if (product.warehouse_price_override_cents != null) {
    return product.warehouse_price_override_cents
  }
  if (customerHasClubTier && product.club_price_cents != null) {
    return product.club_price_cents
  }
  return product.base_price_cents
}

// User types DOP as integer pesos. Internally we store cents. The form has
// no fractional input, matching how POS staff actually ring up sales.
function dopStringToCents(s: string): number {
  const n = parseInt(s, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n * 100
}

function centsToDopString(c: number): string {
  return Math.round(c / 100).toString()
}

export function NewSaleForm({
  customers,
  sellers,
  defaultSellerId,
  warehouses,
}: Props) {
  const [customerId, setCustomerId] = useState<string>(WALKIN)
  const [sellerId, setSellerId] = useState<string>(defaultSellerId ?? '')
  const [sourceWarehouseId, setSourceWarehouseId] = useState<string>('')
  const [fulfillmentWarehouseId, setFulfillmentWarehouseId] = useState<string>('')
  const [fulfillmentMethod, setFulfillmentMethod] =
    useState<'in_store' | 'pickup' | 'delivery'>('in_store')

  // Keep fulfillment warehouse in sync with source warehouse by default.
  const [fulfillmentLinked, setFulfillmentLinked] = useState(true)

  // Cart state.
  const [lines, setLines] = useState<CartLine[]>([])
  const [saleDiscountCents, setSaleDiscountCents] = useState<number>(0)

  function onSourceWarehouseChange(id: string) {
    setSourceWarehouseId(id)
    if (fulfillmentLinked) setFulfillmentWarehouseId(id)
    // Changing the source warehouse invalidates existing line prices/stock
    // (they were resolved against the old warehouse). Easiest correct move:
    // clear the cart. Empty-cart case is a no-op.
    if (lines.length > 0 && id !== sourceWarehouseId) {
      setLines([])
    }
  }

  function onFulfillmentWarehouseChange(id: string) {
    setFulfillmentWarehouseId(id)
    setFulfillmentLinked(id === sourceWarehouseId)
  }

  const chosenCustomer =
    customerId === WALKIN ? null : customers.find((c) => c.id === customerId) ?? null
  const customerHasClubTier =
    !!chosenCustomer?.club_tier && chosenCustomer.club_tier !== 'none'

  const metaReady = !!sourceWarehouseId && !!fulfillmentWarehouseId && !!sellerId

  // === cart ops ===

  function addProduct(p: ProductSearchResult) {
    const unit_price_cents = resolveDefaultPrice(p, customerHasClubTier)
    setLines((prev) => [
      ...prev,
      {
        line_id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        product_id: p.id,
        sku: p.sku,
        name: p.name,
        primary_image_url: p.primary_image_url,
        commission_percent: p.commission_percent,
        unit_price_cents,
        qty: 1,
        line_discount_cents: 0,
        qty_on_hand_at_add: p.qty_on_hand,
      },
    ])
  }

  function updateLine(line_id: string, patch: Partial<CartLine>) {
    setLines((prev) =>
      prev.map((l) => (l.line_id === line_id ? { ...l, ...patch } : l))
    )
  }

  function removeLine(line_id: string) {
    setLines((prev) => prev.filter((l) => l.line_id !== line_id))
  }

  // === totals ===

  const totals = useMemo(() => {
    let subtotal = 0
    let lineDiscounts = 0
    for (const l of lines) {
      subtotal += l.unit_price_cents * l.qty
      lineDiscounts += l.line_discount_cents
    }
    const afterLineDiscounts = subtotal - lineDiscounts
    const grandTotal = Math.max(0, afterLineDiscounts - saleDiscountCents)
    return { subtotal, lineDiscounts, grandTotal }
  }, [lines, saleDiscountCents])

  // === render ===

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sale details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1 sm:col-span-2 lg:col-span-1">
              <Label className="text-xs">Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WALKIN}>Walk-in (no customer)</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {chosenCustomer?.club_tier && chosenCustomer.club_tier !== 'none' && (
                <p className="text-xs">
                  <Badge variant="secondary" className="capitalize">
                    {chosenCustomer.club_tier} tier
                  </Badge>
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">
                Seller <span className="text-rose-600">*</span>
              </Label>
              <Select value={sellerId} onValueChange={setSellerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a seller…" />
                </SelectTrigger>
                <SelectContent>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">
                Source warehouse <span className="text-rose-600">*</span>
              </Label>
              <Select
                value={sourceWarehouseId}
                onValueChange={onSourceWarehouseChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick where stock is pulled from…" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">
                Fulfillment warehouse <span className="text-rose-600">*</span>
              </Label>
              <Select
                value={fulfillmentWarehouseId}
                onValueChange={onFulfillmentWarehouseChange}
                disabled={!sourceWarehouseId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      sourceWarehouseId ? 'Pick fulfillment…' : 'Pick source first'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fulfillmentLinked &&
                sourceWarehouseId &&
                sourceWarehouseId === fulfillmentWarehouseId && (
                  <p className="text-xs text-muted-foreground">
                    Same as source.
                  </p>
                )}
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Fulfillment method</Label>
              <div className="flex flex-wrap gap-2">
                {FULFILLMENT_OPTIONS.map((o) => {
                  const active = fulfillmentMethod === o.value
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setFulfillmentMethod(o.value)}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                        active
                          ? 'border-foreground bg-foreground/5'
                          : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      <div className="font-medium">{o.label}</div>
                      <div className="text-xs text-muted-foreground">{o.hint}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cart</CardTitle>
        </CardHeader>
        <CardContent className="min-h-[32rem] space-y-4">
          {!metaReady ? (
            <p className="text-sm text-muted-foreground">
              Set seller and warehouses above to enable the cart.
            </p>
          ) : (
            <>
              <ProductSearch
                warehouseId={sourceWarehouseId}
                onAdd={addProduct}
              />

              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No items yet. Search and pick a product above to add it.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Product</th>
                        <th className="py-2 pr-3 font-medium">Qty</th>
                        <th className="py-2 pr-3 font-medium">Unit price</th>
                        <th className="py-2 pr-3 font-medium">Line discount</th>
                        <th className="py-2 pr-3 text-right font-medium">Total</th>
                        <th className="py-2 pl-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => {
                        const lineTotal =
                          l.unit_price_cents * l.qty - l.line_discount_cents
                        const overStock = l.qty > l.qty_on_hand_at_add
                        return (
                          <tr key={l.line_id} className="border-b align-top">
                            <td className="py-2 pr-3">
                              <div className="flex items-start gap-2">
                                <div className="size-9 shrink-0 overflow-hidden rounded bg-muted">
                                  {l.primary_image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={l.primary_image_url}
                                      alt=""
                                      className="size-full object-cover"
                                    />
                                  ) : null}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-medium">{l.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {l.sku}
                                  </div>
                                  <div className="mt-1 text-xs">
                                    {overStock ? (
                                      <span className="text-rose-700">
                                        Stock: {l.qty_on_hand_at_add} (short by{' '}
                                        {l.qty - l.qty_on_hand_at_add})
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        Stock at add: {l.qty_on_hand_at_add}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2 pr-3">
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                value={l.qty}
                                onChange={(e) =>
                                  updateLine(l.line_id, {
                                    qty: Math.max(
                                      1,
                                      parseInt(e.target.value, 10) || 1
                                    ),
                                  })
                                }
                                className="w-20"
                              />
                            </td>
                            <td className="py-2 pr-3">
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                value={centsToDopString(l.unit_price_cents)}
                                onChange={(e) =>
                                  updateLine(l.line_id, {
                                    unit_price_cents: dopStringToCents(
                                      e.target.value
                                    ),
                                  })
                                }
                                className="w-28"
                              />
                            </td>
                            <td className="py-2 pr-3">
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                value={centsToDopString(l.line_discount_cents)}
                                onChange={(e) =>
                                  updateLine(l.line_id, {
                                    line_discount_cents: dopStringToCents(
                                      e.target.value
                                    ),
                                  })
                                }
                                className="w-24"
                              />
                            </td>
                            <td className="py-2 pr-3 text-right font-medium">
                              {formatDOP(Math.max(0, lineTotal))}
                            </td>
                            <td className="py-2 pl-3">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeLine(l.line_id)}
                                aria-label="Remove line"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {lines.length > 0 && (
                <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Sale-level discount (DOP)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={centsToDopString(saleDiscountCents)}
                      onChange={(e) =>
                        setSaleDiscountCents(dopStringToCents(e.target.value))
                      }
                      className="w-32"
                    />
                  </div>
                  <div className="space-y-1 text-sm sm:text-right">
                    <div className="flex justify-between sm:justify-end sm:gap-6">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">
                        {formatDOP(totals.subtotal)}
                      </span>
                    </div>
                    {totals.lineDiscounts > 0 && (
                      <div className="flex justify-between sm:justify-end sm:gap-6">
                        <span className="text-muted-foreground">
                          Line discounts
                        </span>
                        <span className="tabular-nums">
                          −{formatDOP(totals.lineDiscounts)}
                        </span>
                      </div>
                    )}
                    {saleDiscountCents > 0 && (
                      <div className="flex justify-between sm:justify-end sm:gap-6">
                        <span className="text-muted-foreground">
                          Sale discount
                        </span>
                        <span className="tabular-nums">
                          −{formatDOP(saleDiscountCents)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1 text-base font-semibold sm:justify-end sm:gap-6">
                      <span>Total</span>
                      <span className="tabular-nums">
                        {formatDOP(totals.grandTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" type="button" disabled>
          Save draft
        </Button>
        <Button
          type="button"
          disabled
          title="Payment + confirm wire up in 9.8"
        >
          Confirm sale
        </Button>
      </div>
    </div>
  )
}

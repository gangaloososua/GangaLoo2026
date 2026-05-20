'use client'

// Round 15.7 — new online order form
//
// Modeled on app/(dashboard)/sales/new/new-sale-form.tsx (POS).
// Key differences:
//   - Fulfillment options: pickup | delivery only (no in_store).
//     Default is delivery (most common online use case).
//   - Adds shipping fee + delivery address/city/notes fields.
//   - Payments are OPTIONAL — online orders are routinely unpaid
//     at creation (paid on delivery). No auto-seeded first tender.
//   - Submit calls createOnlineOrder (camelCase params).
//   - Redirects to /online-orders/[id] on success.
//
// Round 16.5 — auto-discount cart integration (mirrors 16.4 POS form).

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { formatDOP } from '@/lib/format'
import { ProductSearch } from '../../sales/new/product-search'
import { createOnlineOrder } from '../actions'
import type {
  CustomerPickerItem,
  MoneyAccount,
  ProductSearchResult,
  SellerOption,
} from '@/lib/sales'
// Round 16.5: auto-discount integration (mirrors 16.4 POS form)
import type { DiscountRuleRow } from '@/lib/discount-rules'
import {
  resolveLineDiscount,
  type AppliedDiscount,
} from '@/lib/discount-rules-resolver'

type LookupItem = { id: string; name: string }

type Props = {
  customers: CustomerPickerItem[]
  sellers: SellerOption[]
  defaultSellerId: string | null
  warehouses: LookupItem[]
  moneyAccounts: MoneyAccount[]
  // Round 16.5: pre-fetched active discount rules. Pure client-side
  // resolution; SQL function is the authority at confirm time.
  activeDiscountRules: DiscountRuleRow[]
}

// Sentinel for "no customer" in the customer Select. Radix forbids "".
const NO_CUSTOMER = '__no_customer__'

type FulfillmentMethod = 'pickup' | 'delivery'

const FULFILLMENT_OPTIONS: Array<{
  value: FulfillmentMethod
  label: string
  hint: string
}> = [
  {
    value: 'delivery',
    label: 'Delivery',
    hint: 'Sent from source warehouse to the customer address',
  },
  {
    value: 'pickup',
    label: 'Pickup',
    hint: 'Customer collects from the fulfillment warehouse',
  },
]

type PaymentMethod =
  | 'cash'
  | 'card'
  | 'transfer'
  | 'paypal'
  | 'stripe'
  | 'credit'

const PAYMENT_METHOD_OPTIONS: Array<{
  value: PaymentMethod
  label: string
}> = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'credit', label: 'Store credit' },
]

// A cart line. Round 16.5 added is_manual_discount + discount_breakdown.
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
  // Round 16.5: discount auto/manual state
  is_manual_discount: boolean
  discount_breakdown: AppliedDiscount[]
}

// A payment tender.
type CartPayment = {
  tender_id: string
  method: PaymentMethod
  amount_cents: number
  money_account_id: string
  reference: string
}

function resolveDefaultPrice(
  product: ProductSearchResult,
  customerHasClubTier: boolean,
): number {
  if (product.warehouse_price_override_cents != null) {
    return product.warehouse_price_override_cents
  }
  if (customerHasClubTier && product.club_price_cents != null) {
    return product.club_price_cents
  }
  return product.base_price_cents
}

function pickDefaultAccountId(
  accounts: MoneyAccount[],
  method: PaymentMethod,
): string {
  const byKind = accounts.find((a) => a.kind === method)
  if (byKind) return byKind.id
  return accounts[0]?.id ?? ''
}

function dopStringToCents(s: string): number {
  const n = parseInt(s, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n * 100
}

function centsToDopString(c: number): string {
  return Math.round(c / 100).toString()
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function NewOnlineOrderForm({
  customers,
  sellers,
  defaultSellerId,
  warehouses,
  moneyAccounts,
  activeDiscountRules,
}: Props) {
  const [customerId, setCustomerId] = useState<string>(NO_CUSTOMER)
  const [sellerId, setSellerId] = useState<string>(defaultSellerId ?? '')
  const [sourceWarehouseId, setSourceWarehouseId] = useState<string>('')
  const [fulfillmentWarehouseId, setFulfillmentWarehouseId] =
    useState<string>('')
  const [fulfillmentMethod, setFulfillmentMethod] =
    useState<FulfillmentMethod>('delivery')

  const [fulfillmentLinked, setFulfillmentLinked] = useState(true)

  const [lines, setLines] = useState<CartLine[]>([])
  const [saleDiscountCents, setSaleDiscountCents] = useState<number>(0)
  const [shippingCents, setShippingCents] = useState<number>(0)
  const [shippingAddress, setShippingAddress] = useState<string>('')
  const [shippingCity, setShippingCity] = useState<string>('')
  const [deliveryNotes, setDeliveryNotes] = useState<string>('')

  const [payments, setPayments] = useState<CartPayment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const router = useRouter()

  // Round 16.5: customer id usable by the resolver (NULL for no-customer).
  const resolverCustomerId = customerId === NO_CUSTOMER ? null : customerId
  // Round 17: customer's club_tier for tier-based discount rules.
  const resolverClubTier =
    customerId === NO_CUSTOMER
      ? null
      : customers.find((c) => c.id === customerId)?.club_tier ?? null

  function onSourceWarehouseChange(id: string) {
    setSourceWarehouseId(id)
    if (fulfillmentLinked) setFulfillmentWarehouseId(id)
    if (lines.length > 0 && id !== sourceWarehouseId) {
      // Stock comes from a specific warehouse — clearing the cart prevents
      // accidentally consuming from the wrong source.
      setLines([])
      setPayments([])
    }
  }

  function onFulfillmentWarehouseChange(id: string) {
    setFulfillmentWarehouseId(id)
    setFulfillmentLinked(id === sourceWarehouseId)
  }

  const chosenCustomer =
    customerId === NO_CUSTOMER
      ? null
      : customers.find((c) => c.id === customerId) ?? null
  const customerHasClubTier =
    !!chosenCustomer?.club_tier && chosenCustomer.club_tier !== 'none'

  const metaReady =
    !!sourceWarehouseId && !!fulfillmentWarehouseId && !!sellerId

  // === cart ops ===

  function addProduct(p: ProductSearchResult) {
    const unit_price_cents = resolveDefaultPrice(p, customerHasClubTier)
    // Round 16.5: resolve auto-discounts at add time
    const result = resolveLineDiscount({
      productId: p.id,
      qty: 1,
      unitPriceCents: unit_price_cents,
      customerId: resolverCustomerId,
      customerClubTier: resolverClubTier,
      sourceWarehouseId: sourceWarehouseId || null,
      rules: activeDiscountRules,
      at: new Date(),
    })
    setLines((prev) => [
      ...prev,
      {
        line_id: makeId(),
        product_id: p.id,
        sku: p.sku,
        name: p.name,
        primary_image_url: p.primary_image_url,
        commission_percent: p.commission_percent,
        unit_price_cents,
        qty: 1,
        line_discount_cents: result.totalDiscountCents,
        qty_on_hand_at_add: p.qty_on_hand,
        is_manual_discount: false,
        discount_breakdown: result.applied,
      },
    ])
  }

  // Round 16.5: updateLine recomputes the auto-discount on non-manual
  // lines after qty/unit price changes. If the patch directly sets
  // line_discount_cents (i.e., user typed into the discount input),
  // the line flips to manual unless the user typed 0 (which restores
  // auto).
  function updateLine(line_id: string, patch: Partial<CartLine>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.line_id !== line_id) return l
        const merged: CartLine = { ...l, ...patch }

        const directDiscountEdit =
          Object.prototype.hasOwnProperty.call(patch, 'line_discount_cents') &&
          !Object.prototype.hasOwnProperty.call(patch, 'is_manual_discount')

        if (directDiscountEdit) {
          if (patch.line_discount_cents === 0) {
            merged.is_manual_discount = false
          } else {
            merged.is_manual_discount = true
            merged.discount_breakdown = []
          }
        }

        if (!merged.is_manual_discount) {
          const result = resolveLineDiscount({
            productId: merged.product_id,
            qty: merged.qty,
            unitPriceCents: merged.unit_price_cents,
            customerId: resolverCustomerId,
            customerClubTier: resolverClubTier,
            sourceWarehouseId: sourceWarehouseId || null,
            rules: activeDiscountRules,
            at: new Date(),
          })
          merged.line_discount_cents = result.totalDiscountCents
          merged.discount_breakdown = result.applied
        }

        return merged
      }),
    )
  }

  function removeLine(line_id: string) {
    setLines((prev) => prev.filter((l) => l.line_id !== line_id))
  }

  // Round 16.5: customer change recomputes auto-discounts on all
  // non-manual lines. Manual-discount lines are untouched.
  useEffect(() => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.is_manual_discount) return l
        const result = resolveLineDiscount({
          productId: l.product_id,
          qty: l.qty,
          unitPriceCents: l.unit_price_cents,
          customerId: resolverCustomerId,
          customerClubTier: resolverClubTier,
          sourceWarehouseId: sourceWarehouseId || null,
          rules: activeDiscountRules,
          at: new Date(),
        })
        return {
          ...l,
          line_discount_cents: result.totalDiscountCents,
          discount_breakdown: result.applied,
        }
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  // === totals ===

  const totals = useMemo(() => {
    let subtotal = 0
    let lineDiscounts = 0
    for (const l of lines) {
      subtotal += l.unit_price_cents * l.qty
      lineDiscounts += l.line_discount_cents
    }
    const afterLineDiscounts = subtotal - lineDiscounts
    const grandTotal = Math.max(
      0,
      afterLineDiscounts - saleDiscountCents + shippingCents,
    )
    return { subtotal, lineDiscounts, grandTotal }
  }, [lines, saleDiscountCents, shippingCents])

  // === payment ops ===

  function addPayment(amountCents?: number) {
    const method: PaymentMethod = 'cash'
    setPayments((prev) => [
      ...prev,
      {
        tender_id: makeId(),
        method,
        amount_cents: amountCents ?? 0,
        money_account_id: pickDefaultAccountId(moneyAccounts, method),
        reference: '',
      },
    ])
  }

  function updatePayment(tender_id: string, patch: Partial<CartPayment>) {
    setPayments((prev) =>
      prev.map((p) => {
        if (p.tender_id !== tender_id) return p
        if (patch.method && patch.method !== p.method) {
          return {
            ...p,
            ...patch,
            money_account_id: pickDefaultAccountId(
              moneyAccounts,
              patch.method,
            ),
          }
        }
        return { ...p, ...patch }
      }),
    )
  }

  function removePayment(tender_id: string) {
    setPayments((prev) => prev.filter((p) => p.tender_id !== tender_id))
  }

  // NOTE: deliberately NO auto-seed of payments. Online orders are
  // routinely created unpaid (paid on delivery / by transfer / etc).

  const paymentTotal = useMemo(
    () => payments.reduce((sum, p) => sum + p.amount_cents, 0),
    [payments],
  )
  const outstanding = totals.grandTotal - paymentTotal

  // === confirm gate ===

  const confirmDisabledReason: string | null = useMemo(() => {
    if (!metaReady) return 'Set seller and warehouses first'
    if (lines.length === 0) return 'Add at least one product to the order'
    if (payments.length > 0) {
      // If any payments exist, each must be properly filled in.
      if (payments.some((p) => !p.money_account_id))
        return 'Pick an account for every payment row'
      if (payments.some((p) => p.amount_cents <= 0))
        return 'Each payment amount must be greater than zero'
    }
    return null
  }, [metaReady, lines.length, payments])

  const confirmReady = confirmDisabledReason === null

  const anyOverStock = useMemo(
    () => lines.some((l) => l.qty > l.qty_on_hand_at_add),
    [lines],
  )

  const isDelivery = fulfillmentMethod === 'delivery'
  const isPickup = fulfillmentMethod === 'pickup'
  const interWarehousePickup =
    isPickup &&
    !!sourceWarehouseId &&
    !!fulfillmentWarehouseId &&
    sourceWarehouseId !== fulfillmentWarehouseId

  async function handleConfirm() {
    if (!confirmReady) return
    setSubmitting(true)
    try {
      const res = await createOnlineOrder({
        customerId: customerId === NO_CUSTOMER ? null : customerId,
        sellerId,
        sourceWarehouseId,
        fulfillmentWarehouseId,
        fulfillmentMethod,
        discountCents: saleDiscountCents,
        shippingCents,
        shippingAddress: shippingAddress.trim() || null,
        shippingCity: shippingCity.trim() || null,
        deliveryNotes: deliveryNotes.trim() || null,
        items: lines.map((l) => ({
          productId: l.product_id,
          qty: l.qty,
          unitPriceCents: l.unit_price_cents,
          discountCents: l.line_discount_cents,
          // 16.6: send the resolver's breakdown so the RPC writes
          // per-rule audit rows. Manual lines have empty breakdown.
          discountBreakdown: l.discount_breakdown.map((b) => ({
            rule_id: b.ruleId,
            rule_kind: b.ruleKind,
            percent: b.percent,
            amount_cents: b.amountCents,
            cap_hit: b.capHit,
          })),
        })),
        payments: payments.map((p) => ({
          method: p.method,
          amountCents: p.amount_cents,
          moneyAccountId: p.money_account_id,
          reference: p.reference.trim() || null,
        })),
      })
      if (res.ok) {
        toast.success(`Online order ${res.invoiceNumber} created.`)
        router.push(`/online-orders/${res.saleId}`)
      } else {
        toast.error(res.error)
        setSubmitting(false)
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Create online order failed.'
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Sale details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order details</CardTitle>
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
                  <SelectItem value={NO_CUSTOMER}>
                    No customer (admin entry)
                  </SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {chosenCustomer?.club_tier &&
              chosenCustomer.club_tier !== 'none' ? (
                <p className="text-xs">
                  <Badge variant="secondary" className="capitalize">
                    {chosenCustomer.club_tier} tier
                  </Badge>
                </p>
              ) : null}
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
                      sourceWarehouseId
                        ? 'Pick fulfillment…'
                        : 'Pick source first'
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
              sourceWarehouseId === fulfillmentWarehouseId ? (
                <p className="text-xs text-muted-foreground">Same as source.</p>
              ) : null}
              {interWarehousePickup ? (
                <p className="text-xs text-amber-700">
                  Inter-warehouse pickup — consider a transfer fee in Shipping.
                </p>
              ) : null}
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
                      <div className="text-xs text-muted-foreground">
                        {o.hint}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="min-h-[24rem] space-y-4">
          {!metaReady ? (
            <p className="text-sm text-muted-foreground">
              Set seller and warehouses above to enable item search.
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
                        <th className="py-2 pr-3 text-right font-medium">
                          Total
                        </th>
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
                                      parseInt(e.target.value, 10) || 1,
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
                                      e.target.value,
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
                                      e.target.value,
                                    ),
                                  })
                                }
                                className="w-24"
                              />
                              {/* Round 16.5: auto-discount hint */}
                              {!l.is_manual_discount &&
                              l.discount_breakdown.length > 0 ? (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Auto:{' '}
                                  {l.discount_breakdown
                                    .map((b) => `${b.percent ?? 0}%`)
                                    .join(' × ')}
                                  {l.discount_breakdown[0].capHit
                                    ? ' (capped at 30%)'
                                    : ''}
                                </div>
                              ) : null}
                              {l.is_manual_discount ? (
                                <div className="mt-1 text-xs text-amber-700">
                                  Manual (auto silenced)
                                </div>
                              ) : null}
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

              {lines.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Order discount (DOP)
                      </Label>
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
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {isDelivery
                          ? 'Delivery fee (DOP)'
                          : 'Pickup transfer fee (DOP)'}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={centsToDopString(shippingCents)}
                        onChange={(e) =>
                          setShippingCents(dopStringToCents(e.target.value))
                        }
                        className="w-32"
                      />
                    </div>
                  </div>
                  <div className="space-y-1 text-sm sm:text-right">
                    <div className="flex justify-between sm:justify-end sm:gap-6">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">
                        {formatDOP(totals.subtotal)}
                      </span>
                    </div>
                    {totals.lineDiscounts > 0 ? (
                      <div className="flex justify-between sm:justify-end sm:gap-6">
                        <span className="text-muted-foreground">
                          Line discounts
                        </span>
                        <span className="tabular-nums">
                          −{formatDOP(totals.lineDiscounts)}
                        </span>
                      </div>
                    ) : null}
                    {saleDiscountCents > 0 ? (
                      <div className="flex justify-between sm:justify-end sm:gap-6">
                        <span className="text-muted-foreground">
                          Order discount
                        </span>
                        <span className="tabular-nums">
                          −{formatDOP(saleDiscountCents)}
                        </span>
                      </div>
                    ) : null}
                    {shippingCents > 0 ? (
                      <div className="flex justify-between sm:justify-end sm:gap-6">
                        <span className="text-muted-foreground">Shipping</span>
                        <span className="tabular-nums">
                          {formatDOP(shippingCents)}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex justify-between border-t pt-1 text-base font-semibold sm:justify-end sm:gap-6">
                      <span>Total</span>
                      <span className="tabular-nums">
                        {formatDOP(totals.grandTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* Delivery details */}
      {metaReady && lines.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">
                  Address {isDelivery ? '' : '(optional for pickup)'}
                </Label>
                <textarea
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  rows={2}
                  placeholder="Street, building, neighbourhood…"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">City</Label>
                <Input
                  type="text"
                  value={shippingCity}
                  onChange={(e) => setShippingCity(e.target.value)}
                  placeholder="e.g. Sosúa"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Delivery notes</Label>
                <textarea
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  rows={2}
                  placeholder="Gate code, courier instructions, customer preferences…"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Payment (optional) */}
      {metaReady && lines.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Payment{' '}
              <span className="text-xs font-normal text-muted-foreground">
                (optional — leave empty for pay-on-delivery)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {moneyAccounts.length === 0 ? (
              <p className="text-sm text-rose-700">
                No active money accounts exist. You can still create the order
                unpaid; add an account in Settings to record payments.
              </p>
            ) : null}

            {payments.map((p) => (
              <div
                key={p.tender_id}
                className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-12"
              >
                <div className="space-y-1 sm:col-span-3">
                  <Label className="text-xs">Method</Label>
                  <Select
                    value={p.method}
                    onValueChange={(v) =>
                      updatePayment(p.tender_id, { method: v as PaymentMethod })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHOD_OPTIONS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 sm:col-span-3">
                  <Label className="text-xs">Amount (DOP)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={centsToDopString(p.amount_cents)}
                    onChange={(e) =>
                      updatePayment(p.tender_id, {
                        amount_cents: dopStringToCents(e.target.value),
                      })
                    }
                  />
                </div>

                <div className="space-y-1 sm:col-span-3">
                  <Label className="text-xs">Account</Label>
                  <Select
                    value={p.money_account_id || undefined}
                    onValueChange={(v) =>
                      updatePayment(p.tender_id, { money_account_id: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick…" />
                    </SelectTrigger>
                    <SelectContent>
                      {moneyAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}{' '}
                          <span className="text-xs text-muted-foreground">
                            ({a.kind})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Reference</Label>
                  <Input
                    type="text"
                    value={p.reference}
                    onChange={(e) =>
                      updatePayment(p.tender_id, { reference: e.target.value })
                    }
                    placeholder="(optional)"
                  />
                </div>

                <div className="flex items-end justify-end sm:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePayment(p.tender_id)}
                    aria-label="Remove tender"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addPayment(Math.max(0, outstanding))}
                disabled={moneyAccounts.length === 0}
              >
                <Plus className="mr-1 size-4" />
                Add payment
              </Button>

              {payments.length > 0 ? (
                <div className="text-sm tabular-nums">
                  <span className="text-muted-foreground">Paid:</span>{' '}
                  <span className="font-medium">{formatDOP(paymentTotal)}</span>
                  <span className="mx-2 text-muted-foreground">/</span>
                  <span className="text-muted-foreground">Total:</span>{' '}
                  <span className="font-medium">
                    {formatDOP(totals.grandTotal)}
                  </span>
                  {outstanding > 0 ? (
                    <span className="ml-3 text-amber-700">
                      Outstanding: {formatDOP(outstanding)}
                    </span>
                  ) : null}
                  {outstanding < 0 ? (
                    <span className="ml-3 text-rose-700">
                      Overpayment: {formatDOP(-outstanding)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Submit row */}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          disabled={!confirmReady || submitting}
          title={confirmDisabledReason ?? 'Create order'}
          onClick={() => setConfirmOpen(true)}
        >
          {submitting ? 'Creating…' : 'Create order'}
        </Button>
      </div>

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create this online order?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  {lines.length} {lines.length === 1 ? 'item' : 'items'}, total{' '}
                  {formatDOP(totals.grandTotal)},{' '}
                  {payments.length === 0
                    ? 'unpaid'
                    : `paid ${formatDOP(paymentTotal)}`}
                  .
                </div>
                {anyOverStock ? (
                  <div className="text-amber-700">
                    Warning: one or more lines exceed available stock. The RPC
                    will reject with insufficient_stock unless you reduce qty.
                  </div>
                ) : null}
                {isDelivery && !shippingAddress.trim() ? (
                  <div className="text-amber-700">
                    Delivery method without a shipping address — confirm this
                    is intentional.
                  </div>
                ) : null}
                {outstanding < 0 ? (
                  <div className="text-rose-700">
                    Overpayment of {formatDOP(-outstanding)} will be recorded.
                  </div>
                ) : null}
                <div className="text-muted-foreground">
                  This writes the sale, locks inventory, and records any
                  payments + commissions atomically. Cancellation later
                  returns stock and reverses payments.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault()
                setConfirmOpen(false)
                void handleConfirm()
              }}
            >
              Create order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

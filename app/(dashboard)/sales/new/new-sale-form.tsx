'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
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
import { Plus, Trash2 } from 'lucide-react'
import { formatDOP } from '@/lib/format'
import { ProductSearch } from './product-search'
import { confirmPosSale } from '../actions'
import { QuickCustomerDialog } from './quick-customer-dialog'
import type {
  CustomerPickerItem,
  MoneyAccount,
  ProductSearchResult,
  SaleCategoryPickerItem,
  SellerOption,
} from '@/lib/sales'
// Round 16.4: auto-discount integration
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
  categories: SaleCategoryPickerItem[]
  // Round 16.4: pre-fetched active discount rules. Pure client-side
  // resolution; SQL function is the authority at confirm time.
  activeDiscountRules: DiscountRuleRow[]
  // Round 25o: owner/admin take payment at the POS; sellers/distributors
  // create unpaid ORDERS (no payment step) that the owner settles later.
  // Defaults to true so existing behaviour is unchanged.
  canTakePayment?: boolean
}

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

// A cart line. Round 16.4 added is_manual_discount + discount_breakdown.
type CartLine = {
  line_id: string
  product_id: string
  primary_category_id: string | null
  sku: string
  name: string
  primary_image_url: string | null
  commission_percent: number
  unit_price_cents: number
  qty: number
  line_discount_cents: number
  qty_on_hand_at_add: number
  // Round 16.4: discount auto/manual state
  is_manual_discount: boolean
  discount_breakdown: AppliedDiscount[]
}

type CartPayment = {
  tender_id: string
  method: PaymentMethod
  amount_cents: number
  money_account_id: string
  reference: string
}

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

function pickDefaultAccountId(
  accounts: MoneyAccount[],
  method: PaymentMethod
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

export function NewSaleForm({
  customers,
  sellers,
  defaultSellerId,
  warehouses,
  moneyAccounts,
  categories,
  activeDiscountRules,
  canTakePayment = true,
}: Props) {
  const [customerId, setCustomerId] = useState<string>(WALKIN)
  const [sellerId, setSellerId] = useState<string>(defaultSellerId ?? '')
  const [sourceWarehouseId, setSourceWarehouseId] = useState<string>('')
  const [fulfillmentWarehouseId, setFulfillmentWarehouseId] = useState<string>('')
  const [fulfillmentMethod, setFulfillmentMethod] =
    useState<'in_store' | 'pickup' | 'delivery'>('in_store')

  const [fulfillmentLinked, setFulfillmentLinked] = useState(true)

  const [lines, setLines] = useState<CartLine[]>([])
  const [saleDiscountCents, setSaleDiscountCents] = useState<number>(0)
  const [payments, setPayments] = useState<CartPayment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const router = useRouter()

  // Round 25q: customers added via the quick "+ New customer" dialog are
  // merged into the dropdown and selectable immediately.
  const [extraCustomers, setExtraCustomers] = useState<CustomerPickerItem[]>([])
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const allCustomers = useMemo(
    () => [...customers, ...extraCustomers],
    [customers, extraCustomers]
  )

  // Round 16.4: customer id usable by the resolver (NULL for walk-in).
  const resolverCustomerId = customerId === WALKIN ? null : customerId
  // Round 17: customer's club_tier for tier-based discount rules.
  const resolverClubTier =
    customerId === WALKIN
      ? null
      : allCustomers.find((c) => c.id === customerId)?.club_tier ?? null

  function onSourceWarehouseChange(id: string) {
    setSourceWarehouseId(id)
    if (fulfillmentLinked) setFulfillmentWarehouseId(id)
    if (lines.length > 0 && id !== sourceWarehouseId) {
      setLines([])
      setPayments([])
    }
  }

  function onFulfillmentWarehouseChange(id: string) {
    setFulfillmentWarehouseId(id)
    setFulfillmentLinked(id === sourceWarehouseId)
  }

  const chosenCustomer =
    customerId === WALKIN ? null : allCustomers.find((c) => c.id === customerId) ?? null
  const customerHasClubTier =
    !!chosenCustomer?.club_tier && chosenCustomer.club_tier !== 'none'

  const metaReady = !!sourceWarehouseId && !!fulfillmentWarehouseId && !!sellerId

  // === cart ops ===

  function addProduct(p: ProductSearchResult) {
    const unit_price_cents = resolveDefaultPrice(p, customerHasClubTier)
    // Round 16.4: resolve auto-discounts at add time
    const result = resolveLineDiscount({
      productId: p.id,
      categoryId: p.primary_category_id,
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
        primary_category_id: p.primary_category_id,
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

  // Round 16.4: updateLine recomputes the auto-discount on non-manual
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
            categoryId: merged.primary_category_id,
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
      })
    )
  }

  function removeLine(line_id: string) {
    setLines((prev) => prev.filter((l) => l.line_id !== line_id))
  }

  // Round 16.4: customer change recomputes auto-discounts on all
  // non-manual lines. Manual-discount lines are untouched.
  useEffect(() => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.is_manual_discount) return l
        const result = resolveLineDiscount({
          productId: l.product_id,
          categoryId: l.primary_category_id,
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
      })
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
    const grandTotal = Math.max(0, afterLineDiscounts - saleDiscountCents)
    return { subtotal, lineDiscounts, grandTotal }
  }, [lines, saleDiscountCents])

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
            money_account_id: pickDefaultAccountId(moneyAccounts, patch.method),
          }
        }
        return { ...p, ...patch }
      })
    )
  }

  function removePayment(tender_id: string) {
    setPayments((prev) => prev.filter((p) => p.tender_id !== tender_id))
  }

  // Auto-seed first tender when cart goes from empty to non-empty.
  // Order mode (sellers) has no payment step, so don't seed.
  useEffect(() => {
    if (
      canTakePayment &&
      lines.length > 0 &&
      payments.length === 0 &&
      moneyAccounts.length > 0
    ) {
      addPayment(totals.grandTotal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length])

  const paymentTotal = useMemo(
    () => payments.reduce((sum, p) => sum + p.amount_cents, 0),
    [payments]
  )
  const outstanding = totals.grandTotal - paymentTotal

  // === confirm gate ===

  const confirmDisabledReason: string | null = useMemo(() => {
    if (!metaReady) return 'Set seller and warehouses first'
    if (lines.length === 0) return 'Add at least one product to the cart'
    // Payment requirements only apply when this user takes payment.
    if (canTakePayment) {
      if (payments.length === 0) return 'Record at least one payment'
      if (payments.some((p) => !p.money_account_id))
        return 'Pick an account for every payment row'
      if (paymentTotal <= 0) return 'Payment amount must be greater than zero'
    }
    return null
  }, [metaReady, lines.length, payments, paymentTotal, canTakePayment])

  const confirmReady = confirmDisabledReason === null

  const anyOverStock = useMemo(
    () => lines.some((l) => l.qty > l.qty_on_hand_at_add),
    [lines]
  )

  async function handleConfirm() {
    if (!confirmReady) return
    setSubmitting(true)
    try {
      const res = await confirmPosSale({
        customer_id: customerId === WALKIN ? null : customerId,
        seller_id: sellerId,
        source_warehouse_id: sourceWarehouseId,
        fulfillment_warehouse_id: fulfillmentWarehouseId,
        fulfillment_method: fulfillmentMethod,
        discount_cents: saleDiscountCents,
        items: lines.map((l) => ({
          product_id: l.product_id,
          qty: l.qty,
          unit_price_cents: l.unit_price_cents,
          discount_cents: l.line_discount_cents,
          // 16.6: send the resolver's breakdown so the RPC writes
          // per-rule audit rows. Manual lines have empty breakdown.
          discount_breakdown: l.discount_breakdown.map((b) => ({
            rule_id: b.ruleId,
            rule_kind: b.ruleKind,
            percent: b.percent,
            amount_cents: b.amountCents,
            cap_hit: b.capHit,
          })),
        })),
        // Order mode (sellers/distributors): no payment - the owner records
        // it later. The RPC creates a confirmed, unpaid order and posts
        // nothing to the ledger.
        payments: canTakePayment
          ? payments.map((p) => ({
              method: p.method,
              amount_cents: p.amount_cents,
              money_account_id: p.money_account_id,
              reference: p.reference || null,
            }))
          : [],
      })
      if (res.ok) {
        toast.success(
          canTakePayment
            ? `Sale ${res.invoice_number} confirmed.`
            : `Order ${res.invoice_number} created.`
        )
        router.push(`/sales/${res.sale_id}`)
      } else {
        toast.error(res.error)
        setSubmitting(false)
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Confirm sale failed.'
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {canTakePayment && moneyAccounts.length === 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-medium">No active money accounts</div>
          <div className="mt-0.5">
            Before you can confirm a sale you need at least one active money
            account (cash drawer, bank, etc). Set one up in Settings, then
            come back here.
          </div>
        </div>
      )}
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
                  {allCustomers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 h-7 gap-1 px-2 text-xs"
                onClick={() => setNewCustomerOpen(true)}
              >
                <Plus className="size-3" />
                New customer
              </Button>
              <QuickCustomerDialog
                open={newCustomerOpen}
                onOpenChange={setNewCustomerOpen}
                onCreated={(c) => {
                  setExtraCustomers((prev) => [...prev, c])
                  setCustomerId(c.id)
                }}
              />
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
                categories={categories}
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
                              {/* Round 16.4: auto-discount hint */}
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

      {canTakePayment && metaReady && lines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {moneyAccounts.length === 0 && (
              <p className="text-sm text-rose-700">
                No active money accounts exist. Configure at least one before
                ringing up sales.
              </p>
            )}

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
                Add tender
              </Button>

              <div className="text-sm tabular-nums">
                <span className="text-muted-foreground">Paid:</span>{' '}
                <span className="font-medium">{formatDOP(paymentTotal)}</span>
                <span className="mx-2 text-muted-foreground">/</span>
                <span className="text-muted-foreground">Total:</span>{' '}
                <span className="font-medium">{formatDOP(totals.grandTotal)}</span>
                {outstanding > 0 && (
                  <span className="ml-3 text-amber-700">
                    Outstanding: {formatDOP(outstanding)}
                  </span>
                )}
                {outstanding < 0 && (
                  <span className="ml-3 text-rose-700">
                    Overpayment: {formatDOP(-outstanding)}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!canTakePayment && metaReady && lines.length > 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          This is an <span className="font-medium">order</span> — no payment is
          taken here. The owner records payment once the customer settles up.
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" type="button" disabled>
          Save draft
        </Button>
        <Button
          type="button"
          disabled={!confirmReady || submitting}
          title={
            confirmDisabledReason ??
            (canTakePayment ? 'Confirm sale' : 'Create order')
          }
          onClick={() => setConfirmOpen(true)}
        >
          {submitting
            ? canTakePayment
              ? 'Confirming…'
              : 'Creating…'
            : canTakePayment
              ? 'Confirm sale'
              : 'Create order'}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {canTakePayment ? 'Confirm this sale?' : 'Create this order?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  {lines.length} {lines.length === 1 ? 'item' : 'items'}, total{' '}
                  {formatDOP(totals.grandTotal)}
                  {canTakePayment ? (
                    <>, paid {formatDOP(paymentTotal)}.</>
                  ) : (
                    <> (unpaid order).</>
                  )}
                </div>
                {anyOverStock && (
                  <div className="text-amber-700">
                    Warning: one or more lines exceed the stock that was on
                    hand when added. Confirming anyway will push the oldest
                    lot negative.
                  </div>
                )}
                {canTakePayment && outstanding > 0 && (
                  <div className="text-amber-700">
                    Outstanding balance of {formatDOP(outstanding)} will
                    remain after this sale.
                  </div>
                )}
                {canTakePayment && outstanding < 0 && (
                  <div className="text-rose-700">
                    Overpayment of {formatDOP(-outstanding)} will be recorded.
                  </div>
                )}
                <div className="text-muted-foreground">
                  {canTakePayment
                    ? 'This writes the sale, consumes inventory, and records payments + commissions atomically. It cannot be undone without a refund.'
                    : 'This creates an unpaid order: it consumes inventory and sets the commission pending, but records no payment. The owner records payment later. It cannot be undone without a refund.'}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault()
                setConfirmOpen(false)
                void handleConfirm()
              }}
            >
              {canTakePayment ? 'Confirm sale' : 'Create order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

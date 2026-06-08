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
import { confirmPosSale, getCustomerTier, previewCoupon } from '../actions'
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
import { type Locale, t, plural } from '@/lib/i18n/dictionary'

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
  locale: Locale
}

const WALKIN = '__walkin__'

const FULFILLMENT_OPTIONS: Array<{
  value: 'in_store' | 'pickup' | 'delivery'
  labelKey: string
  hintKey: string
}> = [
  { value: 'in_store', labelKey: 'fulfill.in_store', hintKey: 'ns.fhInStore' },
  { value: 'pickup', labelKey: 'fulfill.pickup', hintKey: 'ns.fhPickup' },
  { value: 'delivery', labelKey: 'fulfill.delivery', hintKey: 'ns.fhDelivery' },
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
  labelKey: string
}> = [
  { value: 'cash', labelKey: 'method.cash' },
  { value: 'card', labelKey: 'method.card' },
  { value: 'transfer', labelKey: 'method.transfer' },
  { value: 'paypal', labelKey: 'method.paypal' },
  { value: 'stripe', labelKey: 'method.stripe' },
  { value: 'credit', labelKey: 'ns.storeCredit' },
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
  // The normal starting price: warehouse override, else club price (if the
  // customer has a tier), else base price.
  let price: number
  if (product.warehouse_price_override_cents != null) {
    price = product.warehouse_price_override_cents
  } else if (customerHasClubTier && product.club_price_cents != null) {
    price = product.club_price_cents
  } else {
    price = product.base_price_cents
  }
  // sale price (round-58c): a direct per-product sale price wins if it's
  // lower. Discount rules + loyalty then stack on top (matches online).
  if (product.sale_price_cents != null && product.sale_price_cents > 0) {
    price = Math.min(price, product.sale_price_cents)
  }
  return price
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
  locale,
}: Props) {
  const [customerId, setCustomerId] = useState<string>(WALKIN)
  // Loyalty tier (spend-based), fetched when the customer changes. Replaces
  // the old manual club_tier for both pricing rules and the discount.
  const [tierPct, setTierPct] = useState(0)
  const [tierName, setTierName] = useState('')
  const [sellerId, setSellerId] = useState<string>(defaultSellerId ?? '')
  const [sourceWarehouseId, setSourceWarehouseId] = useState<string>('')
  const [fulfillmentWarehouseId, setFulfillmentWarehouseId] = useState<string>('')
  const [fulfillmentMethod, setFulfillmentMethod] =
    useState<'in_store' | 'pickup' | 'delivery'>('in_store')

  const [fulfillmentLinked, setFulfillmentLinked] = useState(true)

  const [lines, setLines] = useState<CartLine[]>([])
  const [saleDiscountCents, setSaleDiscountCents] = useState<number>(0)
  // Round 42: coupon code state. Preview only; the RPC re-checks at submit.
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string
    name: string
    percent: number | null
    amount_cents: number | null
  } | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [couponChecking, setCouponChecking] = useState(false)
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
  // Loyalty replaces club_tier: do NOT feed club_tier into the resolver, so
  // old tier-gated discount rules no longer fire (the loyalty % covers it).
  const resolverClubTier = null

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

  // Fetch the selected customer's loyalty tier (walk-in => none).
  useEffect(() => {
    let active = true
    if (customerId === WALKIN) {
      setTierPct(0)
      setTierName('')
      return
    }
    getCustomerTier(customerId).then((r) => {
      if (!active) return
      setTierPct(r.discountPct)
      setTierName(r.tierName)
    })
    return () => {
      active = false
    }
  }, [customerId])

  // === totals ===

  const totals = useMemo(() => {
    let subtotal = 0
    let lineDiscounts = 0
    let loyaltyDiscount = 0
    for (const l of lines) {
      const gross = l.unit_price_cents * l.qty
      subtotal += gross
      lineDiscounts += l.line_discount_cents
      // Loyalty stacks on top of any rule discount, but total per line is
      // capped at 30% of gross (matches online and the in-person promo cap).
      if (tierPct > 0) {
        const cap = Math.floor(gross * 0.3)
        const desired = Math.round((gross * tierPct) / 100)
        loyaltyDiscount += Math.max(0, Math.min(cap - l.line_discount_cents, desired))
      }
    }
    const afterLineDiscounts = subtotal - lineDiscounts - loyaltyDiscount
    // Round 42: coupon comes off the SAME base the RPC uses (subtotal after
    // line + member discounts), and after any manual order discount. Recomputed
    // here from the rule's percent/amount so it tracks cart changes without
    // re-calling the server; the RPC computes the authoritative amount at submit.
    let couponDiscount = 0
    if (appliedCoupon) {
      const raw =
        appliedCoupon.percent != null
          ? Math.floor((afterLineDiscounts * appliedCoupon.percent) / 100)
          : Math.min(appliedCoupon.amount_cents ?? 0, afterLineDiscounts)
      couponDiscount = Math.max(
        0,
        Math.min(raw, afterLineDiscounts - saleDiscountCents)
      )
    }
    const grandTotal = Math.max(
      0,
      afterLineDiscounts - saleDiscountCents - couponDiscount
    )
    return {
      subtotal,
      lineDiscounts,
      loyaltyDiscount,
      afterLineDiscounts,
      couponDiscount,
      grandTotal,
    }
  }, [lines, saleDiscountCents, tierPct, appliedCoupon])

  // Round 42: validate + apply a coupon code against the current base.
  async function applyCoupon() {
    const code = couponInput.trim()
    if (!code) return
    setCouponChecking(true)
    setCouponError(null)
    try {
      const res = await previewCoupon({
        code,
        sourceWarehouseId,
        channel: 'pos',
        baseCents: totals.afterLineDiscounts,
      })
      if (!res.ok) {
        setAppliedCoupon(null)
        setCouponError(res.error)
        return
      }
      if (!res.valid) {
        setAppliedCoupon(null)
        setCouponError(
          locale === 'es'
            ? 'Código no válido para esta venta (expirado, de otra tienda o mal escrito).'
            : "Code isn't valid for this sale (expired, another store, or mistyped)."
        )
        return
      }
      setAppliedCoupon({
        code,
        name: res.name,
        percent: res.percent,
        amount_cents: res.amount_cents,
      })
      setCouponInput(code)
    } catch (e) {
      setAppliedCoupon(null)
      setCouponError(
        e instanceof Error
          ? e.message
          : locale === 'es'
            ? 'No se pudo verificar el cupón.'
            : 'Coupon check failed.'
      )
    } finally {
      setCouponChecking(false)
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null)
    setCouponError(null)
    setCouponInput('')
  }

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
    if (!metaReady) return t(locale, 'ns.gateMetaFirst')
    if (lines.length === 0) return t(locale, 'ns.gateAddProduct')
    // Payment requirements only apply when this user takes payment.
    if (canTakePayment) {
      if (payments.length === 0) return t(locale, 'ns.gateRecordPayment')
      if (payments.some((p) => !p.money_account_id))
        return t(locale, 'ns.gatePickAccountAll')
      if (paymentTotal <= 0) return t(locale, 'ns.gatePaymentPositive')
    }
    return null
  }, [metaReady, lines.length, payments, paymentTotal, canTakePayment, locale])

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
        coupon_code: appliedCoupon?.code ?? null,
        items: lines.map((l) => {
          const gross = l.unit_price_cents * l.qty
          const cap = Math.floor(gross * 0.3)
          const desired = tierPct > 0 ? Math.round((gross * tierPct) / 100) : 0
          const loyalty = Math.max(0, Math.min(cap - l.line_discount_cents, desired))
          return {
          product_id: l.product_id,
          qty: l.qty,
          unit_price_cents: l.unit_price_cents,
          discount_cents: l.line_discount_cents + loyalty,
          // 16.6: send the resolver's breakdown so the RPC writes
          // per-rule audit rows. Manual lines have empty breakdown.
          discount_breakdown: l.discount_breakdown.map((b) => ({
            rule_id: b.ruleId,
            rule_kind: b.ruleKind,
            percent: b.percent,
            amount_cents: b.amountCents,
            cap_hit: b.capHit,
          })),
          }
        }),
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
            ? `${t(locale, 'ns.saleWord')} ${res.invoice_number} ${t(locale, 'ns.confirmedSuffix')}`
            : `${t(locale, 'ns.orderWord')} ${res.invoice_number} ${t(locale, 'ns.createdSuffix')}`
        )
        router.push(`/sales/${res.sale_id}`)
      } else {
        toast.error(res.error)
        setSubmitting(false)
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t(locale, 'ns.toastConfirmFailed')
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {canTakePayment && moneyAccounts.length === 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-medium">{t(locale, 'ns.noAcctTitle')}</div>
          <div className="mt-0.5">
            {t(locale, 'ns.noAcctBody')}
          </div>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t(locale, 'ns.saleDetails')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1 sm:col-span-2 lg:col-span-1">
              <Label className="text-xs">{t(locale, 'sales.col.customer')}</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WALKIN}>{t(locale, 'ns.walkinOption')}</SelectItem>
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
                {t(locale, 'ns.qcTitle')}
              </Button>
              <QuickCustomerDialog
                open={newCustomerOpen}
                onOpenChange={setNewCustomerOpen}
                locale={locale}
                onCreated={(c) => {
                  setExtraCustomers((prev) => [...prev, c])
                  setCustomerId(c.id)
                }}
              />
              {tierPct > 0 && tierName && (
                <p className="text-xs">
                  <Badge variant="secondary">
                    {tierName} · {tierPct}%
                  </Badge>
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">
                {t(locale, 'sales.col.seller')} <span className="text-rose-600">*</span>
              </Label>
              <Select value={sellerId} onValueChange={setSellerId}>
                <SelectTrigger>
                  <SelectValue placeholder={t(locale, 'ns.pickSeller')} />
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
                {t(locale, 'sd.sourceWarehouse')} <span className="text-rose-600">*</span>
              </Label>
              <Select
                value={sourceWarehouseId}
                onValueChange={onSourceWarehouseChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t(locale, 'ns.pickSource')} />
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
                {t(locale, 'ns.fulfillmentWarehouse')} <span className="text-rose-600">*</span>
              </Label>
              <Select
                value={fulfillmentWarehouseId}
                onValueChange={onFulfillmentWarehouseChange}
                disabled={!sourceWarehouseId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      sourceWarehouseId ? t(locale, 'ns.pickFulfillment') : t(locale, 'ns.pickSourceFirst')
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
                    {t(locale, 'ns.sameAsSource')}
                  </p>
                )}
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">{t(locale, 'ns.fulfillmentMethod')}</Label>
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
                      <div className="font-medium">{t(locale, o.labelKey)}</div>
                      <div className="text-xs text-muted-foreground">{t(locale, o.hintKey)}</div>
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
          <CardTitle className="text-base">{t(locale, 'ns.cart')}</CardTitle>
        </CardHeader>
        <CardContent className="min-h-[32rem] space-y-4">
          {!metaReady ? (
            <p className="text-sm text-muted-foreground">
              {t(locale, 'ns.cartMetaHint')}
            </p>
          ) : (
            <>
              <ProductSearch
                warehouseId={sourceWarehouseId}
                categories={categories}
                onAdd={addProduct}
                locale={locale}
              />

              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t(locale, 'ns.cartEmpty')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">{t(locale, 'sd.colProduct')}</th>
                        <th className="py-2 pr-3 font-medium">{t(locale, 'sd.colQty')}</th>
                        <th className="py-2 pr-3 font-medium">{t(locale, 'sd.colUnitPrice')}</th>
                        <th className="py-2 pr-3 font-medium">{t(locale, 'ns.lineDiscount')}</th>
                        <th className="py-2 pr-3 text-right font-medium">{t(locale, 'sales.col.total')}</th>
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
                                        {t(locale, 'ns.stock')}: {l.qty_on_hand_at_add} ({t(locale, 'ns.shortBy')}{' '}
                                        {l.qty - l.qty_on_hand_at_add})
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        {t(locale, 'ns.stockAtAdd')}: {l.qty_on_hand_at_add}
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
                                    ? t(locale, 'ns.cappedAt30')
                                    : ''}
                                </div>
                              ) : null}
                              {l.is_manual_discount ? (
                                <div className="mt-1 text-xs text-amber-700">
                                  {t(locale, 'ns.manualSilenced')}
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
                                aria-label={t(locale, 'ns.removeLine')}
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
                    <Label className="text-xs">{t(locale, 'ns.saleLevelDiscount')}</Label>
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
                  {/* Round 42: coupon code */}
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {locale === 'es' ? 'Cupón' : 'Coupon code'}
                    </Label>
                    {appliedCoupon ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="font-mono uppercase">
                          {appliedCoupon.code}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {appliedCoupon.percent != null
                            ? `${appliedCoupon.percent}%`
                            : formatDOP(appliedCoupon.amount_cents ?? 0)}
                          {appliedCoupon.name ? ` · ${appliedCoupon.name}` : ''}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={removeCoupon}
                        >
                          {locale === 'es' ? 'Quitar' : 'Remove'}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              applyCoupon()
                            }
                          }}
                          placeholder={locale === 'es' ? 'Código' : 'Code'}
                          className="w-32 font-mono uppercase"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={applyCoupon}
                          disabled={couponChecking || !couponInput.trim()}
                        >
                          {couponChecking
                            ? locale === 'es'
                              ? 'Verificando…'
                              : 'Checking…'
                            : locale === 'es'
                              ? 'Aplicar'
                              : 'Apply'}
                        </Button>
                      </div>
                    )}
                    {couponError ? (
                      <p className="text-xs text-rose-600">{couponError}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1 text-sm sm:text-right">
                    <div className="flex justify-between sm:justify-end sm:gap-6">
                      <span className="text-muted-foreground">{t(locale, 'sd.subtotal')}</span>
                      <span className="tabular-nums">
                        {formatDOP(totals.subtotal)}
                      </span>
                    </div>
                    {totals.lineDiscounts > 0 && (
                      <div className="flex justify-between sm:justify-end sm:gap-6">
                        <span className="text-muted-foreground">
                          {t(locale, 'ns.lineDiscounts')}
                        </span>
                        <span className="tabular-nums">
                          −{formatDOP(totals.lineDiscounts)}
                        </span>
                      </div>
                    )}
                    {totals.loyaltyDiscount > 0 && (
                      <div className="flex justify-between sm:justify-end sm:gap-6">
                        <span className="text-muted-foreground">
                          {locale === 'es' ? 'Descuento socio' : 'Member discount'}
                          {tierName ? ` (${tierName} ${tierPct}%)` : ''}
                        </span>
                        <span className="tabular-nums">
                          −{formatDOP(totals.loyaltyDiscount)}
                        </span>
                      </div>
                    )}
                    {saleDiscountCents > 0 && (
                      <div className="flex justify-between sm:justify-end sm:gap-6">
                        <span className="text-muted-foreground">
                          {t(locale, 'ns.saleDiscount')}
                        </span>
                        <span className="tabular-nums">
                          −{formatDOP(saleDiscountCents)}
                        </span>
                      </div>
                    )}
                    {totals.couponDiscount > 0 && (
                      <div className="flex justify-between sm:justify-end sm:gap-6">
                        <span className="text-muted-foreground">
                          {locale === 'es' ? 'Cupón' : 'Coupon'}
                          {appliedCoupon ? ` (${appliedCoupon.code})` : ''}
                        </span>
                        <span className="tabular-nums">
                          −{formatDOP(totals.couponDiscount)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1 text-base font-semibold sm:justify-end sm:gap-6">
                      <span>{t(locale, 'sales.col.total')}</span>
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
            <CardTitle className="text-base">{t(locale, 'ns.payment')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {moneyAccounts.length === 0 && (
              <p className="text-sm text-rose-700">
                {t(locale, 'ns.noAcctInline')}
              </p>
            )}

            {payments.map((p) => (
              <div
                key={p.tender_id}
                className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-12"
              >
                <div className="space-y-1 sm:col-span-3">
                  <Label className="text-xs">{t(locale, 'sd.method')}</Label>
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
                          {t(locale, m.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 sm:col-span-3">
                  <Label className="text-xs">{t(locale, 'sd.amountDop')}</Label>
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
                  <Label className="text-xs">{t(locale, 'sd.account')}</Label>
                  <Select
                    value={p.money_account_id || undefined}
                    onValueChange={(v) =>
                      updatePayment(p.tender_id, { money_account_id: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t(locale, 'ns.pickShort')} />
                    </SelectTrigger>
                    <SelectContent>
                      {moneyAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}{' '}
                          <span className="text-xs text-muted-foreground">
                            ({t(locale, 'acctKind.' + a.kind)})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">{t(locale, 'sd.reference')}</Label>
                  <Input
                    type="text"
                    value={p.reference}
                    onChange={(e) =>
                      updatePayment(p.tender_id, { reference: e.target.value })
                    }
                    placeholder={t(locale, 'ns.optionalParen')}
                  />
                </div>

                <div className="flex items-end justify-end sm:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePayment(p.tender_id)}
                    aria-label={t(locale, 'ns.removeTender')}
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
                {t(locale, 'ns.addTender')}
              </Button>

              <div className="text-sm tabular-nums">
                <span className="text-muted-foreground">{t(locale, 'sales.col.paid')}:</span>{' '}
                <span className="font-medium">{formatDOP(paymentTotal)}</span>
                <span className="mx-2 text-muted-foreground">/</span>
                <span className="text-muted-foreground">{t(locale, 'sales.col.total')}:</span>{' '}
                <span className="font-medium">{formatDOP(totals.grandTotal)}</span>
                {outstanding > 0 && (
                  <span className="ml-3 text-amber-700">
                    {t(locale, 'sd.outstanding')}: {formatDOP(outstanding)}
                  </span>
                )}
                {outstanding < 0 && (
                  <span className="ml-3 text-rose-700">
                    {t(locale, 'ns.overpayment')}: {formatDOP(-outstanding)}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!canTakePayment && metaReady && lines.length > 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {t(locale, 'ns.orderInfo')}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" type="button" disabled>
          {t(locale, 'ns.saveDraft')}
        </Button>
        <Button
          type="button"
          disabled={!confirmReady || submitting}
          title={
            confirmDisabledReason ??
            (canTakePayment ? t(locale, 'ns.confirmSale') : t(locale, 'ns.createOrder'))
          }
          onClick={() => setConfirmOpen(true)}
        >
          {submitting
            ? canTakePayment
              ? t(locale, 'ns.confirming')
              : t(locale, 'ns.creating')
            : canTakePayment
              ? t(locale, 'ns.confirmSale')
              : t(locale, 'ns.createOrder')}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {canTakePayment ? t(locale, 'ns.confirmSaleTitle') : t(locale, 'ns.createOrderTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  {lines.length} {plural(locale, lines.length, 'item.one', 'item.other')}, {t(locale, 'ns.totalWord')}{' '}
                  {formatDOP(totals.grandTotal)}
                  {canTakePayment ? (
                    <>, {t(locale, 'ns.paidWord')} {formatDOP(paymentTotal)}.</>
                  ) : (
                    <> {t(locale, 'ns.unpaidOrderParen')}</>
                  )}
                </div>
                {anyOverStock && (
                  <div className="text-amber-700">
                    {t(locale, 'ns.warnOverStock')}
                  </div>
                )}
                {canTakePayment && outstanding > 0 && (
                  <div className="text-amber-700">
                    {t(locale, 'ns.outstandingBalPre')} {formatDOP(outstanding)} {t(locale, 'ns.outstandingBalPost')}
                  </div>
                )}
                {canTakePayment && outstanding < 0 && (
                  <div className="text-rose-700">
                    {t(locale, 'ns.overpaymentOfPre')} {formatDOP(-outstanding)} {t(locale, 'ns.overpaymentOfPost')}
                  </div>
                )}
                <div className="text-muted-foreground">
                  {canTakePayment
                    ? t(locale, 'ns.confirmNoteSale')
                    : t(locale, 'ns.confirmNoteOrder')}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>{t(locale, 'common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault()
                setConfirmOpen(false)
                void handleConfirm()
              }}
            >
              {canTakePayment ? t(locale, 'ns.confirmSale') : t(locale, 'ns.createOrder')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

'use client'
// Round 37c — Caja (interactive register). [v5: + seller picker (owner/admin)]
//
// MOBILE (default): product grid fills the screen; a FIXED bottom bar shows the
// running total + a "Carrito (n)" button that slides the full cart up as a
// sheet (qty controls, discount, Cobrar/Reservar). DESKTOP (md+): the same cart
// also shows as a sticky side box. One cart definition (renderCart) is reused
// in both places. The sale still goes through the existing confirmPosSale
// engine — stock/discounts/ledger/invoice unchanged.
//
// v5 (2026-06-24): owner/admin can pick WHICH seller a register sale is credited
// to (commission + My Sales follow the chosen seller). The picker shows only
// when `canChooseSeller` is true; everyone else stays locked to the logged-in
// caller. The chosen seller resets back to the caller after each completed sale
// so a later sale is never accidentally credited to the previous seller.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Search, Plus, Minus, Trash2, ShoppingCart, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDOP } from '@/lib/format'
import type { MoneyAccount, ProductSearchResult, CustomerPickerItem } from '@/lib/sales'
import type { DiscountRuleRow } from '@/lib/discount-rules'
import {
  resolveLineDiscount,
  type AppliedDiscount,
} from '@/lib/discount-rules-resolver'
import type { Locale } from '@/lib/i18n/dictionary'
import { tc } from '@/lib/i18n/register-i18n'
import { QrScanButton } from '@/components/qr-scanner'
import { findProductBySkuAction } from '../scan/actions'
import { confirmPosSale, type ConfirmPosInput } from '../sales/actions'
import { loadRegisterProducts } from './actions'
import { MemberScan } from './member-scan'
import { CustomerPicker } from './customer-picker'
import type { ScannedMember } from './member-scan-actions'

type LookupItem = { id: string; name: string }
type SellerOption = { id: string; full_name: string; role: string }

type Props = {
  warehouses: LookupItem[]
  initialWarehouseId: string
  initialProducts: ProductSearchResult[]
  moneyAccounts: MoneyAccount[]
  activeDiscountRules: DiscountRuleRow[]
  sellerId: string | null
  sellers: SellerOption[]
  canChooseSeller: boolean
  customers: CustomerPickerItem[]
  canTakePayment: boolean
  locale: Locale
}

type CartLine = {
  line_id: string
  product_id: string
  primary_category_id: string | null
  sku: string
  name: string
  primary_image_url: string | null
  unit_price_cents: number
  qty: number
  line_discount_cents: number
  qty_on_hand: number
  discount_breakdown: AppliedDiscount[]
}

const DEBOUNCE_MS = 250

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
function dopStringToCents(s: string): number {
  const n = parseInt(s, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n * 100
}
function centsToDopString(c: number): string {
  return Math.round(c / 100).toString()
}
function priceFor(p: ProductSearchResult): number {
  return p.warehouse_price_override_cents ?? p.base_price_cents
}

export function Register({
  warehouses,
  initialWarehouseId,
  initialProducts,
  moneyAccounts,
  activeDiscountRules,
  sellerId,
  sellers,
  canChooseSeller,
  customers,
  canTakePayment,
  locale,
}: Props) {
  const router = useRouter()
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId)
  const [products, setProducts] = useState<ProductSearchResult[]>(initialProducts)
  const [query, setQuery] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [lines, setLines] = useState<CartLine[]>([])
  const [saleDiscountCents, setSaleDiscountCents] = useState(0)
  const [member, setMember] = useState<ScannedMember | null>(null)
  // Who the sale is credited to. Defaults to the logged-in caller; only
  // owner/admin can change it (canChooseSeller).
  const [activeSellerId, setActiveSellerId] = useState<string | null>(sellerId)
  const [cartOpen, setCartOpen] = useState(false)
  const [pending, start] = useTransition()
  const didMount = useRef(false)
  const reqId = useRef(0)

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    const myId = ++reqId.current
    setLoadingProducts(true)
    const tmr = setTimeout(async () => {
      const res = await loadRegisterProducts({ warehouseId, query: query.trim() })
      if (myId !== reqId.current) return
      setLoadingProducts(false)
      if (res.ok) setProducts(res.products)
      else toast.error(tc(locale, 'rg.toast.loadFailed'))
    }, DEBOUNCE_MS)
    return () => clearTimeout(tmr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, query])

  // Recompute line discounts when the attached member changes — club-tier and
  // customer-override pricing depend on who is on the sale.
  useEffect(() => {
    setLines((prev) =>
      prev.map((l) => {
        const d = lineDiscountFor(l.product_id, l.primary_category_id, l.qty, l.unit_price_cents)
        return { ...l, line_discount_cents: d.totalDiscountCents, discount_breakdown: d.applied }
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member])

  function reloadGrid() {
    const myId = ++reqId.current
    loadRegisterProducts({ warehouseId, query: query.trim() }).then((res) => {
      if (myId !== reqId.current) return
      if (res.ok) setProducts(res.products)
    })
  }

  function onWarehouseChange(id: string) {
    setWarehouseId(id)
    setLines([])
    setSaleDiscountCents(0)
  }

  function lineDiscountFor(productId: string, categoryId: string | null, qty: number, unit: number) {
    return resolveLineDiscount({
      productId,
      categoryId,
      qty,
      unitPriceCents: unit,
      customerId: member?.customerId ?? null,
      customerClubTier: member?.tier ?? null,
      sourceWarehouseId: warehouseId || null,
      rules: activeDiscountRules,
      at: new Date(),
    })
  }

  function addProduct(p: ProductSearchResult) {
    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === p.id)
      if (existing) {
        return prev.map((l) => {
          if (l.product_id !== p.id) return l
          const qty = l.qty + 1
          const d = lineDiscountFor(l.product_id, l.primary_category_id, qty, l.unit_price_cents)
          return { ...l, qty, line_discount_cents: d.totalDiscountCents, discount_breakdown: d.applied }
        })
      }
      const unit = priceFor(p)
      const d = lineDiscountFor(p.id, p.primary_category_id, 1, unit)
      return [
        ...prev,
        {
          line_id: makeId(),
          product_id: p.id,
          primary_category_id: p.primary_category_id,
          sku: p.sku,
          name: p.name,
          primary_image_url: p.primary_image_url,
          unit_price_cents: unit,
          qty: 1,
          line_discount_cents: d.totalDiscountCents,
          qty_on_hand: p.qty_on_hand,
          discount_breakdown: d.applied,
        },
      ]
    })
  }

  async function handleScan(code: string) {
    const res = await findProductBySkuAction(warehouseId, code)
    if (!res.ok) {
      toast.error(res.error || tc(locale, 'rg.toast.failed'))
      return
    }
    if (res.product) {
      addProduct(res.product)
      toast.success(res.product.name)
    } else {
      toast.error(locale === 'es' ? 'No se encontró ese código.' : 'No product for that code.')
    }
  }

  function setQty(line_id: string, qty: number) {
    if (qty < 1) {
      removeLine(line_id)
      return
    }
    setLines((prev) =>
      prev.map((l) => {
        if (l.line_id !== line_id) return l
        const d = lineDiscountFor(l.product_id, l.primary_category_id, qty, l.unit_price_cents)
        return { ...l, qty, line_discount_cents: d.totalDiscountCents, discount_breakdown: d.applied }
      }),
    )
  }
  function removeLine(line_id: string) {
    setLines((prev) => prev.filter((l) => l.line_id !== line_id))
  }
  function clearCart() {
    setLines([])
    setSaleDiscountCents(0)
    setMember(null)
    // Reset the credited seller back to the logged-in caller so the next sale
    // is never accidentally attributed to the previous one.
    setActiveSellerId(sellerId)
  }

  const totals = useMemo(() => {
    let subtotal = 0
    let lineDiscounts = 0
    for (const l of lines) {
      subtotal += l.unit_price_cents * l.qty
      lineDiscounts += l.line_discount_cents
    }
    const grandTotal = Math.max(0, subtotal - lineDiscounts - saleDiscountCents)
    return { subtotal, lineDiscounts, grandTotal }
  }, [lines, saleDiscountCents])

  const cartCount = useMemo(() => lines.reduce((n, l) => n + l.qty, 0), [lines])

  const cashAccountId = useMemo(() => {
    const cash = moneyAccounts.find((a) => a.kind === 'cash')
    return cash?.id ?? moneyAccounts[0]?.id ?? ''
  }, [moneyAccounts])

  function checkout(takePayment: boolean) {
    if (lines.length === 0) {
      toast.error(tc(locale, 'rg.toast.empty'))
      return
    }
    if (!activeSellerId) {
      toast.error(tc(locale, 'rg.toast.noSeller'))
      return
    }
    if (takePayment && totals.grandTotal > 0 && !cashAccountId) {
      toast.error(tc(locale, 'rg.toast.noCash'))
      return
    }

    const input: ConfirmPosInput = {
      customer_id: member?.customerId ?? null,
      seller_id: activeSellerId,
      source_warehouse_id: warehouseId,
      fulfillment_warehouse_id: warehouseId,
      fulfillment_method: 'in_store',
      discount_cents: saleDiscountCents,
      items: lines.map((l) => ({
        product_id: l.product_id,
        qty: l.qty,
        unit_price_cents: l.unit_price_cents,
        discount_cents: l.line_discount_cents,
        discount_breakdown: l.discount_breakdown.map((b) => ({
          rule_id: b.ruleId,
          rule_kind: b.ruleKind,
          percent: b.percent,
          amount_cents: b.amountCents,
          cap_hit: b.capHit,
        })),
      })),
      payments:
        takePayment && totals.grandTotal > 0
          ? [
              {
                method: 'cash',
                amount_cents: totals.grandTotal,
                money_account_id: cashAccountId,
                reference: null,
              },
            ]
          : [],
    }

    start(async () => {
      try {
        const res = await confirmPosSale(input)
        if (res.ok) {
          const word = takePayment ? tc(locale, 'rg.saleWord') : tc(locale, 'rg.orderWord')
          const suffix = takePayment ? tc(locale, 'rg.doneSale') : tc(locale, 'rg.doneOrder')
          toast.success(`${word} ${res.invoice_number} ${suffix}`)
          clearCart()
          setCartOpen(false)
          reloadGrid()
          router.refresh()
        } else {
          toast.error(res.error || tc(locale, 'rg.toast.failed'))
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : tc(locale, 'rg.toast.failed'))
      }
    })
  }

  // The cart body — reused in the desktop side box AND the mobile sheet.
  function renderCart() {
    return (
      <div className="space-y-3">
        {canChooseSeller && sellers.length > 0 ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {locale === 'es' ? 'Vendedor' : 'Seller'}
            </label>
            <Select
              value={activeSellerId ?? ''}
              onValueChange={(v) => setActiveSellerId(v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {(s.full_name || s.id) +
                      (s.id === sellerId ? (locale === 'es' ? ' (yo)' : ' (me)') : '')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <MemberScan member={member} onMember={setMember} locale={locale} />
        {!member ? (
          <CustomerPicker customers={customers} onPick={setMember} locale={locale} />
        ) : null}
        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {tc(locale, 'rg.cartEmpty')}
          </p>
        ) : (
          <div className="divide-y">
            {lines.map((l) => {
              const lineTotal = Math.max(0, l.unit_price_cents * l.qty - l.line_discount_cents)
              return (
                <div key={l.line_id} className="flex items-start gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDOP(l.unit_price_cents)}
                      {l.line_discount_cents > 0 ? ` − ${formatDOP(l.line_discount_cents)}` : ''}
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setQty(l.line_id, l.qty - 1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-8 text-center text-sm tabular-nums">{l.qty}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setQty(l.line_id, l.qty + 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-8 w-8"
                        onClick={() => removeLine(l.line_id)}
                        aria-label={tc(locale, 'rg.remove')}
                      >
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm font-medium tabular-nums">
                    {formatDOP(lineTotal)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="space-y-2 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{tc(locale, 'rg.subtotal')}</span>
            <span className="tabular-nums">{formatDOP(totals.subtotal - totals.lineDiscounts)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{tc(locale, 'rg.discount')}</span>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                step={1}
                value={centsToDopString(saleDiscountCents)}
                onChange={(e) => setSaleDiscountCents(dopStringToCents(e.target.value))}
                className="h-8 w-24 text-right"
              />
              <span className="text-xs text-muted-foreground">RD$</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between border-t pt-2">
            <span className="text-base font-semibold">{tc(locale, 'rg.total')}</span>
            <span className="text-xl font-bold tabular-nums text-emerald-600">
              {formatDOP(totals.grandTotal)}
            </span>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          {canTakePayment ? (
            <Button
              type="button"
              className="h-11 w-full bg-emerald-600 text-base hover:bg-emerald-700"
              disabled={pending || lines.length === 0}
              onClick={() => checkout(true)}
            >
              {pending ? tc(locale, 'rg.charging') : tc(locale, 'rg.charge')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={canTakePayment ? 'outline' : 'default'}
            className="h-11 w-full text-base"
            disabled={pending || lines.length === 0}
            onClick={() => checkout(false)}
          >
            {pending ? tc(locale, 'rg.reserving') : tc(locale, 'rg.reserve')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            disabled={pending || lines.length === 0}
            onClick={clearCart}
          >
            {tc(locale, 'rg.clear')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="md:grid md:gap-4 md:grid-cols-[1fr_300px]">
      {/* ---- Product grid ---- */}
      <div className="space-y-3 pb-24 md:pb-0">
        <div className="flex flex-col gap-2 sm:flex-row">
          {warehouses.length > 1 ? (
            <Select value={warehouseId} onValueChange={onWarehouseChange}>
              <SelectTrigger className="sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tc(locale, 'rg.searchPh')}
              className="pl-9"
              autoComplete="off"
            />
          </div>
          <QrScanButton locale={locale} onScan={handleScan} />
        </div>

        {loadingProducts ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            {tc(locale, 'rg.loading')}
          </p>
        ) : products.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            {tc(locale, 'rg.noProducts')}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((p) => {
              const out = p.qty_on_hand <= 0
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className="group flex flex-col overflow-hidden rounded-md border bg-card text-left transition hover:border-foreground/40 hover:shadow-sm active:scale-[0.97]"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-muted">
                    {p.primary_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.primary_image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ShoppingCart className="h-5 w-5" />
                      </div>
                    )}
                    <span className="absolute right-1 top-1">
                      {out ? (
                        <Badge className="px-1 py-0 text-[10px] bg-rose-100 text-rose-800 hover:bg-rose-100">
                          {tc(locale, 'rg.out')}
                        </Badge>
                      ) : (
                        <Badge
                          className={
                            'px-1 py-0 text-[10px] ' +
                            (p.qty_on_hand < 5
                              ? 'bg-amber-100 text-amber-900 hover:bg-amber-100'
                              : 'bg-background/90 text-foreground hover:bg-background/90')
                          }
                        >
                          {p.qty_on_hand} {tc(locale, 'rg.units')}
                        </Badge>
                      )}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 p-1.5">
                    <div className="line-clamp-2 text-xs font-medium leading-tight">{p.name}</div>
                    <div className="mt-auto text-xs font-semibold text-emerald-600">
                      {formatDOP(priceFor(p))}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ---- Desktop side cart (md+) ---- */}
      <Card className="hidden md:flex md:flex-col md:sticky md:top-4 md:self-start">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            {tc(locale, 'rg.cart')}
          </CardTitle>
        </CardHeader>
        <CardContent>{renderCart()}</CardContent>
      </Card>

      {/* ---- Mobile fixed total bar (hidden on md+) ---- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-3 py-2.5 backdrop-blur md:hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[11px] leading-none text-muted-foreground">
              {tc(locale, 'rg.total')}
            </div>
            <div className="text-lg font-bold leading-tight tabular-nums text-emerald-600">
              {formatDOP(totals.grandTotal)}
            </div>
          </div>
          <Button type="button" className="h-11 gap-2 px-5 text-base" onClick={() => setCartOpen(true)}>
            <ShoppingCart className="h-4 w-4" />
            {tc(locale, 'rg.cart')}
            {cartCount > 0 ? (
              <span className="ml-1 rounded-full bg-background/30 px-2 text-sm tabular-nums">
                {cartCount}
              </span>
            ) : null}
          </Button>
        </div>
      </div>

      {/* ---- Mobile cart sheet ---- */}
      {cartOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t bg-background p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                {tc(locale, 'rg.cart')}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setCartOpen(false)}
                aria-label="X"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {renderCart()}
          </div>
        </div>
      ) : null}
    </div>
  )
}

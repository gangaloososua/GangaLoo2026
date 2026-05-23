'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Trash2 } from 'lucide-react'
import { formatDOP } from '@/lib/format'
import { ProductSearch } from '../../new/product-search'
import { editUnpaidSale } from './edit-actions'
import type { ProductSearchResult, SaleCategoryPickerItem } from '@/lib/sales'
import type { UnpaidSaleForEdit } from '@/lib/edit-unpaid-sale'
import type { DiscountRuleRow } from '@/lib/discount-rules'
import {
  resolveLineDiscount,
  type AppliedDiscount,
} from '@/lib/discount-rules-resolver'

type Props = {
  sale: UnpaidSaleForEdit
  activeDiscountRules: DiscountRuleRow[]
  categories: SaleCategoryPickerItem[]
}

// A cart line. Mirrors new-sale-form's CartLine (auto/manual discount state).
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
  is_manual_discount: boolean
  discount_breakdown: AppliedDiscount[]
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

export function EditProductsView({ sale, activeDiscountRules, categories }: Props) {
  const router = useRouter()

  // Pre-load the cart from the sale's current items. Existing discounts are
  // preserved EXACTLY as saved: a line that already had a discount starts as
  // a manual override (so a qty/price change won't silently re-price it); a
  // line with no discount starts on "auto", so it behaves just like a freshly
  // added product the moment its qty or price changes. Nothing is re-priced
  // on load.
  const [lines, setLines] = useState<CartLine[]>(() =>
    sale.lines.map((l) => ({
      line_id: makeId(),
      product_id: l.product_id,
      primary_category_id: l.primary_category_id,
      sku: l.sku,
      name: l.name,
      primary_image_url: l.primary_image_url,
      commission_percent: l.commission_percent,
      unit_price_cents: l.unit_price_cents,
      qty: l.qty,
      line_discount_cents: l.saved_discount_cents,
      qty_on_hand_at_add: l.qty_on_hand,
      is_manual_discount: l.saved_discount_cents > 0,
      discount_breakdown: [],
    })),
  )
  const [saleDiscountCents, setSaleDiscountCents] = useState<number>(
    sale.sale_discount_cents,
  )
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Customer + warehouse are FIXED for an edit (the RPC keeps the sale's
  // own seller/warehouse). We only carry the context the discount resolver
  // needs, mirroring new-sale-form.
  const resolverCustomerId = sale.customer_id
  const resolverClubTier = sale.customer_club_tier
  const customerHasClubTier =
    !!resolverClubTier && resolverClubTier !== 'none'

  // === cart ops (mirrors new-sale-form) ===

  function addProduct(p: ProductSearchResult) {
    const unit_price_cents = resolveDefaultPrice(p, customerHasClubTier)
    const result = resolveLineDiscount({
      productId: p.id,
      categoryId: p.primary_category_id,
      qty: 1,
      unitPriceCents: unit_price_cents,
      customerId: resolverCustomerId,
      customerClubTier: resolverClubTier,
      sourceWarehouseId: sale.source_warehouse_id,
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

  // updateLine recomputes the auto-discount on non-manual lines after
  // qty/unit-price changes. Typing into the discount input flips the line to
  // manual unless the user typed 0 (which restores auto).
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
            sourceWarehouseId: sale.source_warehouse_id,
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

  // === totals (mirrors new-sale-form) ===

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

  const anyOverStock = useMemo(
    () => lines.some((l) => l.qty > l.qty_on_hand_at_add),
    [lines],
  )

  const saveDisabledReason: string | null = useMemo(() => {
    if (lines.length === 0) return 'A sale must keep at least one product'
    return null
  }, [lines.length])

  const saveReady = saveDisabledReason === null

  async function handleSave() {
    if (!saveReady) return
    setSubmitting(true)
    try {
      const res = await editUnpaidSale({
        sale_id: sale.sale_id,
        discount_cents: saleDiscountCents,
        items: lines.map((l) => ({
          product_id: l.product_id,
          qty: l.qty,
          unit_price_cents: l.unit_price_cents,
          discount_cents: l.line_discount_cents,
        })),
      })
      if (res.ok) {
        toast.success('Sale updated.')
        router.push(`/sales/${sale.sale_id}`)
        router.refresh()
      } else {
        toast.error(res.error)
        setSubmitting(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Saving changes failed.'
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Products</CardTitle>
        </CardHeader>
        <CardContent className="min-h-[24rem] space-y-4">
          <ProductSearch
            warehouseId={sale.source_warehouse_id}
            categories={categories}
            onAdd={addProduct}
          />

          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No items. Search and pick a product above to add it. A sale must
              keep at least one product.
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
                                    In stock: {l.qty_on_hand_at_add}
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
                    <span className="text-muted-foreground">Sale discount</span>
                    <span className="tabular-nums">
                      −{formatDOP(saleDiscountCents)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 text-base font-semibold sm:justify-end sm:gap-6">
                  <span>New total</span>
                  <span className="tabular-nums">
                    {formatDOP(totals.grandTotal)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          type="button"
          disabled={submitting}
          onClick={() => router.push(`/sales/${sale.sale_id}`)}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!saveReady || submitting}
          title={saveDisabledReason ?? 'Save changes'}
          onClick={() => setConfirmOpen(true)}
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes to this sale?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  {lines.length} {lines.length === 1 ? 'item' : 'items'}, new
                  total {formatDOP(totals.grandTotal)}.
                </div>
                {anyOverStock && (
                  <div className="text-amber-700">
                    Warning: one or more lines exceed the stock on hand.
                    Saving anyway will push the oldest lot negative.
                  </div>
                )}
                <div className="text-muted-foreground">
                  This replaces the products on this sale: the old items go
                  back into stock and inventory, cost and commissions are
                  re-calculated for the new items. No money is involved (this
                  sale is unpaid). It cannot be undone, but you can edit again.
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
                void handleSave()
              }}
            >
              Save changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

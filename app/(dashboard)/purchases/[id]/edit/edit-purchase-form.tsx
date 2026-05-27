'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Trash2 } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

import type {
  SupplierPickerItem,
  ProductPickerCategoryGroup,
  ProductPickerItem,
} from '@/lib/purchases'
import type {
  PurchaseOrderRow,
  PurchaseOrderItemRow,
} from '@/lib/purchases-types'

import { ProductPicker } from '../../new/product-picker'

import { updatePendingPurchaseOrder } from '../../actions'

type LookupItem = { id: string; name: string }

type Props = {
  order: PurchaseOrderRow
  items: PurchaseOrderItemRow[]
  suppliers: SupplierPickerItem[]
  productGroups: ProductPickerCategoryGroup[]
  warehouses: LookupItem[]
}

type DraftLine = {
  // Client-side React key only. New on every render of the form. The DB
  // rebuilds purchase_order_items entirely (DELETE + INSERT) on save.
  id: string
  productId: string
  productName: string
  productSku: string
  qty: string
  usdUnitCost: string
}

function toLocalDatetimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    '-' + pad(d.getMonth() + 1) +
    '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) +
    ':' + pad(d.getMinutes())
  )
}

function formatUSD(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function EditPurchaseForm({
  order,
  items,
  suppliers,
  productGroups,
  warehouses,
}: Props) {
  const router = useRouter()

  // ---- Pre-fill from existing ----
  const initialOrderedAt = useMemo(
    () => toLocalDatetimeInputValue(new Date(order.ordered_at)),
    [order.ordered_at],
  )
  const initialExpectedAt = useMemo(
    () =>
      order.expected_at
        ? toLocalDatetimeInputValue(new Date(order.expected_at))
        : '',
    [order.expected_at],
  )

  // ---- Header state ----
  const [supplierName, setSupplierName] = useState<string>(order.supplier_name ?? '')
  const [warehouseId,  setWarehouseId]  = useState<string>(order.warehouse_id ?? '')
  const [orderedAt,    setOrderedAt]    = useState<string>(initialOrderedAt)
  const [expectedAt,   setExpectedAt]   = useState<string>(initialExpectedAt)
  const [notes,        setNotes]        = useState<string>(order.notes ?? '')

  // ---- Supplier combobox UI state ----
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false)
  const [supplierQuery,      setSupplierQuery]      = useState('')

  // ---- Lines state ----
  const [lines, setLines] = useState<DraftLine[]>(() =>
    items.map((it) => ({
      id: crypto.randomUUID(),
      productId: it.product_id,
      productName: it.product_name ?? '(unknown product)',
      productSku: it.product_sku ?? '',
      qty: String(it.qty),
      usdUnitCost: String(it.usd_unit_cost),
    })),
  )

  // ---- Submit state ----
  const [submitting, setSubmitting] = useState<boolean>(false)

  // ---- Adjustments state ----
  const [usdShipping, setUsdShipping] = useState<string>(String(order.usd_shipping))
  const [usdTax,      setUsdTax]      = useState<string>(String(order.usd_tax))
  const [usdDiscount, setUsdDiscount] = useState<string>(String(order.usd_discount))

  // ---- Supplier filtering ----
  const supplierMatches = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter((s) => s.name.toLowerCase().includes(q))
  }, [suppliers, supplierQuery])

  const supplierExactMatch = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase()
    if (!q) return null
    return suppliers.find((s) => s.name.toLowerCase() === q) ?? null
  }, [suppliers, supplierQuery])

  // ---- Line helpers ----
  function addLine(p: ProductPickerItem) {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productId: p.id,
        productName: p.name,
        productSku: p.sku,
        qty: '1',
        usdUnitCost: '',
      },
    ])
  }

  function removeLine(lineId: string) {
    setLines((prev) => prev.filter((l) => l.id !== lineId))
  }

  function updateLineQty(lineId: string, raw: string) {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, qty: raw } : l)),
    )
  }

  function updateLineCost(lineId: string, raw: string) {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, usdUnitCost: raw } : l)),
    )
  }

  // ---- Derived totals ----
  const usdSubtotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (Number(l.qty) || 0) * (Number(l.usdUnitCost) || 0),
        0,
      ),
    [lines],
  )

  const usdShippingN = Number(usdShipping) || 0
  const usdTaxN      = Number(usdTax)      || 0
  const usdDiscountN = Number(usdDiscount) || 0
  const usdTotal     = usdSubtotal + usdShippingN + usdTaxN - usdDiscountN

  // ---- Validation ----
  const headerValid =
    supplierName.trim().length > 0 &&
    warehouseId.length > 0 &&
    orderedAt.length > 0

  const linesValid =
    lines.length > 0 &&
    lines.every((l) => {
      const q = Number(l.qty)
      const c = Number(l.usdUnitCost)
      return Number.isFinite(q) && q > 0 && Number.isFinite(c) && c >= 0
    })

  const adjustmentsValid =
    usdShippingN >= 0 && usdTaxN >= 0 && usdDiscountN >= 0

  const formValid = headerValid && linesValid && adjustmentsValid

  // ---- Submit ----
  async function handleSubmit() {
    if (!formValid || submitting) return
    setSubmitting(true)

    const orderedAtIso  = new Date(orderedAt).toISOString()
    const expectedAtIso = expectedAt ? new Date(expectedAt).toISOString() : null

    const res = await updatePendingPurchaseOrder({
      orderId: order.id,
      supplierName: supplierName.trim(),
      warehouseId,
      orderedAt: orderedAtIso,
      expectedAt: expectedAtIso,
      notes: notes.trim() ? notes.trim() : null,
      lines: lines.map((l) => ({
        productId: l.productId,
        qty: Number(l.qty),
        usdUnitCost: Number(l.usdUnitCost),
      })),
      usdShipping: usdShippingN,
      usdTax: usdTaxN,
      usdDiscount: usdDiscountN,
    })

    if (!res.ok) {
      setSubmitting(false)
      toast.error(res.error)
      return
    }

    toast.success('Purchase order updated.')
    router.push('/purchases/' + order.id)
    router.refresh()
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* ============================================================
          LEFT/MIDDLE COLUMN
          ============================================================ */}
      <div className="space-y-4 lg:col-span-2">
        {/* ---- Header card ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Order header</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Supplier combobox */}
              <div className="space-y-1.5">
                <Label htmlFor="supplier-trigger">Supplier</Label>
                <Popover
                  open={supplierPickerOpen}
                  onOpenChange={setSupplierPickerOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      id="supplier-trigger"
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={supplierPickerOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className={supplierName ? '' : 'text-muted-foreground'}>
                        {supplierName || 'Pick or type a supplier...'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search or type a new supplier name..."
                        value={supplierQuery}
                        onValueChange={setSupplierQuery}
                      />
                      <CommandList>
                        {supplierMatches.length === 0 && !supplierQuery.trim() && (
                          <CommandEmpty>No suppliers yet.</CommandEmpty>
                        )}
                        {supplierMatches.length > 0 && (
                          <CommandGroup heading="Existing suppliers">
                            {supplierMatches.map((s) => (
                              <CommandItem
                                key={s.id}
                                value={s.id}
                                onSelect={() => {
                                  setSupplierName(s.name)
                                  setSupplierQuery('')
                                  setSupplierPickerOpen(false)
                                }}
                              >
                                <Check
                                  className={
                                    'mr-2 h-4 w-4 ' +
                                    (supplierName === s.name ? 'opacity-100' : 'opacity-0')
                                  }
                                />
                                {s.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {supplierQuery.trim() && !supplierExactMatch && (
                          <CommandGroup heading="New">
                            <CommandItem
                              value={'__create__' + supplierQuery}
                              onSelect={() => {
                                setSupplierName(supplierQuery.trim())
                                setSupplierQuery('')
                                setSupplierPickerOpen(false)
                              }}
                            >
                              Create new: <span className="ml-1 font-medium">{supplierQuery.trim()}</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  Pick an existing supplier or type a new name to create one.
                </p>
              </div>

              {/* Warehouse */}
              <div className="space-y-1.5">
                <Label htmlFor="warehouse">Warehouse</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger id="warehouse">
                    <SelectValue placeholder="Pick a warehouse..." />
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

              <div className="space-y-1.5">
                <Label htmlFor="ordered-at">Ordered at</Label>
                <Input
                  id="ordered-at"
                  type="datetime-local"
                  value={orderedAt}
                  onChange={(e) => setOrderedAt(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="expected-at">Expected at (optional)</Label>
                <Input
                  id="expected-at"
                  type="datetime-local"
                  value={expectedAt}
                  onChange={(e) => setExpectedAt(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything worth remembering about this order."
              />
            </div>
          </CardContent>
        </Card>

        {/* ---- Lines card ---- */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Line items</CardTitle>
            <ProductPicker productGroups={productGroups} onPick={addLine} />
          </CardHeader>
          <CardContent>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No lines yet. Click <span className="font-medium">Add line</span> to pick a product.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Product</th>
                      <th className="w-24 px-2 py-2 font-medium">Qty</th>
                      <th className="w-32 px-2 py-2 font-medium">USD unit cost</th>
                      <th className="w-32 px-2 py-2 text-right font-medium">Line total</th>
                      <th className="w-10 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const lineTotal = (Number(l.qty) || 0) * (Number(l.usdUnitCost) || 0)
                      return (
                        <tr key={l.id} className="border-b last:border-b-0 align-top">
                          <td className="py-2 pr-2">
                            <div className="font-medium">{l.productName}</div>
                            <div className="text-xs text-muted-foreground">{l.productSku}</div>
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={l.qty}
                              onChange={(e) => updateLineQty(l.id, e.target.value)}
                              className="h-8"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={l.usdUnitCost}
                              onChange={(e) => updateLineCost(l.id, e.target.value)}
                              className="h-8"
                            />
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatUSD(lineTotal)}
                          </td>
                          <td className="py-2 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLine(l.id)}
                              aria-label="Remove line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---- Adjustments card ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Adjustments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="usd-shipping">USD shipping</Label>
                <Input
                  id="usd-shipping"
                  type="number"
                  min="0"
                  step="0.01"
                  value={usdShipping}
                  onChange={(e) => setUsdShipping(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="usd-tax">USD tax</Label>
                <Input
                  id="usd-tax"
                  type="number"
                  min="0"
                  step="0.01"
                  value={usdTax}
                  onChange={(e) => setUsdTax(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="usd-discount">USD discount</Label>
                <Input
                  id="usd-discount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={usdDiscount}
                  onChange={(e) => setUsdDiscount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Shipping and tax add to the order total; discount subtracts. All values are in USD.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ============================================================
          RIGHT COLUMN
          ============================================================ */}
      <div className="space-y-4">
        <Card className="sticky top-4">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Lines</span>
                <span className="tabular-nums">{lines.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">USD subtotal</span>
                <span className="tabular-nums">{formatUSD(usdSubtotal)}</span>
              </div>
              {usdShippingN > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">+ Shipping</span>
                  <span className="tabular-nums">{formatUSD(usdShippingN)}</span>
                </div>
              )}
              {usdTaxN > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">+ Tax</span>
                  <span className="tabular-nums">{formatUSD(usdTaxN)}</span>
                </div>
              )}
              {usdDiscountN > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">- Discount</span>
                  <span className="tabular-nums">{formatUSD(usdDiscountN)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t pt-1 font-medium">
                <span>USD total</span>
                <span className="tabular-nums">{formatUSD(usdTotal)}</span>
              </div>
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={!formValid || submitting}
              onClick={() => { void handleSubmit() }}
            >
              {submitting ? 'Saving...' : 'Save changes'}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={submitting}
              onClick={() => router.push('/purchases/' + order.id)}
            >
              Cancel
            </Button>

            <p className="text-xs text-muted-foreground">
              {!headerValid
                ? 'Pick a supplier, warehouse, and date to continue.'
                : !linesValid
                ? 'Add at least one line with qty > 0 and unit cost set.'
                : !formValid
                ? 'Fix the highlighted fields.'
                : 'Click Save changes to update this purchase order.'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

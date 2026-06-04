'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Trash2 } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  CourierPickerItem,
  ProductPickerCategoryGroup,
  ProductPickerItem,
} from '@/lib/purchases'
import type { MoneyAccount } from '@/lib/sales'
import type { AccountCategoryOption } from '@/lib/transactions'

import { ProductPicker } from './product-picker'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { createPurchaseOrder } from '../actions'

type LookupItem = { id: string; name: string }

type Props = {
  suppliers: SupplierPickerItem[]
  couriers: CourierPickerItem[]
  productGroups: ProductPickerCategoryGroup[]
  warehouses: LookupItem[]
  moneyAccounts: MoneyAccount[]
  categories: AccountCategoryOption[]
}

type DraftLine = {
  id: string
  productId: string
  productName: string
  productSku: string
  // Stored as raw strings so partial entries like "1." or empty fields
  // work naturally. Parsed via Number() in derivations and at submit.
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

function formatDOP(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

// Group expense categories: parent-with-children -> heading + items; childless
// top-levels collected under "Other expense". Parents with children are
// headings only (not selectable). Mirrors the courier-payment form.
type CatBlock = { key: string; heading: string; items: AccountCategoryOption[] }
function buildExpenseBlocks(categories: AccountCategoryOption[]): CatBlock[] {
  const childrenOf = new Map<string, AccountCategoryOption[]>()
  for (const c of categories) {
    if (c.parentId) {
      const list = childrenOf.get(c.parentId) ?? []
      list.push(c)
      childrenOf.set(c.parentId, list)
    }
  }
  const tops = categories.filter((c) => c.parentId === null)
  const blocks: CatBlock[] = []
  const standalone: AccountCategoryOption[] = []
  for (const top of tops) {
    const kids = childrenOf.get(top.id)
    if (kids && kids.length > 0) blocks.push({ key: top.id, heading: top.name, items: kids })
    else standalone.push(top)
  }
  if (standalone.length > 0) blocks.push({ key: 'general', heading: 'Other expense', items: standalone })
  return blocks
}

export function NewPurchaseForm({
  suppliers,
  couriers,
  productGroups,
  warehouses,
  moneyAccounts,
  categories,
}: Props) {
  // ---- Header state ----
  const [supplierName, setSupplierName]   = useState<string>('')
  const [warehouseId,  setWarehouseId]    = useState<string>('')
  const [orderedAt,    setOrderedAt]      = useState<string>(
    toLocalDatetimeInputValue(new Date()),
  )
  const [expectedAt,   setExpectedAt]     = useState<string>('')
  const [notes,        setNotes]          = useState<string>('')

  // ---- Supplier combobox UI state ----
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false)
  const [supplierQuery,      setSupplierQuery]      = useState('')

  // ---- Lines state ----
  const [lines, setLines] = useState<DraftLine[]>([])

  // ---- Submit state ----
  const router = useRouter()
  const [submitting, setSubmitting] = useState<boolean>(false)

  // ---- Adjustments state (USD, string-typed) ----
  const [usdShipping, setUsdShipping] = useState<string>('')
  const [usdTax,      setUsdTax]      = useState<string>('')
  const [usdDiscount, setUsdDiscount] = useState<string>('')

  // ---- Optional inline supplier payment ----
  const [payInline,              setPayInline]              = useState<boolean>(false)
  const [dopPaidTotal,           setDopPaidTotal]           = useState<string>('')
  const [exchangeRate,           setExchangeRate]           = useState<string>('')
  const [officialRateAtPayment,  setOfficialRateAtPayment]  = useState<string>('')
  const [supplierPaymentAccount, setSupplierPaymentAccount] = useState<string>('')
  const [paymentCategoryId,      setPaymentCategoryId]      = useState<string>('')
  const [paidAtDop,              setPaidAtDop]              = useState<string>(
    toLocalDatetimeInputValue(new Date()),
  )

  // Grouped expense-category blocks for the payment picker.
  const catBlocks = useMemo(() => buildExpenseBlocks(categories), [categories])

  // ---- Optional inline transport ----
  const [payTransportInline,    setPayTransportInline]    = useState<boolean>(false)
  const [transportAmountDop,    setTransportAmountDop]    = useState<string>('')
  const [transportCourierId,    setTransportCourierId]    = useState<string>('')
  const [transportAccountId,    setTransportAccountId]    = useState<string>('')
  const [transportPaidAt,       setTransportPaidAt]       = useState<string>(
    toLocalDatetimeInputValue(new Date()),
  )
  const [transportDescription,  setTransportDescription]  = useState<string>('')
  const [transportReference,    setTransportReference]    = useState<string>('')

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
    // Default the USD unit cost to the supplier cost saved in the product
    // calculator (products.cost_calc.base_cost_usd). Blank if none saved.
    // The cashier can still type over it on any line.
    const defaultCost =
      p.baseCostUsd != null && Number.isFinite(p.baseCostUsd)
        ? String(p.baseCostUsd)
        : ''
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productId: p.id,
        productName: p.name,
        productSku: p.sku,
        qty: '1',
        usdUnitCost: defaultCost,
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

  const paymentValid =
    !payInline ||
    (
      Number(dopPaidTotal)          > 0 &&
      Number(exchangeRate)          > 0 &&
      Number(officialRateAtPayment) > 0 &&
      supplierPaymentAccount.length > 0 &&
      paymentCategoryId.length      > 0 &&
      paidAtDop.length              > 0
    )

  const transportValid =
    !payTransportInline ||
    (
      payInline && // transport requires payment per action
      Number(transportAmountDop) > 0 &&
      transportCourierId.length  > 0 &&
      transportAccountId.length  > 0 &&
      transportPaidAt.length     > 0
    )

  const formValid =
    headerValid && linesValid && adjustmentsValid && paymentValid && transportValid

  // ---- Submit ----
  async function handleSubmit() {
    if (!formValid || submitting) return
    setSubmitting(true)

    // Convert local datetime-local strings to ISO. The browser gives us
    // "YYYY-MM-DDTHH:mm" (no seconds, no timezone); new Date(...) parses
    // that as local time, and toISOString() gives us UTC.
    const orderedAtIso  = new Date(orderedAt).toISOString()
    const expectedAtIso = expectedAt ? new Date(expectedAt).toISOString() : null
    const paidAtDopIso  = payInline ? new Date(paidAtDop).toISOString() : null
    const transportPaidAtIso = payTransportInline
      ? new Date(transportPaidAt).toISOString()
      : null

    const res = await createPurchaseOrder({
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
      payment: payInline
        ? {
            dopPaidTotal: Number(dopPaidTotal),
            exchangeRate: Number(exchangeRate),
            officialRateAtPayment: Number(officialRateAtPayment),
            supplierPaymentAccountId: supplierPaymentAccount,
            paidAtDop: paidAtDopIso!,
            categoryId: paymentCategoryId,
          }
        : undefined,
      transport: payTransportInline
        ? {
            amountDop: Number(transportAmountDop),
            courierId: transportCourierId,
            accountId: transportAccountId,
            paidAt: transportPaidAtIso!,
            description: transportDescription.trim() || null,
            reference: transportReference.trim() || null,
          }
        : undefined,
    })

    if (!res.ok) {
      setSubmitting(false)
      toast.error(res.error)
      return
    }

    toast.success('Purchase order created.')
    router.push('/purchases/' + res.orderId)
    // Don't reset submitting; the navigation unmounts this form.
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

        {/* ---- Adjustments card (14b.3.c) ---- */}
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

        {/* ---- Optional inline supplier payment (14b.3.c) ---- */}
        <Card>
          <CardHeader>
            <CardTitle>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={payInline}
                  onChange={(e) => setPayInline(e.target.checked)}
                />
                Pay supplier now (optional)
              </label>
            </CardTitle>
          </CardHeader>
          {payInline && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="dop-paid-total">DOP paid total</Label>
                  <Input
                    id="dop-paid-total"
                    type="number"
                    min="0"
                    step="0.01"
                    value={dopPaidTotal}
                    onChange={(e) => setDopPaidTotal(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="supplier-payment-account">From account</Label>
                  <Select
                    value={supplierPaymentAccount}
                    onValueChange={setSupplierPaymentAccount}
                  >
                    <SelectTrigger id="supplier-payment-account">
                      <SelectValue placeholder="Pick an account..." />
                    </SelectTrigger>
                    <SelectContent>
                      {moneyAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payment-category">Expense category</Label>
                  <Select
                    value={paymentCategoryId}
                    onValueChange={setPaymentCategoryId}
                  >
                    <SelectTrigger id="payment-category">
                      <SelectValue placeholder="Pick a category..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {catBlocks.map((b) => (
                        <SelectGroup key={b.key}>
                          <SelectLabel>{b.heading}</SelectLabel>
                          {b.items.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="pl-6">
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Which expense bucket this purchase posts to in the ledger.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exchange-rate">Exchange rate (DOP per USD)</Label>
                  <Input
                    id="exchange-rate"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    placeholder="0.0000"
                  />
                  <p className="text-xs text-muted-foreground">
                    The negotiated rate you paid at.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="official-rate">Official rate (DOP per USD)</Label>
                  <Input
                    id="official-rate"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={officialRateAtPayment}
                    onChange={(e) => setOfficialRateAtPayment(e.target.value)}
                    placeholder="0.0000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Market reference rate at payment time. Used to book the bank fee.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="paid-at-dop">Paid at</Label>
                  <Input
                    id="paid-at-dop"
                    type="datetime-local"
                    value={paidAtDop}
                    onChange={(e) => setPaidAtDop(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* ---- Optional inline transport (14b.3.c) ---- */}
        <Card>
          <CardHeader>
            <CardTitle>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={payTransportInline}
                  onChange={(e) => setPayTransportInline(e.target.checked)}
                  disabled={!payInline}
                />
                Pay transport now (optional)
              </label>
            </CardTitle>
          </CardHeader>
          {payTransportInline && (
            <CardContent className="space-y-4">
              {!payInline && (
                <p className="text-sm text-amber-700">
                  Inline transport requires inline supplier payment. Toggle that on first.
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="transport-amount-dop">Transport amount (DOP)</Label>
                  <Input
                    id="transport-amount-dop"
                    type="number"
                    min="0"
                    step="0.01"
                    value={transportAmountDop}
                    onChange={(e) => setTransportAmountDop(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="transport-courier">Courier</Label>
                  <Select
                    value={transportCourierId}
                    onValueChange={setTransportCourierId}
                  >
                    <SelectTrigger id="transport-courier">
                      <SelectValue placeholder="Pick a courier..." />
                    </SelectTrigger>
                    <SelectContent>
                      {couriers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="transport-account">From account</Label>
                  <Select
                    value={transportAccountId}
                    onValueChange={setTransportAccountId}
                  >
                    <SelectTrigger id="transport-account">
                      <SelectValue placeholder="Pick an account..." />
                    </SelectTrigger>
                    <SelectContent>
                      {moneyAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="transport-paid-at">Paid at</Label>
                  <Input
                    id="transport-paid-at"
                    type="datetime-local"
                    value={transportPaidAt}
                    onChange={(e) => setTransportPaidAt(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="transport-description">Description (optional)</Label>
                  <Input
                    id="transport-description"
                    value={transportDescription}
                    onChange={(e) => setTransportDescription(e.target.value)}
                    placeholder="e.g. air freight, customs, etc."
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="transport-reference">Reference (optional)</Label>
                  <Input
                    id="transport-reference"
                    value={transportReference}
                    onChange={(e) => setTransportReference(e.target.value)}
                    placeholder="Tracking number, invoice ref, etc."
                  />
                </div>
              </div>
            </CardContent>
          )}
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
              {payInline && Number(dopPaidTotal) > 0 && (
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-muted-foreground">DOP paid (supplier)</span>
                  <span className="tabular-nums">{formatDOP(Number(dopPaidTotal))}</span>
                </div>
              )}
              {payTransportInline && Number(transportAmountDop) > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">DOP paid (transport)</span>
                  <span className="tabular-nums">{formatDOP(Number(transportAmountDop))}</span>
                </div>
              )}
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={!formValid || submitting}
              onClick={() => { void handleSubmit() }}
            >
              {submitting ? 'Creating...' : 'Create order'}
            </Button>

            <p className="text-xs text-muted-foreground">
              {!headerValid
                ? 'Pick a supplier, warehouse, and date to continue.'
                : !linesValid
                ? 'Add at least one line with qty > 0 and unit cost set.'
                : !paymentValid
                ? 'Fill in all supplier payment fields, including the expense category.'
                : !transportValid
                ? 'Fill in all transport fields (and turn on supplier payment first).'
                : !formValid
                ? 'Fix the highlighted fields.'
                : 'Click Create order to write this purchase to the database.'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

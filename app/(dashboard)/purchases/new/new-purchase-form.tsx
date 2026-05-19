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
  CourierPickerItem,
  ProductPickerCategoryGroup,
  ProductPickerItem,
} from '@/lib/purchases'
import type { MoneyAccount } from '@/lib/sales'

import { ProductPicker } from './product-picker'

type LookupItem = { id: string; name: string }

type Props = {
  suppliers: SupplierPickerItem[]
  couriers: CourierPickerItem[]
  productGroups: ProductPickerCategoryGroup[]
  warehouses: LookupItem[]
  moneyAccounts: MoneyAccount[]
}

// One line in the draft order. id is client-only (crypto.randomUUID) for
// React keys; the server doesn't see it.
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

// Format a Date as YYYY-MM-DDTHH:mm for <input type="datetime-local">.
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

// USD formatter for the summary panel. Lives in this file (not @/lib/format)
// because @/lib/format is DOP-centric; cost basis is USD.
function formatUSD(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function NewPurchaseForm({
  suppliers,
  couriers,
  productGroups,
  warehouses,
  moneyAccounts,
}: Props) {
  // ---- Header state ----
  const [supplierName, setSupplierName]   = useState<string>('')
  const [warehouseId,  setWarehouseId]    = useState<string>('')
  const [orderedAt,    setOrderedAt]      = useState<string>(
    toLocalDatetimeInputValue(new Date()),
  )
  const [expectedAt,   setExpectedAt]     = useState<string>('') // optional
  const [notes,        setNotes]          = useState<string>('')

  // ---- Supplier combobox UI state ----
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false)
  const [supplierQuery,      setSupplierQuery]      = useState('')

  // ---- Lines state ----
  const [lines, setLines] = useState<DraftLine[]>([])

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

  // ---- Derived ----
  const usdSubtotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (Number(l.qty) || 0) * (Number(l.usdUnitCost) || 0),
        0,
      ),
    [lines],
  )

  const linesValid =
    lines.length > 0 &&
    lines.every((l) => {
      const q = Number(l.qty)
      const c = Number(l.usdUnitCost)
      return Number.isFinite(q) && q > 0 && Number.isFinite(c) && c >= 0
    })

  const headerValid =
    supplierName.trim().length > 0 &&
    warehouseId.length > 0 &&
    orderedAt.length > 0

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

              {/* Order date */}
              <div className="space-y-1.5">
                <Label htmlFor="ordered-at">Ordered at</Label>
                <Input
                  id="ordered-at"
                  type="datetime-local"
                  value={orderedAt}
                  onChange={(e) => setOrderedAt(e.target.value)}
                />
              </div>

              {/* Expected date (optional) */}
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

        {/* ---- Lines card (14b.3.b) ---- */}
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

        {/* ---- Adjustments + options placeholder (14b.3.c) ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Adjustments &amp; payments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Coming in 14b.3.c - shipping, tax, discount, optional inline supplier payment, optional inline transport.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ============================================================
          RIGHT COLUMN - summary + submit
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
                <span className="tabular-nums font-medium">{formatUSD(usdSubtotal)}</span>
              </div>
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={true}
              title="Disabled in 14b.3.b - submit wiring lands in 14b.3.c"
            >
              Create order
            </Button>

            <p className="text-xs text-muted-foreground">
              {!headerValid
                ? 'Pick a supplier, warehouse, and date to continue.'
                : !linesValid
                ? 'Add at least one line with qty > 0.'
                : 'Adjustments & submit wiring lands in 14b.3.c.'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Keep-alive for props not yet consumed (14b.3.c will use them).
          eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      <span hidden>{couriers.length}|{moneyAccounts.length}</span>
    </div>
  )
}
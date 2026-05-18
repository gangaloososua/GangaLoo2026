'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

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
} from '@/lib/purchases'
import type { MoneyAccount } from '@/lib/sales'

type LookupItem = { id: string; name: string }

type Props = {
  suppliers: SupplierPickerItem[]
  couriers: CourierPickerItem[]
  productGroups: ProductPickerCategoryGroup[]
  warehouses: LookupItem[]
  moneyAccounts: MoneyAccount[]
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

  const supplierMatches = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter((s) => s.name.toLowerCase().includes(q))
  }, [suppliers, supplierQuery])

  // Is the typed value already in the list (case-insensitive)?
  const supplierExactMatch = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase()
    if (!q) return null
    return suppliers.find((s) => s.name.toLowerCase() === q) ?? null
  }, [suppliers, supplierQuery])

  const headerValid =
    supplierName.trim().length > 0 &&
    warehouseId.length > 0 &&
    orderedAt.length > 0

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* ============================================================
          LEFT/MIDDLE COLUMN — header + lines + adjustments + options
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

        {/* ---- Lines placeholder (14b.3.b) ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Coming in 14b.3.b — product picker, qty, unit cost.
            </p>
          </CardContent>
        </Card>

        {/* ---- Adjustments + options placeholder (14b.3.c) ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Adjustments &amp; payments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Coming in 14b.3.c — shipping, tax, discount, optional inline supplier payment, optional inline transport.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ============================================================
          RIGHT COLUMN — summary + submit
          ============================================================ */}
      <div className="space-y-4">
        <Card className="sticky top-4">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Live totals land here once line items and adjustments are in.
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={true}
              title="Disabled in 14b.3.a — lines and submit wiring land in 14b.3.b and 14b.3.c"
            >
              Create order
            </Button>

            <p className="text-xs text-muted-foreground">
              {headerValid
                ? 'Header looks good. Add lines next.'
                : 'Pick a supplier, warehouse, and date to continue.'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Reference unused props so TS doesn't complain in 14b.3.a.
          Removed when 14b.3.b/.c consume these.
          eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      <span hidden>{couriers.length}|{productGroups.length}|{moneyAccounts.length}</span>
    </div>
  )
}
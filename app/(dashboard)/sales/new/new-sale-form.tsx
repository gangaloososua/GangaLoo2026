'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type {
  CustomerPickerItem,
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
  // Operator can break the link by changing fulfillment directly.
  const [fulfillmentLinked, setFulfillmentLinked] = useState(true)

  function onSourceWarehouseChange(id: string) {
    setSourceWarehouseId(id)
    if (fulfillmentLinked) setFulfillmentWarehouseId(id)
  }

  function onFulfillmentWarehouseChange(id: string) {
    setFulfillmentWarehouseId(id)
    setFulfillmentLinked(id === sourceWarehouseId)
  }

  // Look up the chosen customer to display the club tier badge.
  const chosenCustomer =
    customerId === WALKIN ? null : customers.find((c) => c.id === customerId) ?? null

  // The form is incomplete until source warehouse + seller are picked.
  const metaReady = !!sourceWarehouseId && !!fulfillmentWarehouseId && !!sellerId

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
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {metaReady
              ? 'Cart UI lands in 9.7. Add products, set qty, take payment.'
              : 'Set seller and warehouses above to enable the cart.'}
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" type="button" disabled>
          Save draft
        </Button>
        <Button
          type="button"
          disabled
          title="Cart + confirm wire up in 9.7/9.8"
        >
          Confirm sale
        </Button>
      </div>
    </div>
  )
}

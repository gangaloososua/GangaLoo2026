'use client'

// Round 85 — EDIT bundle rule form
//
// A copy of new/new-bundle-form.tsx, pre-filled from an existing bundle and
// saving through updateBundleRule. Kept separate on purpose (same as the
// promotion edit form) so a bug here can't break creating bundles.
//
// A bundle = a SET TOTAL PRICE for specific products bought together
// (e.g. 1 wig + 1 shampoo = RD$6,000). Owner decisions:
//   - the bundle price is final (no other discounts on bundled units),
//   - it repeats for every complete set in the cart,
//   - it is NOT limited by the usual 30% cap.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ProductPicker,
  type PickerProduct,
  type PickerCategory,
} from '../new/product-picker'
import { updateBundleRule } from '../actions'

export type EditBundleInitial = {
  ruleId: string
  name: string
  items: Array<{ productId: string; qty: number }>
  priceCents: number
  warehouseId: string | null
  startsAt: string | null
  endsAt: string | null
}

type Props = {
  initial: EditBundleInitial
  products: PickerProduct[]
  categories: PickerCategory[]
  warehouses: { id: string; name: string }[]
  priceById: Record<string, number> // regular (base) price in cents
}

type ItemRow = { key: string; productId: string; qtyStr: string }

function toIsoOrNull(dateStr: string, endOfDay: boolean): string | null {
  if (!dateStr.trim()) return null
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  return `${dateStr}${suffix}`
}

function isoToDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function formatDOP(cents: number): string {
  return (
    'RD$' +
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100)
  )
}

const selectClass =
  'h-9 w-full rounded-md border bg-background px-3 text-sm shadow-sm'

let keySeq = 0
function newRow(productId = '', qty = 1): ItemRow {
  keySeq += 1
  return { key: `row-${keySeq}`, productId, qtyStr: String(qty) }
}

export function EditBundleRuleForm({
  initial,
  products,
  categories,
  warehouses,
  priceById,
}: Props) {
  const router = useRouter()

  const [name, setName] = useState(initial.name)
  const [rows, setRows] = useState<ItemRow[]>(() => {
    const r = initial.items.map((i) => newRow(i.productId, i.qty))
    while (r.length < 2) r.push(newRow())
    return r
  })
  const [priceStr, setPriceStr] = useState(String(initial.priceCents / 100))
  const [warehouseId, setWarehouseId] = useState(initial.warehouseId ?? '') // '' = all stores
  const [startsAtStr, setStartsAtStr] = useState(isoToDateInput(initial.startsAt))
  const [endsAtStr, setEndsAtStr] = useState(isoToDateInput(initial.endsAt))
  const [submitting, setSubmitting] = useState(false)

  const priceCents = Math.round(Number(priceStr) * 100)

  const filled = rows.filter((r) => r.productId)
  const regularTotal = filled.reduce((sum, r) => {
    const q = parseInt(r.qtyStr, 10)
    return sum + (priceById[r.productId] ?? 0) * (Number.isFinite(q) ? q : 0)
  }, 0)

  const validationError: string | null = (() => {
    if (!name.trim()) return 'Rule name is required'
    if (filled.length < 2) return 'Pick at least 2 different products'
    if (new Set(filled.map((r) => r.productId)).size !== filled.length)
      return 'Each product can only be in the bundle once'
    for (const r of filled) {
      const q = Number(r.qtyStr)
      if (!Number.isInteger(q) || q < 1)
        return 'Each quantity must be a whole number of 1 or more'
    }
    if (!Number.isFinite(priceCents) || priceCents <= 0)
      return 'Enter the bundle price'
    if (startsAtStr && endsAtStr && new Date(startsAtStr) > new Date(endsAtStr))
      return 'Start date must be on or before end date'
    return null
  })()

  const canSubmit = !validationError && !submitting

  function updateRow(key: string, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 2 ? prev : prev.filter((r) => r.key !== key)))
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const result = await updateBundleRule({
        ruleId: initial.ruleId,
        name: name.trim(),
        items: filled.map((r) => ({
          productId: r.productId,
          qty: parseInt(r.qtyStr, 10),
        })),
        priceCents,
        scopeWarehouseId: warehouseId || null,
        startsAt: toIsoOrNull(startsAtStr, false),
        endsAt: toIsoOrNull(endsAtStr, true),
      })
      if (result.ok) {
        toast.success(`Bundle "${name.trim()}" saved.`)
        router.push('/discount-rules')
      } else {
        toast.error(result.error)
        setSubmitting(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save bundle failed.'
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Edit bundle (set price)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="br-name" className="text-xs">
              Bundle name <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="br-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wig + shampoo combo"
            />
          </div>

          <div className="space-y-3 sm:col-span-2">
            <Label className="text-xs">
              Products in the bundle <span className="text-rose-600">*</span>
            </Label>
            {rows.map((r, idx) => (
              <div key={r.key} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Product {idx + 1}
                  </span>
                  {rows.length > 2 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(r.key)}
                      title="Remove this product"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                <ProductPicker
                  products={products}
                  categories={categories}
                  value={r.productId}
                  onChange={(id) => updateRow(r.key, { productId: id })}
                />
                <div className="mt-2 flex items-center gap-2">
                  <Label htmlFor={`br-qty-${r.key}`} className="text-xs">
                    How many
                  </Label>
                  <Input
                    id={`br-qty-${r.key}`}
                    type="number"
                    min={1}
                    step={1}
                    className="w-24"
                    value={r.qtyStr}
                    onChange={(e) => updateRow(r.key, { qtyStr: e.target.value })}
                  />
                  {r.productId ? (
                    <span className="text-xs text-muted-foreground">
                      Regular {formatDOP(priceById[r.productId] ?? 0)} each
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((prev) => [...prev, newRow()])}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add another product
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="br-price" className="text-xs">
              Bundle price (RD$) <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="br-price"
              type="number"
              min={0.01}
              step={0.01}
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              placeholder="e.g. 6000"
            />
            <p className="text-xs text-muted-foreground">
              What the customer pays in total for one complete bundle. This
              price is final: no other discounts apply to these items, and
              the 30% limit does not apply.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Price check</Label>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div>Regular total: {formatDOP(regularTotal)}</div>
              <div>
                Bundle price:{' '}
                {priceCents > 0 ? formatDOP(priceCents) : '—'}
              </div>
              {priceCents > 0 && regularTotal > 0 ? (
                priceCents < regularTotal ? (
                  <div className="font-medium text-emerald-700">
                    Customer saves {formatDOP(regularTotal - priceCents)} (
                    {Math.round(((regularTotal - priceCents) / regularTotal) * 100)}
                    %)
                  </div>
                ) : (
                  <div className="font-medium text-rose-700">
                    Bundle price is not lower than the regular total.
                  </div>
                )
              ) : null}
            </div>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="br-store" className="text-xs">
              Store
            </Label>
            <select
              id="br-store"
              className={selectClass}
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">All stores</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="br-starts" className="text-xs">
              Active from (optional)
            </Label>
            <Input
              id="br-starts"
              type="date"
              value={startsAtStr}
              onChange={(e) => setStartsAtStr(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="br-ends" className="text-xs">
              Active to (optional)
            </Label>
            <Input
              id="br-ends"
              type="date"
              value={endsAtStr}
              onChange={(e) => setEndsAtStr(e.target.value)}
            />
          </div>
        </div>

        {validationError ? (
          <p className="mt-4 text-sm text-rose-700">{validationError}</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/discount-rules')}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={validationError ?? 'Save changes'}
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

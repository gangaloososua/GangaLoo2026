'use client'

// app/(dashboard)/us-products/us-product-form.tsx
//
// Add / edit form for a US dropship product. Phase 1.
// Used by both the New page (no initial) and the Edit page (with initial).
//
// USD money entered as plain dollars (text inputs, parsed on save). Live
// price preview mirrors computeUsPriceUsd in lib/us-products.ts: override if
// set, else (cost + shipping) * (1 + markup/100).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createUsProduct, updateUsProduct } from './actions'

export type UsProductInitial = {
  id: string
  name: string
  sku: string | null
  description: string | null
  supplierCostUsd: number
  supplierShippingUsd: number
  markupPercent: number
  priceOverrideUsd: number | null
  supplierUrl: string | null
  primaryImageUrl: string | null
  category: string | null
  isActive: boolean
  visibleInStore: boolean
}

type Props = {
  initial?: UsProductInitial // present => edit mode
}

function parseNum(s: string): number {
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n)
}

export function UsProductForm({ initial }: Props) {
  const router = useRouter()
  const isEdit = !!initial

  const [name, setName] = useState(initial?.name ?? '')
  const [sku, setSku] = useState(initial?.sku ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [costStr, setCostStr] = useState(
    initial ? String(initial.supplierCostUsd) : '',
  )
  const [shipStr, setShipStr] = useState(
    initial ? String(initial.supplierShippingUsd) : '',
  )
  const [markupStr, setMarkupStr] = useState(
    initial ? String(initial.markupPercent) : '5',
  )
  const [overrideStr, setOverrideStr] = useState(
    initial?.priceOverrideUsd != null ? String(initial.priceOverrideUsd) : '',
  )
  const [supplierUrl, setSupplierUrl] = useState(initial?.supplierUrl ?? '')
  const [imageUrl, setImageUrl] = useState(initial?.primaryImageUrl ?? '')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [visibleInStore, setVisibleInStore] = useState(
    initial?.visibleInStore ?? true,
  )
  const [submitting, setSubmitting] = useState(false)

  // Live preview of the price the customer would see.
  const cost = parseNum(costStr || '0')
  const ship = parseNum(shipStr || '0')
  const markup = parseNum(markupStr || '0')
  const override = overrideStr.trim() ? parseNum(overrideStr) : null

  const previewPrice: number | null = (() => {
    if (override != null && Number.isFinite(override) && override > 0) {
      return Math.round(override * 100) / 100
    }
    if (!Number.isFinite(cost) || !Number.isFinite(ship) || !Number.isFinite(markup))
      return null
    const base = (cost || 0) + (ship || 0)
    return Math.round(base * (1 + (markup || 0) / 100) * 100) / 100
  })()

  const validationError: string | null = (() => {
    if (!name.trim()) return 'A product name is required.'
    if (!Number.isFinite(cost) || cost < 0)
      return 'Supplier cost must be zero or more.'
    if (!Number.isFinite(ship) || ship < 0)
      return 'Supplier shipping must be zero or more.'
    if (!Number.isFinite(markup) || markup < 0)
      return 'Markup % must be zero or more.'
    if (overrideStr.trim() && (!Number.isFinite(override as number) || (override as number) <= 0))
      return 'Price override must be greater than zero, or leave it blank.'
    return null
  })()

  const canSubmit = !validationError && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        sku: sku.trim() || null,
        description: description.trim() || null,
        supplierCostUsd: cost || 0,
        supplierShippingUsd: ship || 0,
        markupPercent: markup || 0,
        priceOverrideUsd: override,
        supplierUrl: supplierUrl.trim() || null,
        primaryImageUrl: imageUrl.trim() || null,
        category: category.trim() || null,
        isActive,
        visibleInStore,
      }

      const result = isEdit
        ? await updateUsProduct(initial!.id, payload)
        : await createUsProduct(payload)

      if (result.ok) {
        toast.success(isEdit ? 'Product updated.' : 'Product created.')
        router.push('/us-products')
        router.refresh()
      } else {
        toast.error(result.error)
        setSubmitting(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed.'
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {isEdit ? 'Edit US product' : 'New US product'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="us-name" className="text-xs">
              Name <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="us-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wireless Earbuds Pro"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="us-sku" className="text-xs">
              SKU / your code (optional)
            </Label>
            <Input
              id="us-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="us-category" className="text-xs">
              Category (optional)
            </Label>
            <Input
              id="us-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Electronics"
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="us-desc" className="text-xs">
              Description (optional)
            </Label>
            <textarea
              id="us-desc"
              className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="us-cost" className="text-xs">
              Supplier cost (US$) <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="us-cost"
              type="text"
              inputMode="decimal"
              value={costStr}
              onChange={(e) => setCostStr(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="us-ship" className="text-xs">
              Supplier shipping (US$)
            </Label>
            <Input
              id="us-ship"
              type="text"
              inputMode="decimal"
              value={shipStr}
              onChange={(e) => setShipStr(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="us-markup" className="text-xs">
              Markup %
            </Label>
            <Input
              id="us-markup"
              type="text"
              inputMode="decimal"
              value={markupStr}
              onChange={(e) => setMarkupStr(e.target.value)}
              placeholder="5"
            />
            <p className="text-xs text-muted-foreground">
              Added on top of cost + shipping.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="us-override" className="text-xs">
              Price override (US$, optional)
            </Label>
            <Input
              id="us-override"
              type="text"
              inputMode="decimal"
              value={overrideStr}
              onChange={(e) => setOverrideStr(e.target.value)}
              placeholder="leave blank to use markup"
            />
            <p className="text-xs text-muted-foreground">
              If set, this is the exact price. Markup is ignored.
            </p>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="us-supplier" className="text-xs">
              Supplier link (where you order it)
            </Label>
            <Input
              id="us-supplier"
              type="url"
              value={supplierUrl}
              onChange={(e) => setSupplierUrl(e.target.value)}
              placeholder="https://www.amazon.com/..."
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="us-image" className="text-xs">
              Image URL
            </Label>
            <Input
              id="us-image"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>

        {/* Price preview */}
        <div className="mt-6 rounded-md border bg-muted/30 p-4">
          <div className="text-xs text-muted-foreground">
            Customer pays (preview)
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {previewPrice != null ? fmtUsd(previewPrice) : '—'}
          </div>
          {override != null && override > 0 ? (
            <div className="text-xs text-muted-foreground">
              Using your price override.
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {fmtUsd((cost || 0) + (ship || 0))} cost+shipping + {markup || 0}%
              markup.
            </div>
          )}
        </div>

        {/* Visibility toggles */}
        <div className="mt-6 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active (uncheck to retire the product)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={visibleInStore}
              onChange={(e) => setVisibleInStore(e.target.checked)}
            />
            Show in the US store
          </label>
        </div>

        {validationError ? (
          <p className="mt-4 text-sm text-rose-700">{validationError}</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/us-products')}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={validationError ?? 'Save'}
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

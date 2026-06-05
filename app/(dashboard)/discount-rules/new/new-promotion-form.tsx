'use client'

// Round 20 — New promotion rule form
// Round 20.1 — product picker swapped for the searchable ProductPicker.
// Deals stage 3b — optional "Online deal" section: mark a promotion as an
//   online Daily/Weekly deal for a chosen store with an exact end time. When
//   the toggle is off, the form behaves exactly as before (in-person promotion
//   with date-based window).
// Round 61 — the STORE picker moved OUT of the online-deal box so it governs
//   EVERY promotion: the chosen store now limits where the promotion applies
//   at the register too (blank = all stores), and (when the online box is
//   ticked) also which store features the deal. Mirrors the bulk rule's
//   per-store scope. Sends scopeWarehouseId on every promotion now.
//
// A promotion is a time-bound % off a single product, for EVERYONE
// (incl. walk-ins), with NO minimum quantity.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ProductPicker,
  type PickerProduct,
  type PickerCategory,
} from './product-picker'
import { createPromotionRule } from '../actions'

type Props = {
  products: PickerProduct[]
  categories: PickerCategory[]
  warehouses: { id: string; name: string }[]
}

function toIsoOrNull(dateStr: string, endOfDay: boolean): string | null {
  if (!dateStr.trim()) return null
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  return `${dateStr}${suffix}`
}

const selectClass =
  'h-9 w-full rounded-md border bg-background px-3 text-sm shadow-sm'

export function NewPromotionRuleForm({ products, categories, warehouses }: Props) {
  const router = useRouter()

  const [name, setName] = useState('')
  const [productId, setProductId] = useState('')
  const [percentStr, setPercentStr] = useState('10')
  const [startsAtStr, setStartsAtStr] = useState('')
  const [endsAtStr, setEndsAtStr] = useState('')
  const [priorityStr, setPriorityStr] = useState('0')
  const [submitting, setSubmitting] = useState(false)

  // Round 61: store now applies to ALL promotions (not just online deals).
  const [warehouseId, setWarehouseId] = useState('') // '' = all stores

  // Online deal section
  const [onlineDeal, setOnlineDeal] = useState(false)
  const [dealSlot, setDealSlot] = useState<'daily' | 'weekly'>('daily')
  const [endsAtLocal, setEndsAtLocal] = useState('') // datetime-local

  const percentValue = Number(percentStr)
  const priorityValue = parseInt(priorityStr, 10)

  const validationError: string | null = (() => {
    if (!name.trim()) return 'Rule name is required'
    if (!productId) return 'Pick a product'
    if (!Number.isFinite(percentValue) || percentValue <= 0 || percentValue >= 100)
      return 'Discount percent must be > 0 and < 100'
    if (
      !Number.isFinite(priorityValue) ||
      priorityValue < 0 ||
      !Number.isInteger(priorityValue)
    )
      return 'Priority must be a non-negative integer'
    if (onlineDeal) {
      if (!endsAtLocal) return 'Pick when the online deal ends'
      if (new Date(endsAtLocal).getTime() <= Date.now())
        return 'The end time must be in the future'
    } else if (
      startsAtStr &&
      endsAtStr &&
      new Date(startsAtStr) > new Date(endsAtStr)
    ) {
      return 'Start date must be on or before end date'
    }
    return null
  })()

  const canSubmit = !validationError && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const startsAt = onlineDeal
        ? new Date().toISOString()
        : toIsoOrNull(startsAtStr, false)
      const endsAt = onlineDeal
        ? new Date(endsAtLocal).toISOString()
        : toIsoOrNull(endsAtStr, true)

      const result = await createPromotionRule({
        name: name.trim(),
        scopeProductId: productId,
        deltaPercent: percentValue,
        startsAt,
        endsAt,
        priority: priorityValue,
        // Round 61: store applies to every promotion now (blank = all stores).
        scopeWarehouseId: warehouseId || null,
        dealSlot: onlineDeal ? dealSlot : null,
      })
      if (result.ok) {
        toast.success(`Rule "${name.trim()}" created.`)
        router.push('/discount-rules')
      } else {
        toast.error(result.error)
        setSubmitting(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create rule failed.'
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Promotion (daily / weekly deal)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="dr-name" className="text-xs">
              Rule name <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="dr-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tuesday deal: 15% off lace wig"
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">
              Product <span className="text-rose-600">*</span>
            </Label>
            <ProductPicker
              products={products}
              categories={categories}
              value={productId}
              onChange={setProductId}
            />
            <p className="text-xs text-muted-foreground">
              The deal price applies to everyone, including walk-ins, with no
              minimum quantity.
            </p>
          </div>

          {/* Round 61: store scope for EVERY promotion (register + online). */}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="dr-store" className="text-xs">
              Store
            </Label>
            <select
              id="dr-store"
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
            <p className="text-xs text-muted-foreground">
              Leave on &ldquo;All stores&rdquo; to apply everywhere, or pick one
              store so the promotion only applies to that store&rsquo;s sales
              (and, if featured online below, that store&rsquo;s website).
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="dr-percent" className="text-xs">
              Discount % <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="dr-percent"
              type="number"
              min={0.01}
              max={99.99}
              step={0.01}
              value={percentStr}
              onChange={(e) => setPercentStr(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Capped at 30% effective total when combined with other rules.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="dr-priority" className="text-xs">
              Priority
            </Label>
            <Input
              id="dr-priority"
              type="number"
              min={0}
              step={1}
              value={priorityStr}
              onChange={(e) => setPriorityStr(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Higher priority applies first within the same rule kind.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-md border p-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={onlineDeal}
              onChange={(e) => setOnlineDeal(e.target.checked)}
            />
            Feature this on the online store (Deal of the Day / Week)
          </label>

          {onlineDeal ? (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="dr-slot" className="text-xs">
                  Deal type <span className="text-rose-600">*</span>
                </Label>
                <select
                  id="dr-slot"
                  className={selectClass}
                  value={dealSlot}
                  onChange={(e) =>
                    setDealSlot(e.target.value as 'daily' | 'weekly')
                  }
                >
                  <option value="daily">Deal of the Day</option>
                  <option value="weekly">Deal of the Week</option>
                </select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="dr-ends-at" className="text-xs">
                  Ends at <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="dr-ends-at"
                  type="datetime-local"
                  value={endsAtLocal}
                  onChange={(e) => setEndsAtLocal(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The store shows a live countdown to this time, then the deal
                  disappears and the price returns to normal. Starts immediately.
                  Uses the Store chosen above (or all stores).
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="dr-starts" className="text-xs">
                  Active from (optional)
                </Label>
                <Input
                  id="dr-starts"
                  type="date"
                  value={startsAtStr}
                  onChange={(e) => setStartsAtStr(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="dr-ends" className="text-xs">
                  Active to (optional)
                </Label>
                <Input
                  id="dr-ends"
                  type="date"
                  value={endsAtStr}
                  onChange={(e) => setEndsAtStr(e.target.value)}
                />
              </div>
            </div>
          )}
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
            title={validationError ?? 'Create rule'}
          >
            {submitting ? 'Creating…' : 'Create rule'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

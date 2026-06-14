'use client'

// Discount rules > Edit promotion form
//
// Mirror of new-promotion-form.tsx, but pre-filled from an existing
// promotion rule and calling updatePromotionRule instead of create.
// Lets the owner REUSE a daily/weekly deal (swap product, %, store, slot,
// dates) instead of creating a fresh rule each time.
//
// The "new" form is left untouched on purpose; this is its own component so
// a bug here can never break rule CREATION.

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
} from '../new/product-picker'
import { updatePromotionRule } from '../actions'

export type EditPromotionInitial = {
  ruleId: string
  name: string
  productId: string
  percent: number
  warehouseId: string | null
  dealSlot: 'daily' | 'weekly' | null
  startsAt: string | null // ISO datetime
  endsAt: string | null // ISO datetime
  priority: number
}

type Props = {
  products: PickerProduct[]
  categories: PickerCategory[]
  warehouses: { id: string; name: string }[]
  initial: EditPromotionInitial
}

function toIsoOrNull(dateStr: string, endOfDay: boolean): string | null {
  if (!dateStr.trim()) return null
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  return `${dateStr}${suffix}`
}

// ISO datetime -> 'YYYY-MM-DD' for a <input type="date">.
function isoToDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

// ISO datetime -> 'YYYY-MM-DDTHH:mm' in LOCAL time for <input datetime-local>.
function isoToLocalDateTimeInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

const selectClass =
  'h-9 w-full rounded-md border bg-background px-3 text-sm shadow-sm'

export function EditPromotionRuleForm({
  products,
  categories,
  warehouses,
  initial,
}: Props) {
  const router = useRouter()

  const [name, setName] = useState(initial.name)
  const [productId, setProductId] = useState(initial.productId)
  const [percentStr, setPercentStr] = useState(String(initial.percent))
  const [priorityStr, setPriorityStr] = useState(String(initial.priority))
  const [submitting, setSubmitting] = useState(false)

  const [warehouseId, setWarehouseId] = useState(initial.warehouseId ?? '')

  // Online deal section, pre-filled from the rule's slot.
  const [onlineDeal, setOnlineDeal] = useState(initial.dealSlot != null)
  const [dealSlot, setDealSlot] = useState<'daily' | 'weekly'>(
    initial.dealSlot ?? 'daily',
  )
  const [endsAtLocal, setEndsAtLocal] = useState(
    initial.dealSlot != null ? isoToLocalDateTimeInput(initial.endsAt) : '',
  )

  // Plain (non-online) date window, pre-filled.
  const [startsAtStr, setStartsAtStr] = useState(
    initial.dealSlot == null ? isoToDateInput(initial.startsAt) : '',
  )
  const [endsAtStr, setEndsAtStr] = useState(
    initial.dealSlot == null ? isoToDateInput(initial.endsAt) : '',
  )

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

      const result = await updatePromotionRule({
        ruleId: initial.ruleId,
        name: name.trim(),
        scopeProductId: productId,
        deltaPercent: percentValue,
        startsAt,
        endsAt,
        priority: priorityValue,
        scopeWarehouseId: warehouseId || null,
        dealSlot: onlineDeal ? dealSlot : null,
      })
      if (result.ok) {
        toast.success(`Rule "${name.trim()}" updated.`)
        router.push('/discount-rules')
        router.refresh()
      } else {
        toast.error(result.error)
        setSubmitting(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update rule failed.'
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Edit promotion (daily / weekly deal)
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
            title={validationError ?? 'Save changes'}
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

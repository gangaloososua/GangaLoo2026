'use client'

// Round 80b - New seasonal campaign form.
//
// Pick a campaign (e.g. Halloween), ONE discount %, a store (or all), the
// start/end date+time, and add several products. Saving creates one normal
// promotion rule per product, tagged with the campaign, so the register and
// online checkout charge them and the storefront shows them in the themed box.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ProductPicker,
  type PickerProduct,
  type PickerCategory,
} from './product-picker'
import { createCampaignPromotions } from '../campaign-actions'
import { CAMPAIGNS } from '@/lib/campaigns'

type Props = {
  products: PickerProduct[]
  categories: PickerCategory[]
  warehouses: { id: string; name: string }[]
}

const selectClass =
  'h-9 w-full rounded-md border bg-background px-3 text-sm shadow-sm'

// "YYYY-MM-DDTHH:mm" in the browser's local time, for datetime-local inputs.
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function defaultEnd(): string {
  // Halloween night: Oct 31 of the current year, 23:59 local time.
  const now = new Date()
  return localInputValue(new Date(now.getFullYear(), 9, 31, 23, 59))
}

export function NewCampaignForm({ products, categories, warehouses }: Props) {
  const router = useRouter()

  const [campaign, setCampaign] = useState<string>(CAMPAIGNS[0]?.id ?? '')
  const [percentStr, setPercentStr] = useState('15')
  const [warehouseId, setWarehouseId] = useState('') // '' = all stores
  const [startsLocal, setStartsLocal] = useState(() => localInputValue(new Date()))
  const [endsLocal, setEndsLocal] = useState(() => defaultEnd())
  const [priorityStr, setPriorityStr] = useState('10')
  const [selected, setSelected] = useState<string[]>([])
  const [pickerValue, setPickerValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const productById = useMemo(() => {
    const m = new Map<string, PickerProduct>()
    for (const p of products) m.set(p.id, p)
    return m
  }, [products])

  function addProduct(id: string) {
    setPickerValue('')
    if (!id) return
    setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  function removeProduct(id: string) {
    setSelected((prev) => prev.filter((x) => x !== id))
  }

  const percentValue = Number(percentStr)
  const priorityValue = parseInt(priorityStr, 10)

  const validationError: string | null = (() => {
    if (!campaign) return 'Pick a campaign'
    if (selected.length === 0) return 'Add at least one product'
    if (!Number.isFinite(percentValue) || percentValue <= 0 || percentValue >= 100)
      return 'Discount percent must be > 0 and < 100'
    if (!startsLocal || !endsLocal) return 'Pick a start and an end'
    if (new Date(startsLocal).getTime() >= new Date(endsLocal).getTime())
      return 'The start must be before the end'
    if (new Date(endsLocal).getTime() <= Date.now())
      return 'The end must be in the future'
    if (!Number.isFinite(priorityValue) || priorityValue < 0 || !Number.isInteger(priorityValue))
      return 'Priority must be a non-negative integer'
    return null
  })()

  const canSubmit = !validationError && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const res = await createCampaignPromotions({
        campaign,
        productIds: selected,
        deltaPercent: percentValue,
        scopeWarehouseId: warehouseId || null,
        startsAt: new Date(startsLocal).toISOString(),
        endsAt: new Date(endsLocal).toISOString(),
        priority: priorityValue,
      })
      if (res.ok) {
        toast.success(`${res.created} campaign promotions created.`)
        router.push('/discount-rules')
      } else {
        toast.error(res.error)
        setSubmitting(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create campaign failed.')
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Seasonal campaign</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="cp-campaign" className="text-xs">
              Campaign <span className="text-rose-600">*</span>
            </Label>
            <select
              id="cp-campaign"
              className={selectClass}
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
            >
              {CAMPAIGNS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cp-store" className="text-xs">
              Store
            </Label>
            <select
              id="cp-store"
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
            <Label htmlFor="cp-percent" className="text-xs">
              Discount % (same for all products) <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="cp-percent"
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
            <Label htmlFor="cp-priority" className="text-xs">
              Priority
            </Label>
            <Input
              id="cp-priority"
              type="number"
              min={0}
              step={1}
              value={priorityStr}
              onChange={(e) => setPriorityStr(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              10 = wins over a normal promotion (priority 0) on the same product.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cp-start" className="text-xs">
              Starts <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="cp-start"
              type="datetime-local"
              value={startsLocal}
              onChange={(e) => setStartsLocal(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cp-end" className="text-xs">
              Ends <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="cp-end"
              type="datetime-local"
              value={endsLocal}
              onChange={(e) => setEndsLocal(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              After this time the price returns to normal and the box disappears.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label className="text-xs">
              Products <span className="text-rose-600">*</span>
            </Label>
            <ProductPicker
              products={products}
              categories={categories}
              value={pickerValue}
              onChange={addProduct}
            />
            <p className="text-xs text-muted-foreground">
              Pick a product to add it to the list. Repeat for each product.
            </p>

            {selected.length > 0 ? (
              <ul className="divide-y rounded-md border">
                {selected.map((id) => {
                  const p = productById.get(id)
                  return (
                    <li
                      key={id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{p?.name ?? id}</span>
                        {p?.sku ? (
                          <span className="ml-2 text-xs text-muted-foreground">{p.sku}</span>
                        ) : null}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove product"
                        onClick={() => removeProduct(id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {selected.length} {selected.length === 1 ? 'product' : 'products'} selected
            </p>
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
            title={validationError ?? 'Create campaign'}
          >
            {submitting ? 'Creating…' : `Create ${selected.length || ''} promotions`}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

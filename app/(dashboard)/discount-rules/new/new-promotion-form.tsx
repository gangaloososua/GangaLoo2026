'use client'

// Round 20 — New promotion rule form
//
// Mirrors new-bulk-form.tsx, simplified: a promotion is a time-bound
// % off a single product, for EVERYONE (incl. walk-ins), with NO
// minimum quantity. A "daily deal" is a promotion whose date window
// covers one day; a "weekly deal" covers a week.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createPromotionRule } from '../actions'

type ProductOpt = { id: string; name: string; sku: string }

type Props = {
  products: ProductOpt[]
}

function toIsoOrNull(dateStr: string, endOfDay: boolean): string | null {
  if (!dateStr.trim()) return null
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  return `${dateStr}${suffix}`
}

export function NewPromotionRuleForm({ products }: Props) {
  const router = useRouter()

  const [name, setName] = useState('')
  const [productId, setProductId] = useState('')
  const [percentStr, setPercentStr] = useState('10')
  const [startsAtStr, setStartsAtStr] = useState('')
  const [endsAtStr, setEndsAtStr] = useState('')
  const [priorityStr, setPriorityStr] = useState('0')
  const [submitting, setSubmitting] = useState(false)

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
    if (startsAtStr && endsAtStr && new Date(startsAtStr) > new Date(endsAtStr))
      return 'Start date must be on or before end date'
    return null
  })()

  const canSubmit = !validationError && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const result = await createPromotionRule({
        name: name.trim(),
        scopeProductId: productId,
        deltaPercent: percentValue,
        startsAt: toIsoOrNull(startsAtStr, false),
        endsAt: toIsoOrNull(endsAtStr, true),
        priority: priorityValue,
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

          {/* Product picker (promotion is always product-scoped) */}
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">
              Product <span className="text-rose-600">*</span>
            </Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a product…" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The deal price applies to everyone, including walk-ins, with no
              minimum quantity.
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

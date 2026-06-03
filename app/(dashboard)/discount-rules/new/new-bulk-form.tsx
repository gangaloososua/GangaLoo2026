'use client'

// Round 19 Ã¢â‚¬â€ New bulk rule form
// Round 20.1 Ã¢â‚¬â€ product-scope selector swapped for the searchable
//              ProductPicker (category filter + type-to-search). The
//              product-vs-category SCOPE toggle is unchanged.
//
// Mirrors new-club-tier-form.tsx. Differences:
//   * scope selector: PRODUCT or CATEGORY (radio toggle), feeding the
//     matching control.
//   * a "minimum quantity" (threshold) field.
// A bulk rule fires when the line qty >= threshold AND the line's
// product (or its PRIMARY category) matches the chosen scope.

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
import { ProductPicker } from './product-picker'
import { createBulkRule } from '../actions'

type ProductOpt = {
  id: string
  name: string
  sku: string
  primaryCategoryId: string | null
}
type CategoryOpt = { id: string; name: string }

type Props = {
  products: ProductOpt[]
  categories: CategoryOpt[]
}

function toIsoOrNull(dateStr: string, endOfDay: boolean): string | null {
  if (!dateStr.trim()) return null
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  return `${dateStr}${suffix}`
}

export function NewBulkRuleForm({ products, categories }: Props) {
  const router = useRouter()

  const [name, setName] = useState('')
  const [scopeKind, setScopeKind] = useState<'product' | 'category' | 'all'>('product')
  const [productId, setProductId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [thresholdStr, setThresholdStr] = useState('10')
  const [percentStr, setPercentStr] = useState('5')
  const [startsAtStr, setStartsAtStr] = useState('')
  const [endsAtStr, setEndsAtStr] = useState('')
  const [priorityStr, setPriorityStr] = useState('0')
  const [submitting, setSubmitting] = useState(false)

  const thresholdValue = parseInt(thresholdStr, 10)
  const percentValue = Number(percentStr)
  const priorityValue = parseInt(priorityStr, 10)

  const validationError: string | null = (() => {
    if (!name.trim()) return 'Rule name is required'
    if (scopeKind === 'product' && !productId) return 'Pick a product'
    if (scopeKind === 'category' && !categoryId) return 'Pick a category'
    if (
      !Number.isFinite(thresholdValue) ||
      thresholdValue < 1 ||
      !Number.isInteger(thresholdValue)
    )
      return 'Minimum quantity must be a whole number of 1 or more'
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
      const result = await createBulkRule({
        name: name.trim(),
        scopeKind,
        scopeProductId: scopeKind === 'product' ? productId : null,
        scopeCategoryId: scopeKind === 'category' ? categoryId : null,
        thresholdQty: thresholdValue,
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
        <CardTitle className="text-base">Bulk / quantity discount</CardTitle>
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
              placeholder="e.g. Buy 10 wigs, 8% off"
            />
          </div>

          {/* Scope toggle */}
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">
              Applies to <span className="text-rose-600">*</span>
            </Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={scopeKind === 'product' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setScopeKind('product')}
              >
                A product
              </Button>
              <Button
                type="button"
                variant={scopeKind === 'category' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setScopeKind('category')}
              >
                A category
              </Button>
              <Button
                type="button"
                variant={scopeKind === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setScopeKind('all')}
              >
                All products
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Category rules match a product&rsquo;s primary category.
            </p>
          </div>

          {/* Product or category picker */}
          {scopeKind === 'product' && (
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
            </div>
          )}
          {scopeKind === 'category' && (
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">
                Category <span className="text-rose-600">*</span>
              </Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a categoryÃ¢â‚¬Â¦" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="dr-threshold" className="text-xs">
              Minimum quantity <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="dr-threshold"
              type="number"
              min={1}
              step={1}
              value={thresholdStr}
              onChange={(e) => setThresholdStr(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The discount applies once the line reaches this quantity.
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
            {submitting ? 'CreatingÃ¢â‚¬Â¦' : 'Create rule'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

'use client'

// Round 17 — New club_tier rule form
//
// Mirrors new-customer-override-form.tsx. Difference: a club-tier
// dropdown instead of a customer picker. 'none' is intentionally NOT
// offered (Model A: 'none' = not yet enrolled, gets no tier discount).

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
import { createClubTierRule } from '../actions'

// The four rewards tiers. 'none' is excluded by design.
const TIER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'bronze', label: 'Bronze' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
  { value: 'platinum', label: 'Platinum' },
]

function toIsoOrNull(dateStr: string, endOfDay: boolean): string | null {
  if (!dateStr.trim()) return null
  // dateStr is "YYYY-MM-DD"; tag with UTC midnight or end-of-day
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  return `${dateStr}${suffix}`
}

export function NewClubTierRuleForm() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [clubTier, setClubTier] = useState('')
  const [percentStr, setPercentStr] = useState('5')
  const [startsAtStr, setStartsAtStr] = useState('')
  const [endsAtStr, setEndsAtStr] = useState('')
  const [priorityStr, setPriorityStr] = useState('0')
  const [submitting, setSubmitting] = useState(false)

  const percentValue = Number(percentStr)
  const priorityValue = parseInt(priorityStr, 10)

  const validationError: string | null = (() => {
    if (!name.trim()) return 'Rule name is required'
    if (!clubTier) return 'Pick a club tier'
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
      const result = await createClubTierRule({
        name: name.trim(),
        clubTier,
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
        <CardTitle className="text-base">Club tier discount</CardTitle>
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
              placeholder="e.g. Gold tier loyalty 8%"
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">
              Club tier <span className="text-rose-600">*</span>
            </Label>
            <Select value={clubTier} onValueChange={setClubTier}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a tier…" />
              </SelectTrigger>
              <SelectContent>
                {TIER_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Every customer at this tier gets the discount automatically.
              Customers with no tier (&ldquo;none&rdquo;) are not eligible.
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

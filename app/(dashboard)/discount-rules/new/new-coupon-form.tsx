'use client'

// Round 42 — New coupon rule form
//
// A coupon is an order-level discount unlocked by a CODE the customer/seller
// types at checkout. Admin picks EITHER a percentage OR a fixed RD$ amount,
// an optional store (blank = all stores) and an optional channel (blank =
// both online and POS), plus an optional active date window.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCouponRule } from '../actions'

type Props = {
  warehouses: { id: string; name: string }[]
}

function toIsoOrNull(dateStr: string, endOfDay: boolean): string | null {
  if (!dateStr.trim()) return null
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  return `${dateStr}${suffix}`
}

// "1,234.50" / "1234.5" -> 123450 cents. Empty/invalid -> NaN.
function dopToCents(s: string): number {
  const n = Number(s.replace(/,/g, '').trim())
  if (!Number.isFinite(n)) return NaN
  return Math.round(n * 100)
}

const selectClass =
  'h-9 w-full rounded-md border bg-background px-3 text-sm shadow-sm'

export function NewCouponRuleForm({ warehouses }: Props) {
  const router = useRouter()

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [amountType, setAmountType] = useState<'percent' | 'fixed'>('percent')
  const [percentStr, setPercentStr] = useState('10')
  const [amountStr, setAmountStr] = useState('') // RD$ for fixed
  const [warehouseId, setWarehouseId] = useState('') // '' = all stores
  const [channel, setChannel] = useState<'' | 'pos' | 'online'>('') // '' = both
  const [startsAtStr, setStartsAtStr] = useState('')
  const [endsAtStr, setEndsAtStr] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const percentValue = Number(percentStr)
  const amountCents = dopToCents(amountStr)

  const validationError: string | null = (() => {
    if (!name.trim()) return 'Rule name is required'
    const c = code.trim()
    if (!c) return 'Coupon code is required'
    if (!/^[A-Za-z0-9._-]{2,40}$/.test(c))
      return 'Code: letters, numbers, dot, dash, underscore (2–40, no spaces)'
    if (amountType === 'percent') {
      if (!Number.isFinite(percentValue) || percentValue <= 0 || percentValue > 100)
        return 'Percent must be greater than 0 and at most 100'
    } else {
      if (!Number.isFinite(amountCents) || amountCents <= 0)
        return 'Fixed amount must be greater than zero'
    }
    if (
      startsAtStr &&
      endsAtStr &&
      new Date(startsAtStr) > new Date(endsAtStr)
    )
      return 'Start date must be on or before end date'
    return null
  })()

  const canSubmit = !validationError && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const result = await createCouponRule({
        name: name.trim(),
        code: code.trim(),
        amountType,
        deltaPercent: amountType === 'percent' ? percentValue : null,
        deltaCents: amountType === 'fixed' ? amountCents : null,
        scopeSourceWarehouseId: warehouseId || null,
        scopeChannel: channel === '' ? null : channel,
        startsAt: toIsoOrNull(startsAtStr, false),
        endsAt: toIsoOrNull(endsAtStr, true),
      })
      if (result.ok) {
        toast.success(`Coupon "${code.trim().toUpperCase()}" created.`)
        router.push('/discount-rules')
      } else {
        toast.error(result.error)
        setSubmitting(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create coupon failed.'
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Coupon code</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="cp-name" className="text-xs">
              Rule name <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="cp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Black Friday 15% off"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cp-code" className="text-xs">
              Code <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="cp-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. SAVE15"
              className="font-mono uppercase"
            />
            <p className="text-xs text-muted-foreground">
              What the customer types at checkout. Saved in uppercase.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cp-type" className="text-xs">
              Discount type <span className="text-rose-600">*</span>
            </Label>
            <select
              id="cp-type"
              className={selectClass}
              value={amountType}
              onChange={(e) =>
                setAmountType(e.target.value as 'percent' | 'fixed')
              }
            >
              <option value="percent">Percentage off (%)</option>
              <option value="fixed">Fixed amount off (RD$)</option>
            </select>
          </div>

          {amountType === 'percent' ? (
            <div className="space-y-1">
              <Label htmlFor="cp-percent" className="text-xs">
                Discount % <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="cp-percent"
                type="number"
                min={0.01}
                max={100}
                step={0.01}
                value={percentStr}
                onChange={(e) => setPercentStr(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comes off the order subtotal (before shipping).
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="cp-amount" className="text-xs">
                Amount off (RD$) <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="cp-amount"
                type="number"
                min={0}
                step="0.01"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="e.g. 200"
              />
              <p className="text-xs text-muted-foreground">
                Capped at the order subtotal; never makes the total negative.
              </p>
            </div>
          )}

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
            <p className="text-xs text-muted-foreground">
              Leave on &ldquo;All stores&rdquo; to allow the code everywhere.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cp-channel" className="text-xs">
              Where it works
            </Label>
            <select
              id="cp-channel"
              className={selectClass}
              value={channel}
              onChange={(e) =>
                setChannel(e.target.value as '' | 'pos' | 'online')
              }
            >
              <option value="">Online &amp; in-person</option>
              <option value="pos">In-person (POS) only</option>
              <option value="online">Online only</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cp-starts" className="text-xs">
              Active from (optional)
            </Label>
            <Input
              id="cp-starts"
              type="date"
              value={startsAtStr}
              onChange={(e) => setStartsAtStr(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cp-ends" className="text-xs">
              Active to (optional)
            </Label>
            <Input
              id="cp-ends"
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
            title={validationError ?? 'Create coupon'}
          >
            {submitting ? 'Creating…' : 'Create coupon'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

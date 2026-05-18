'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createAccount, updateAccount } from './actions'
import type { MoneyAccount } from '@/lib/money-accounts'

type Props = {
  account?: MoneyAccount
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  DOP: '₱',
  USD: '$',
  EUR: '€',
}

function formatBalance(cents: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? ''
  const major = cents / 100
  const formatted = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major)
  return `${symbol}${formatted}`
}

export function AccountForm({ account }: Props) {
  const isEdit = !!account
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      if (isEdit) {
        const result = await updateAccount(account!.id, formData)
        if (result?.error) {
          setError(result.error)
          return
        }
        toast.success('Account updated.')
        router.refresh()
      } else {
        // createAccount redirects on success, only returns on error
        const result = await createAccount(formData)
        if (result?.error) setError(result.error)
      }
    })
  }

  const a = account

  // Initial balance shown as a major-unit string for the input.
  const initialBalanceMajor = a
    ? (a.initial_balance_cents / 100).toFixed(2)
    : '0'

  return (
    <div className="space-y-6">
      {/* Current balance panel (edit only) */}
      {isEdit && a && (
        <Card>
          <CardContent className="space-y-1 pt-6">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Current balance
            </div>
            <div className="text-3xl font-semibold tabular-nums">
              {formatBalance(a.balance_cents, a.currency)}
            </div>
            <div className="text-xs text-muted-foreground">
              Balance is updated by transactions, not edited directly.
            </div>
          </CardContent>
        </Card>
      )}

      <form action={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={a?.name ?? ''}
              required
              autoFocus
              placeholder="e.g. Bank Banreservas Joel"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group_tag">Group (optional)</Label>
            <Input
              id="group_tag"
              name="group_tag"
              defaultValue={a?.group_tag ?? ''}
              placeholder="bank, cash, digital, credit, external..."
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="kind">Kind</Label>
            <Select name="kind" defaultValue={a?.kind ?? 'bank'}>
              <SelectTrigger id="kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="digital">Digital</SelectItem>
                <SelectItem value="credit_line">Credit line</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            {isEdit ? (
              <Input
                id="currency"
                value={a?.currency ?? ''}
                readOnly
                disabled
                className="bg-muted"
              />
            ) : (
              <Select name="currency" defaultValue="DOP">
                <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOP">DOP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            )}
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Currency is fixed after creation.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="scope">Scope</Label>
            <Select name="scope" defaultValue={a?.scope ?? 'business'}>
              <SelectTrigger id="scope"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                {a?.scope === 'mixed' && (
                  <SelectItem value="mixed">Mixed</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="initial_balance">Initial balance</Label>
            <Input
              id="initial_balance"
              name={isEdit ? undefined : 'initial_balance'}
              type="number"
              step="0.01"
              defaultValue={initialBalanceMajor}
              readOnly={isEdit}
              disabled={isEdit}
              className={isEdit ? 'bg-muted' : undefined}
            />
            <p className="text-xs text-muted-foreground">
              {isEdit
                ? 'Initial balance is fixed after creation.'
                : 'Major units (e.g. 100.50). Negative is fine for carry-over credit balances.'}
            </p>
          </div>
          <div className="flex items-end gap-6 pb-2">
            <div className="flex items-center gap-2">
              <Switch
                id="allow_negative"
                name="allow_negative"
                defaultChecked={a?.allow_negative ?? false}
              />
              <Label htmlFor="allow_negative">Allow overdraw</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                name="is_active"
                defaultChecked={a?.is_active ?? true}
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending
              ? isEdit ? 'Saving...' : 'Creating...'
              : isEdit ? 'Save changes' : 'Create account'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/money-accounts')}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createAccount } from './actions'

export function AccountForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      // createAccount redirects on success, only returns on error
      const result = await createAccount(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
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
            placeholder="bank, cash, digital, credit, external..."
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="kind">Kind</Label>
          <Select name="kind" defaultValue="bank">
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
          <Select name="currency" defaultValue="DOP">
            <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DOP">DOP</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="scope">Scope</Label>
          <Select name="scope" defaultValue="business">
            <SelectTrigger id="scope"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="business">Business</SelectItem>
              <SelectItem value="private">Private</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="initial_balance">Initial balance</Label>
          <Input
            id="initial_balance"
            name="initial_balance"
            type="number"
            step="0.01"
            defaultValue="0"
          />
          <p className="text-xs text-muted-foreground">
            Major units (e.g. 100.50). Negative is fine for carry-over
            credit balances.
          </p>
        </div>
        <div className="flex items-end gap-6 pb-2">
          <div className="flex items-center gap-2">
            <Switch id="allow_negative" name="allow_negative" />
            <Label htmlFor="allow_negative">Allow overdraw</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="is_active" name="is_active" defaultChecked />
            <Label htmlFor="is_active">Active</Label>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Creating...' : 'Create account'}
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
  )
}

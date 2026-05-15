'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  createProfile,
  updateProfile,
  type Profile,
  type UserRole,
} from './actions'

type Props = {
  profile?: Profile | null
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'seller', label: 'Seller' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'customer', label: 'Customer' },
]

const CLUB_TIERS = ['none', 'bronze', 'silver', 'gold', 'platinum'] as const

export function PeopleForm({ profile }: Props) {
  const isEdit = !!profile
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState<UserRole>(profile?.role ?? 'customer')

  const isStaff = role === 'owner' || role === 'admin' || role === 'seller' || role === 'distributor'
  const isCustomer = role === 'customer'

  function handleSubmit(formData: FormData) {
    setError(null)

    startTransition(async () => {
      if (isEdit) {
        const result = await updateProfile(profile!.id, formData)
        if (result?.error) {
          setError(result.error)
          return
        }
        toast.success('Person updated.')
        router.refresh()
      } else {
        const result = await createProfile(formData)
        if (result?.error) setError(result.error)
      }
    })
  }

  const p = profile
  const creditLimitDollars = p ? (p.credit_limit_cents / 100).toFixed(2) : ''

  return (
    <form action={handleSubmit} className="space-y-6">
      <Tabs defaultValue="identity">
        <TabsList>
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          {isStaff && <TabsTrigger value="commission">Commission</TabsTrigger>}
          {isCustomer && <TabsTrigger value="club">Club</TabsTrigger>}
        </TabsList>

        <TabsContent value="identity" className="space-y-4 pt-4" forceMount>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" name="full_name" defaultValue={p?.full_name ?? ''} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select name="role" defaultValue={p?.role ?? 'customer'} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={p?.email ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={p?.phone ?? ''} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="is_active" name="is_active" defaultChecked={p?.is_active ?? true} />
            <Label htmlFor="is_active">Active</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={p?.notes ?? ''} rows={3} />
          </div>
       </TabsContent>

        <TabsContent value="personal" className="space-y-4 pt-4" forceMount>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="document_id">Document ID (Cedula/Passport)</Label>
              <Input id="document_id" name="document_id" defaultValue={p?.document_id ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rnc">RNC</Label>
              <Input id="rnc" name="rnc" defaultValue={p?.rnc ?? ''} placeholder="Dominican tax ID" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="birthday">Birthday</Label>
              <Input id="birthday" name="birthday" type="date" defaultValue={p?.birthday ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue={p?.city ?? ''} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" defaultValue={p?.address ?? ''} />
            </div>
          </div>
        </TabsContent>

        {isStaff && (
          <TabsContent value="commission" className="space-y-4 pt-4" forceMount>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="commission_percent_override">Commission % override</Label>
                <Input
                  id="commission_percent_override"
                  name="commission_percent_override"
                  type="number"
                  step="0.01"
                  defaultValue={p?.commission_percent_override ?? ''}
                  placeholder="Leave blank to use product default"
                />
                <p className="text-xs text-muted-foreground">
                  When set, overrides the product&apos;s commission % for sales by this seller.
                </p>
              </div>
            </div>
          </TabsContent>
        )}

        {isCustomer && (
          <TabsContent value="club" className="space-y-4 pt-4" forceMount>
            <div className="flex items-center gap-2">
              <Switch id="is_club_member" name="is_club_member" defaultChecked={p?.is_club_member ?? false} />
              <Label htmlFor="is_club_member">Club member</Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="club_tier">Club tier</Label>
                <Select name="club_tier" defaultValue={p?.club_tier ?? 'none'}>
                  <SelectTrigger id="club_tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLUB_TIERS.map((t) => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="club_joined_at">Club joined</Label>
                <Input id="club_joined_at" name="club_joined_at" type="date" defaultValue={p?.club_joined_at ? p.club_joined_at.split('T')[0] : ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bonus_points">Bonus points</Label>
                <Input id="bonus_points" name="bonus_points" type="number" defaultValue={p?.bonus_points ?? 0} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_type">Customer type</Label>
                <Input id="customer_type" name="customer_type" defaultValue={p?.customer_type ?? ''} placeholder="retail / wholesale / seller" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="credit_limit">Credit limit (DOP)</Label>
                <Input id="credit_limit" name="credit_limit" type="number" step="0.01" defaultValue={creditLimitDollars} />
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create person'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/people')} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  )
} 
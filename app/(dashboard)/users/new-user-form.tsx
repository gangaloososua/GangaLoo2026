'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  createNewUser,
  promoteProfileToUser,
  type AssignableRole,
  type UnlinkedProfile,
} from './actions'

type Props = {
  unlinkedProfiles: UnlinkedProfile[]
}

export function NewUserForm({ unlinkedProfiles }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const idPrefix = useId()

  // Create-mode state
  const [createFullName, setCreateFullName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createPhone, setCreatePhone] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createRole, setCreateRole] = useState<AssignableRole>('seller')

  // Promote-mode state
  const [promoteProfileId, setPromoteProfileId] = useState('')
  const [promoteEmail, setPromoteEmail] = useState('')
  const [promotePassword, setPromotePassword] = useState('')

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('full_name', createFullName)
    fd.set('email', createEmail)
    fd.set('phone', createPhone)
    fd.set('password', createPassword)
    fd.set('role', createRole)
    startTransition(async () => {
      const res = await createNewUser(fd)
      if (res.ok) {
        toast.success(`Created ${createFullName}`)
        router.push('/users')
      } else {
        toast.error(res.error)
      }
    })
  }

  function handlePromote(e: React.FormEvent) {
    e.preventDefault()
    if (!promoteProfileId) {
      toast.error('Pick a person to promote')
      return
    }
    const fd = new FormData()
    fd.set('profile_id', promoteProfileId)
    fd.set('email', promoteEmail)
    fd.set('password', promotePassword)
    startTransition(async () => {
      const res = await promoteProfileToUser(fd)
      if (res.ok) {
        const p = unlinkedProfiles.find((x) => x.id === promoteProfileId)
        toast.success(`Login created for ${p?.full_name ?? 'user'}`)
        router.push('/users')
      } else {
        toast.error(res.error)
      }
    })
  }

  // When the picked profile changes, prefill email if the profile has one
  function onPickProfile(profileId: string) {
    setPromoteProfileId(profileId)
    const p = unlinkedProfiles.find((x) => x.id === profileId)
    if (p?.email) setPromoteEmail(p.email)
  }

  return (
    <Tabs defaultValue="create" className="space-y-4">
      <TabsList>
        <TabsTrigger value="create">Create new person</TabsTrigger>
        <TabsTrigger value="promote" disabled={unlinkedProfiles.length === 0}>
          Promote existing
          {unlinkedProfiles.length > 0 && (
            <span className="ml-1.5 text-xs text-muted-foreground">
              ({unlinkedProfiles.length})
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      {/* === CREATE MODE === */}
      <TabsContent value="create" forceMount>
        <form onSubmit={handleCreate} className="space-y-4 rounded-md border p-4">
          <p className="text-sm text-muted-foreground">
            Creates a new profile and a login account in one step. The login is active
            immediately — no email confirmation needed.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-fn`}>Full name</Label>
              <Input
                id={`${idPrefix}-fn`}
                value={createFullName}
                onChange={(e) => setCreateFullName(e.target.value)}
                placeholder="e.g. Delia Pérez"
                autoComplete="off"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-role`}>Role</Label>
              <Select
                value={createRole}
                onValueChange={(v) => setCreateRole(v as AssignableRole)}
              >
                <SelectTrigger id={`${idPrefix}-role`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">Seller</SelectItem>
                  <SelectItem value="distributor">Distributor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-email`}>Email (login)</Label>
              <Input
                id={`${idPrefix}-email`}
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="staff@example.com"
                autoComplete="off"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-phone`}>Phone (optional)</Label>
              <Input
                id={`${idPrefix}-phone`}
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
                placeholder="+1 809..."
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${idPrefix}-pw`}>Temporary password</Label>
              <Input
                id={`${idPrefix}-pw`}
                type="text"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="off"
                required
              />
              <p className="text-xs text-muted-foreground">
                Give this to the user verbally — they should change it after first login.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create user'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/users')}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </TabsContent>

      {/* === PROMOTE MODE === */}
      <TabsContent value="promote" forceMount>
        <form onSubmit={handlePromote} className="space-y-4 rounded-md border p-4">
          <p className="text-sm text-muted-foreground">
            Gives an existing person (from People) login access. Their profile stays as-is;
            we just create an auth account and link it.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-prof`}>Person</Label>
            <Select value={promoteProfileId} onValueChange={onPickProfile}>
              <SelectTrigger id={`${idPrefix}-prof`}>
                <SelectValue placeholder="Pick a person…" />
              </SelectTrigger>
              <SelectContent>
                {unlinkedProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}{' '}
                    <span className="text-muted-foreground">— {p.role}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only active sellers and distributors without a login are listed.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-pemail`}>Email (login)</Label>
              <Input
                id={`${idPrefix}-pemail`}
                type="email"
                value={promoteEmail}
                onChange={(e) => setPromoteEmail(e.target.value)}
                placeholder="staff@example.com"
                autoComplete="off"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-ppw`}>Temporary password</Label>
              <Input
                id={`${idPrefix}-ppw`}
                type="text"
                value={promotePassword}
                onChange={(e) => setPromotePassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="off"
                required
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating login…' : 'Create login'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/users')}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </TabsContent>
    </Tabs>
  )
}
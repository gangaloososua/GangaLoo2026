'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  changeUserRole,
  resetUserPassword,
  setUserBanned,
  unlinkUser,
  type AssignableRole,
  type UserRow,
} from './actions'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ManageUserForm({ user }: { user: UserRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const idPrefix = useId()

  const isOwner = user.role === 'owner'
  const isAdmin = user.role === 'admin'
  const roleLocked = isOwner || isAdmin

  // Role-change state
  const [newRole, setNewRole] = useState<AssignableRole>(
    user.role === 'distributor' ? 'distributor' : 'seller'
  )

  // Password-change state
  const [newPassword, setNewPassword] = useState('')

  function handleChangeRole() {
    if (newRole === user.role) {
      toast.error('Role is already ' + user.role)
      return
    }
    const fd = new FormData()
    fd.set('profile_id', user.profile_id)
    fd.set('role', newRole)
    startTransition(async () => {
      const res = await changeUserRole(fd)
      if (res.ok) {
        toast.success(`Role changed to ${newRole}`)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function handleResetPassword() {
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    const fd = new FormData()
    fd.set('auth_user_id', user.auth_user_id)
    fd.set('password', newPassword)
    startTransition(async () => {
      const res = await resetUserPassword(fd)
      if (res.ok) {
        toast.success('Password updated — share it with the user')
        setNewPassword('')
      } else {
        toast.error(res.error)
      }
    })
  }

  function handleSetBanned(banned: boolean) {
    const fd = new FormData()
    fd.set('auth_user_id', user.auth_user_id)
    fd.set('profile_id', user.profile_id)
    fd.set('banned', banned ? '1' : '0')
    startTransition(async () => {
      const res = await setUserBanned(fd)
      if (res.ok) {
        toast.success(banned ? 'User banned' : 'User unbanned')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function handleUnlink() {
    const fd = new FormData()
    fd.set('profile_id', user.profile_id)
    fd.set('auth_user_id', user.auth_user_id)
    startTransition(async () => {
      const res = await unlinkUser(fd)
      if (res.ok) {
        toast.success('Login removed — profile kept')
        router.push('/users')
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Identity panel (read-only here — edit name/phone in /people) */}
      <section className="rounded-md border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Identity</h2>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground">Email</div>
            <div className="font-medium">{user.email ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Phone</div>
            <div>{user.phone ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Status</div>
            <div>
              {user.banned ? (
                <Badge variant="destructive">Banned</Badge>
              ) : user.is_active ? (
                <Badge variant="outline">Active</Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Last sign-in</div>
            <div>{fmtDate(user.last_sign_in_at)}</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          To change the name or phone, edit the person in{' '}
          <a href={`/people/${user.profile_id}/edit`} className="underline">
            People
          </a>
          .
        </p>
      </section>

      {/* Role */}
      <section className="rounded-md border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Role</h2>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-role`}>Current role</Label>
            <Select
              value={newRole}
              onValueChange={(v) => setNewRole(v as AssignableRole)}
              disabled={roleLocked || isPending}
            >
              <SelectTrigger id={`${idPrefix}-role`} className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="seller">Seller</SelectItem>
                <SelectItem value="distributor">Distributor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleChangeRole}
            disabled={roleLocked || isPending || newRole === user.role}
          >
            Change role
          </Button>
        </div>
        {roleLocked && (
          <p className="text-xs text-muted-foreground">
            <Badge variant="default" className="mr-1.5">
              {user.role}
            </Badge>
            Role cannot be changed from this UI.
          </p>
        )}
      </section>

      {/* Password */}
      <section id="password" className="rounded-md border p-4 space-y-3 scroll-mt-4">
        <h2 className="text-sm font-semibold">Reset password</h2>
        <p className="text-xs text-muted-foreground">
          Sets a new password. Share it with the user verbally — they should change it
          themselves after.
        </p>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5 flex-1 max-w-sm">
            <Label htmlFor={`${idPrefix}-pw`}>New password</Label>
            <Input
              id={`${idPrefix}-pw`}
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="off"
            />
          </div>
          <Button
            variant="secondary"
            onClick={handleResetPassword}
            disabled={isPending || newPassword.length < 8}
          >
            Set password
          </Button>
        </div>
      </section>

      {/* Access — ban / unban / unlink */}
      <section id="access" className="rounded-md border p-4 space-y-3 scroll-mt-4">
        <h2 className="text-sm font-semibold">Access</h2>
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            <strong className="text-foreground">Ban</strong> blocks the user from logging in but keeps their account and history.
            Reversible.
          </p>
          <p className="text-muted-foreground">
            <strong className="text-foreground">Unlink</strong> deletes the login account permanently. The profile stays — historical
            sales and commissions remain tied to their name. Use when someone leaves for good.
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          {user.banned ? (
            <Button
              variant="outline"
              onClick={() => handleSetBanned(false)}
              disabled={isPending}
            >
              Unban
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={isPending || isOwner}>
                  Ban
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Ban {user.full_name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    They won&apos;t be able to log in until unbanned. Their profile and history
                    stay.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleSetBanned(true)}>
                    Ban
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isPending || isOwner}>
                Unlink (delete login)
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unlink {user.full_name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Deletes the login account permanently. The profile stays — sales and
                  commissions remain attached to their name. You can re-create a login later
                  if needed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleUnlink}>
                  Unlink
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {isOwner && (
          <p className="text-xs text-muted-foreground">
            The owner cannot be banned or unlinked.
          </p>
        )}
      </section>
    </div>
  )
}
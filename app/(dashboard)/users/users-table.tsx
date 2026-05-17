'use client'

import Link from 'next/link'
import { MoreHorizontal, Pencil, Shield, ShieldOff, KeyRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import type { UserRow } from './actions'

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

function roleBadgeVariant(role: UserRow['role']): 'default' | 'secondary' | 'outline' {
  if (role === 'owner') return 'default'
  if (role === 'admin') return 'default'
  if (role === 'seller') return 'secondary'
  return 'outline'
}

export function UsersTable({ users }: { users: UserRow[] }) {
  if (users.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No users yet. Click <span className="font-medium">New user</span> to create the first one.
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Role</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Last sign-in</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.profile_id} className="border-b last:border-b-0">
              <td className="px-3 py-2 font-medium">{u.full_name}</td>
              <td className="px-3 py-2 text-muted-foreground">{u.email ?? '—'}</td>
              <td className="px-3 py-2">
                <Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
              </td>
              <td className="px-3 py-2">
                {u.banned ? (
                  <Badge variant="destructive">Banned</Badge>
                ) : u.is_active ? (
                  <Badge variant="outline">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{fmtDate(u.last_sign_in_at)}</td>
              <td className="px-3 py-2 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/users/${u.profile_id}/edit`}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Manage
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href={`/users/${u.profile_id}/edit#password`}>
                        <KeyRound className="mr-2 h-4 w-4" />
                        Reset password
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/users/${u.profile_id}/edit#access`}>
                        {u.banned ? (
                          <>
                            <Shield className="mr-2 h-4 w-4" />
                            Unban
                          </>
                        ) : (
                          <>
                            <ShieldOff className="mr-2 h-4 w-4" />
                            Ban / unlink
                          </>
                        )}
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
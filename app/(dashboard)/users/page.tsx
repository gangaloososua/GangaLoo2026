import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listUsers } from './actions'
import { UsersTable } from './users-table'
import { requireOwner } from '@/lib/auth/guard'

export default async function UsersPage() {
  await requireOwner()
  const users = await listUsers()

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Staff with login access â€” sellers and distributors.
          </p>
        </div>
        <Button asChild>
          <Link href="/users/new">
            <Plus className="mr-2 h-4 w-4" />
            New user
          </Link>
        </Button>
      </div>
      <UsersTable users={users} />
    </div>
  )
}

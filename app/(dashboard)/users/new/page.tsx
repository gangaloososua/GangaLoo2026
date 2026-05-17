import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { listUnlinkedProfiles } from '../actions'
import { NewUserForm } from '../new-user-form'
import { requireOwner } from '@/lib/auth/guard'

export default async function NewUserPage() {
  await requireOwner()
  const unlinkedProfiles = await listUnlinkedProfiles()

  return (
    <div className="space-y-4 max-w-3xl">
      <Link
        href="/users"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to users
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New user</h1>
        <p className="text-sm text-muted-foreground">
          Give a seller or distributor login access.
        </p>
      </div>
      <NewUserForm unlinkedProfiles={unlinkedProfiles} />
    </div>
  )
}

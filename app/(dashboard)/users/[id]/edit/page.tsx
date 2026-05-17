import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getUser } from '../../actions'
import { ManageUserForm } from '../../manage-user-form'

export default async function ManageUserPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getUser(id)
  if (!user) notFound()

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
        <h1 className="text-2xl font-semibold tracking-tight">{user.full_name}</h1>
        <p className="text-sm text-muted-foreground">Manage login access.</p>
      </div>
      <ManageUserForm user={user} />
    </div>
  )
}
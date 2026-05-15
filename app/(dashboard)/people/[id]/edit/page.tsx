import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getProfile } from '../../actions'
import { PeopleForm } from '../../people-form'

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await getProfile(id)
  if (!profile) notFound()

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/people" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Back to people
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{profile.full_name}</h1>
        <p className="text-sm text-muted-foreground">Edit person details.</p>
      </div>
      <PeopleForm profile={profile} />
    </div>
  )
}
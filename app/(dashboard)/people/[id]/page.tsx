import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getProfile } from '../actions'
import { fetchPersonFinancials } from '@/lib/person-financials'
import { PersonFinancialsView } from './financials-view'
import { MemberCardsManager } from '../member-cards-manager'
import { listMemberCards } from '../member-card-actions'
import { requireOwner } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireOwner()
  const { id } = await params

  // getProfile gates access: non-owners only see customers (returns null
  // otherwise), so we 404 in that case.
  const profile = await getProfile(id)
  if (!profile) notFound()

  const financials = await fetchPersonFinancials(id)

  // Membership cards only apply to customers.
  const memberCards = profile.role === 'customer' ? await listMemberCards(id) : []

  const roleLabel = profile.role.charAt(0).toUpperCase() + profile.role.slice(1)

  return (
    <div className="space-y-4">
      <Link
        href="/people"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to people
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {profile.full_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {roleLabel}
            {profile.phone ? ` · ${profile.phone}` : ''}
            {profile.city ? ` · ${profile.city}` : ''}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/people/${id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit details
          </Link>
        </Button>
      </div>

      <PersonFinancialsView financials={financials} role={profile.role} />

      {profile.role === 'customer' ? (
        <MemberCardsManager
          customerId={id}
          initialCards={memberCards}
          club={{
            isMember: profile.is_club_member,
            tier: profile.club_tier,
            memberNo: null, // club_member_no isn't on the Profile type yet
            points: profile.bonus_points,
          }}
        />
      ) : null}
    </div>
  )
}

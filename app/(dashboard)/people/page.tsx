import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listPeople, type PeopleFilter, type UserRole } from './actions'
import { PeopleTable } from './people-table'
import { PeopleFilters } from './people-filters'
import { requireAdminCaller } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{
    role?: string
    distributor?: string
    active?: string
    q?: string
  }>
}) {
  const caller = await requireAdminCaller()
  const canManagePeople = isOwnerEquivalent(caller.role)

  const sp = await searchParams
  const validRoles: UserRole[] = ['owner', 'admin', 'seller', 'distributor', 'customer']
  const role = validRoles.includes(sp.role as UserRole) ? (sp.role as UserRole) : undefined
  const activeStatus =
    sp.active === 'active' ? 'active' :
    sp.active === 'inactive' ? 'inactive' :
    'all'

  // For non-owners, the URL params for role/distributor are ignored.
  // listPeople will also enforce this at the action layer; doing it here
  // keeps the UI honest (no chip looking selected when it isn't).
  const effectiveRole = canManagePeople ? role : 'customer'
  const effectiveDistributorOnly = canManagePeople ? sp.distributor === '1' : false

  const filter: PeopleFilter = {
    role: effectiveRole as UserRole | undefined,
    distributorOnly: effectiveDistributorOnly,
    activeStatus,
    search: sp.q,
  }
  const people = await listPeople(filter)
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">
            Customers, sellers, distributors, and staff.
          </p>
        </div>
        {canManagePeople && (
          <Button asChild>
            <Link href="/people/new">
              <Plus className="mr-2 h-4 w-4" />
              New person
            </Link>
          </Button>
        )}
      </div>
      <PeopleFilters
        role={effectiveRole as UserRole | undefined}
        distributorOnly={filter.distributorOnly ?? false}
        activeStatus={activeStatus}
        search={sp.q ?? ''}
        canManagePeople={canManagePeople}
      />
      <PeopleTable people={people} />
    </div>
  )
}

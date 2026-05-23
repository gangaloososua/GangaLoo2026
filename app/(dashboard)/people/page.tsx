import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { listPeople, type PeopleFilter, type UserRole } from './actions'
import { PeopleTable } from './people-table'
import { PeopleFilters } from './people-filters'
import { SuppliersManager } from './suppliers-manager'
import { requireOwner } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'
import { listSuppliers } from '@/lib/suppliers'

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
  const caller = await requireOwner()
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
  // Suppliers/couriers management is owner-only; only fetch when allowed.
  const suppliers = canManagePeople ? await listSuppliers({}) : []

  const header = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">People</h1>
      <p className="text-sm text-muted-foreground">
        Customers, sellers, distributors, staff, and your suppliers &amp; couriers.
      </p>
    </div>
  )

  const contacts = (
    <div className="space-y-4">
      {canManagePeople && (
        <div className="flex justify-end">
          <Button asChild>
            <Link href="/people/new">
              <Plus className="mr-2 h-4 w-4" />
              New person
            </Link>
          </Button>
        </div>
      )}
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

  // Non-owners: original single-view experience, no supplier tab.
  if (!canManagePeople) {
    return (
      <div className="space-y-4">
        {header}
        {contacts}
      </div>
    )
  }

  // Owners: tabbed - Contacts | Suppliers & Couriers
  return (
    <div className="space-y-4">
      {header}
      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers &amp; Couriers</TabsTrigger>
        </TabsList>
        <TabsContent value="contacts" className="space-y-4 pt-4">
          {contacts}
        </TabsContent>
        <TabsContent value="suppliers" className="pt-4">
          <SuppliersManager rows={suppliers} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

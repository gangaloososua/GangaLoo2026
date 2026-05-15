'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { UserRole } from './actions'

type Props = {
  role?: UserRole
  distributorOnly: boolean
  activeStatus: 'all' | 'active' | 'inactive'
  search: string
}

const ROLE_CHIPS: { value: UserRole | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'customer', label: 'Customers' },
  { value: 'seller', label: 'Sellers' },
  { value: 'distributor', label: 'Distributors (role)' },
  { value: 'admin', label: 'Admins' },
  { value: 'owner', label: 'Owners' },
]

export function PeopleFilters({ role, distributorOnly, activeStatus, search }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [searchInput, setSearchInput] = useState(search)

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => {
      if (searchInput === (sp.get('q') ?? '')) return
      updateParam('q', searchInput || null)
    }, 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(sp.toString())
    if (value === null) params.delete(key)
    else params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {ROLE_CHIPS.map((chip) => {
          const isActive = chip.value === 'all' ? !role : role === chip.value
          return (
            <Button
              key={chip.value}
              type="button"
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateParam('role', chip.value === 'all' ? null : chip.value)}
            >
              {chip.label}
            </Button>
          )
        })}
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          type="button"
          variant={distributorOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => updateParam('distributor', distributorOnly ? null : '1')}
        >
          Warehouse distributors
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        {(['all', 'active', 'inactive'] as const).map((s) => (
          <Button
            key={s}
            type="button"
            variant={activeStatus === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => updateParam('active', s === 'all' ? null : s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>
      <div className="max-w-sm">
        <Input
          placeholder="Search by name, email, or phone…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>
    </div>
  )
}
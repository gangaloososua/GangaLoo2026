'use client'

// Round 73 â€” plain customer picker for the Caja register. Lets staff attach a
// customer (besides scanning a Club card), so a reserved/credit sale is tied to
// the right person instead of "walk-in". Sets the same `member` the card scan
// sets, so club/loyalty pricing and the customer_id at checkout are unchanged.
//
// 2026-10-05: + "new customer" button next to the dropdown. It reuses the same
// QuickCustomerDialog the New Sale screen already uses (create_customer_quick
// RPC, open to sellers/distributors too), so a customer who isn't in the list
// can be added mid-sale. The new customer is selected immediately. The picker
// no longer disappears when the customer list is empty -- the add button is
// the point in that case.

import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type { CustomerPickerItem } from '@/lib/sales'
import type { ScannedMember } from './member-scan-actions'
import type { Locale } from '@/lib/i18n/dictionary'
import { QuickCustomerDialog } from '../sales/new/quick-customer-dialog'

function toMember(c: CustomerPickerItem): ScannedMember {
  return {
    customerId: c.id,
    fullName: c.full_name,
    phone: null,
    isClubMember: false,
    tier: c.club_tier ?? 'none',
    memberNo: null,
    points: 0,
  }
}

export function CustomerPicker({
  customers,
  onPick,
  locale,
}: {
  customers: CustomerPickerItem[]
  onPick: (m: ScannedMember) => void
  locale: Locale
}) {
  const es = locale === 'es'
  const [dialogOpen, setDialogOpen] = useState(false)
  // Customers created during this session, so they stay in the dropdown if
  // staff clears the chip and wants to pick them again.
  const [added, setAdded] = useState<CustomerPickerItem[]>([])

  const all = [
    ...customers,
    ...added.filter((a) => !customers.some((c) => c.id === a.id)),
  ]

  return (
    <>
      <div className="flex items-center gap-2">
        {all.length > 0 && (
          <Select
            onValueChange={(id) => {
              const c = all.find((x) => x.id === id)
              if (!c) return
              onPick(toMember(c))
            }}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={es ? 'Elegir cliente (opcional)' : 'Choose customer (optional)'}
              />
            </SelectTrigger>
            <SelectContent>
              {all.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => setDialogOpen(true)}
          aria-label={es ? 'Nuevo cliente' : 'New customer'}
          title={es ? 'Nuevo cliente' : 'New customer'}
        >
          <UserPlus className="size-4" />
        </Button>
      </div>

      <QuickCustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        locale={locale}
        onCreated={(c) => {
          setAdded((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]))
          onPick(toMember(c))
        }}
      />
    </>
  )
}

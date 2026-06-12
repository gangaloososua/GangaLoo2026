'use client'

// Round 73 — plain customer picker for the Caja register. Lets staff attach a
// customer (besides scanning a Club card), so a reserved/credit sale is tied to
// the right person instead of "walk-in". Sets the same `member` the card scan
// sets, so club/loyalty pricing and the customer_id at checkout are unchanged.
// Shows nothing if there are no customers to choose from.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CustomerPickerItem } from '@/lib/sales'
import type { ScannedMember } from './member-scan-actions'
import type { Locale } from '@/lib/i18n/dictionary'

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
  if (customers.length === 0) return null

  return (
    <Select
      onValueChange={(id) => {
        const c = customers.find((x) => x.id === id)
        if (!c) return
        onPick({
          customerId: c.id,
          fullName: c.full_name,
          phone: null,
          isClubMember: false,
          tier: c.club_tier ?? 'none',
          memberNo: null,
          points: 0,
        })
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder={es ? 'Elegir cliente (opcional)' : 'Choose customer (optional)'} />
      </SelectTrigger>
      <SelectContent>
        {customers.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
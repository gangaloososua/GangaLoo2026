import { requireOwner } from '@/lib/auth/guard'
import { fetchWhoOwesMe } from '@/lib/who-owes'
import { WhoOwesView } from './who-owes-view'

export const dynamic = 'force-dynamic'

export default async function WhoOwesPage() {
  await requireOwner()
  const data = await fetchWhoOwesMe()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Who owes me</h1>
        <p className="text-sm text-muted-foreground">
          Outstanding balances by person &mdash; what customers owe on their
          invoices, plus what sellers owe on Walk-in pay-later orders.
        </p>
      </div>

      <WhoOwesView data={data} />
    </div>
  )
}

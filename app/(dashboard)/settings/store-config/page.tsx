import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { fetchStoreConfig } from '@/lib/store-config'
import { ConfigTable } from './config-table'
import { requireOwner } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export default async function StoreConfigPage() {
  await requireOwner()
  const rows = await fetchStoreConfig()
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Store Config</h1>
        <p className="text-sm text-muted-foreground">
          Global key/value settings. Press Enter to save a change, or Esc to revert.
          New keys are added by migrations, not from this page.
        </p>
      </div>
      <ConfigTable rows={rows} />
    </div>
  )
}

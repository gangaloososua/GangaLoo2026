import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireOwner } from '@/lib/auth/guard'
import { fetchStoreInfo } from '@/lib/store-config'
import { ReceiptForm } from './receipt-form'

export const dynamic = 'force-dynamic'

export default async function ReceiptSettingsPage() {
  await requireOwner()
  const storeInfo = await fetchStoreInfo()

  return (
    <div className="space-y-4 max-w-2xl">
      <Link
        href="/settings"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to settings
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Receipt identity
        </h1>
        <p className="text-sm text-muted-foreground">
          Store name, address, phone, and RNC printed on every POS
          receipt.
        </p>
      </div>
      <ReceiptForm storeInfo={storeInfo} />
    </div>
  )
}

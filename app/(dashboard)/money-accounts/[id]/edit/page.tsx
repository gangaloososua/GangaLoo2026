import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requireOwner } from '@/lib/auth/guard'
import { getAccount } from '@/lib/money-accounts'
import { AccountForm } from '../../account-form'

export const dynamic = 'force-dynamic'

export default async function EditMoneyAccountPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireOwner()

  const { id } = await params
  const account = await getAccount(id)
  if (!account) notFound()

  return (
    <div className="space-y-4 max-w-2xl">
      <Link
        href="/money-accounts"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to money accounts
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit money account
        </h1>
        <p className="text-sm text-muted-foreground">{account.name}</p>
      </div>
      <AccountForm account={account} />
    </div>
  )
}

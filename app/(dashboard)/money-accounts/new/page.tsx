import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireOwner } from '@/lib/auth/guard'
import { AccountForm } from '../account-form'

export default async function NewMoneyAccountPage() {
  await requireOwner()

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
          New money account
        </h1>
        <p className="text-sm text-muted-foreground">
          A new place where money sits. The initial balance becomes
          the running balance; transactions move it from there.
        </p>
      </div>
      <AccountForm />
    </div>
  )
}

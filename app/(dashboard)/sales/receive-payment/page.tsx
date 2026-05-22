import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { requireOwner } from '@/lib/auth/guard'
import { listMoneyAccounts } from '@/lib/sales'
import { fetchOpenInvoicesForPayment } from '@/lib/receive-payment'
import { ReceivePaymentView } from './receive-payment-view'

export const dynamic = 'force-dynamic'

export default async function ReceivePaymentPage() {
  await requireOwner()

  const [openInvoices, moneyAccounts] = await Promise.all([
    fetchOpenInvoicesForPayment(),
    listMoneyAccounts(),
  ])

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/sales"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver a ventas
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recibir pago</h1>
        <p className="text-sm text-muted-foreground">
          Registra un depósito y repártelo entre una o varias facturas abiertas.
        </p>
      </div>
      <ReceivePaymentView
        openInvoices={openInvoices}
        moneyAccounts={moneyAccounts}
      />
    </div>
  )
}

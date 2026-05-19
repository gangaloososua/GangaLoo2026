import { Suspense } from 'react'
import { requireOwner } from '@/lib/auth/guard'
import {
  listCourierPayments,
  getCourierPaymentFilterOptions,
} from '@/lib/courier-payments'
import { CourierPaymentsListTable } from './list-table'

type SearchParams = {
  courierId?: string
  paidAfter?: string
  paidBefore?: string
  page?: string
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

export default async function CourierPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireOwner()
  const sp = await searchParams
  const courierId = sp.courierId?.trim() || undefined
  const paidAfter = sp.paidAfter?.trim() || undefined
  const paidBefore = sp.paidBefore?.trim() || undefined
  const page = parsePage(sp.page)
  const perPage = 50

  const [listResult, filterOptions] = await Promise.all([
    listCourierPayments({
      courierId: courierId ?? null,
      paidAfter: paidAfter ?? null,
      paidBefore: paidBefore ?? null,
      page,
      perPage,
    }),
    getCourierPaymentFilterOptions(),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Courier Payments
          </h1>
          <p className="text-sm text-muted-foreground">
            Transport invoices paid to couriers.{' '}
            <span className="tabular-nums">
              {listResult.total} {listResult.total === 1 ? 'payment' : 'payments'}
            </span>
            .
          </p>
        </div>
      </div>
      <Suspense>
        <CourierPaymentsListTable
          rows={listResult.rows}
          total={listResult.total}
          page={listResult.page}
          perPage={listResult.perPage}
          couriers={filterOptions.couriers}
          currentFilters={{
            courierId: courierId ?? '',
            paidAfter: paidAfter ?? '',
            paidBefore: paidBefore ?? '',
          }}
        />
      </Suspense>
    </div>
  )
}

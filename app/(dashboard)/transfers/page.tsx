import Link from 'next/link'
import type { ReactNode } from 'react'
import { Plus, ArrowRight, Eye } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/format'
import { localeForRole, plural, type Locale } from '@/lib/i18n/dictionary'
import { tt } from '@/lib/i18n/transfers-i18n'
import {
  listTransfers,
  listPendingRequests,
  listTransfersForDistributor,
  listWarehousesForDistributor,
  type TransferListRow,
  type PendingRequest,
} from '@/lib/stock-transfers'
import { ReceiveTransferButton } from './receive-transfer-button'
import { CancelTransferButton } from './cancel-transfer-button'
import { RequestReviewButtons, WithdrawRequestButton } from './request-actions'

export const dynamic = 'force-dynamic'

function statusBadge(status: string, locale: Locale) {
  const label = tt(locale, `tr.status.${status}`)
  switch (status) {
    case 'requested':
      return <Badge className="bg-sky-100 text-sky-900 hover:bg-sky-100">{label}</Badge>
    case 'in_transit':
      return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">{label}</Badge>
    case 'received':
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{label}</Badge>
    case 'rejected':
      return <Badge variant="outline" className="border-rose-400 text-rose-700">{label}</Badge>
    case 'cancelled':
      return <Badge variant="outline" className="text-muted-foreground">{label}</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function RouteLabel({ t }: { t: TransferListRow }) {
  return (
    <span className="text-sm font-medium leading-snug">
      {t.from_warehouse_name}
      <ArrowRight className="mx-1 inline h-3.5 w-3.5 text-muted-foreground" />
      {t.to_warehouse_name}
    </span>
  )
}

// 2026-10-29: tidier rows. Info gets the full width (status + route, then
// "11 units · 5 products", then the date, each on its own line); the buttons
// sit underneath on phones and to the right on larger screens. Every row has
// an explicit Open/Ver button to the detail page.
function metaParts(t: TransferListRow, locale: Locale): { counts: string; when: string } {
  const units = `${t.total_qty} ${plural(locale, t.total_qty, 'unit.one', 'unit.other')}`
  const prods = `${t.item_count} ${plural(locale, t.item_count, 'product.one', 'product.other')}`
  let when = ''
  if (t.status === 'received' && t.received_at)
    when = `${tt(locale, 'tr.meta.received')} ${formatDateTime(t.received_at)}`
  else if (t.status === 'in_transit' && t.initiated_at)
    when = `${tt(locale, 'tr.meta.sent')} ${formatDateTime(t.initiated_at)}`
  else if (t.requested_at)
    when = `${tt(locale, 'tr.meta.requested')} ${formatDateTime(t.requested_at)}`
  return { counts: `${units} · ${prods}`, when }
}

function RowInfo({ t, locale, extra }: { t: TransferListRow; locale: Locale; extra?: ReactNode }) {
  const { counts, when } = metaParts(t, locale)
  return (
    <Link href={`/transfers/${t.id}`} className="block min-w-0 flex-1 hover:opacity-80">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {statusBadge(t.status, locale)}
        <RouteLabel t={t} />
      </div>
      <div className="mt-1.5 text-sm">{counts}</div>
      {when ? <div className="mt-0.5 text-xs text-muted-foreground">{when}</div> : null}
      {extra}
    </Link>
  )
}

function OpenButton({ id, locale }: { id: string; locale: Locale }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={`/transfers/${id}`}>
        <Eye className="mr-1 h-4 w-4" />
        {locale === 'es' ? 'Ver' : 'Open'}
      </Link>
    </Button>
  )
}

const ROW = 'flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6'
const ACTIONS = 'flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end'

function ShippedRow({
  t,
  showReceive,
  showCancel,
  locale,
}: {
  t: TransferListRow
  showReceive: boolean
  showCancel?: boolean
  locale: Locale
}) {
  return (
    <div className={ROW}>
      <RowInfo t={t} locale={locale} />
      <div className={ACTIONS}>
        <OpenButton id={t.id} locale={locale} />
        {showCancel && (
          <CancelTransferButton
            transferId={t.id}
            fromWarehouseName={t.from_warehouse_name}
            locale={locale}
          />
        )}
        {showReceive && (
          <ReceiveTransferButton
            transferId={t.id}
            toWarehouseName={t.to_warehouse_name}
            locale={locale}
          />
        )}
      </div>
    </div>
  )
}

function PlainRow({
  t,
  locale,
  action,
}: {
  t: TransferListRow
  locale: Locale
  action?: ReactNode
}) {
  return (
    <div className={ROW}>
      <RowInfo
        t={t}
        locale={locale}
        extra={
          t.status_note ? (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {tt(locale, 'tr.meta.note')}: {t.status_note}
            </div>
          ) : null
        }
      />
      <div className={ACTIONS}>
        <OpenButton id={t.id} locale={locale} />
        {action}
      </div>
    </div>
  )
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string
  count?: number
  empty: string
  children: ReactNode
}) {
  const isEmpty = count === 0
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {title}
          {typeof count === 'number' ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">({count})</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isEmpty ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="divide-y">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}

function PageHeader({ title, blurb, newHref, newLabel }: {
  title: string
  blurb: string
  newHref: string
  newLabel: string
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{blurb}</p>
      </div>
      <Button asChild>
        <Link href={newHref}>
          <Plus className="mr-1 h-4 w-4" />
          {newLabel}
        </Link>
      </Button>
    </div>
  )
}

export default async function TransfersPage() {
  const caller = await requireRole(['owner', 'admin', 'distributor'] as const)
  const locale = localeForRole(caller.role)

  // ---- Owner / admin view (English) ----
  if (isOwnerEquivalent(caller.role)) {
    const [pending, inTransit, received] = await Promise.all([
      listPendingRequests(),
      listTransfers({ status: 'in_transit' }),
      listTransfers({ status: 'received', limit: 50 }),
    ])
    return (
      <div className="space-y-4">
        <PageHeader
          title={tt(locale, 'tr.list.title')}
          blurb={tt(locale, 'tr.list.ownerBlurb')}
          newHref="/transfers/new"
          newLabel={tt(locale, 'tr.list.newTransfer')}
        />

        <Section
          title={tt(locale, 'tr.sec.pending')}
          count={pending.length}
          empty={tt(locale, 'tr.empty.pending')}
        >
          {pending.map((r: PendingRequest) => (
            <div key={r.id} className="px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {statusBadge(r.status, locale)}
                    <RouteLabel t={r} />
                  </div>
                  <div className="mt-1.5 text-sm">{metaParts(r, locale).counts}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {metaParts(r, locale).when}
                    {r.requested_by_name ? ` · ${tt(locale, 'tr.meta.by')} ${r.requested_by_name}` : ''}
                  </div>
                  {r.notes ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {tt(locale, 'tr.meta.note')}: {r.notes}
                    </div>
                  ) : null}
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {r.items.map((it) => (
                      <li key={it.id}>
                        {it.product_name} — {it.qty}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={ACTIONS}>
                  <OpenButton id={r.id} locale={locale} />
                  <RequestReviewButtons request={r} />
                </div>
              </div>
            </div>
          ))}
        </Section>

        <Section
          title={tt(locale, 'tr.sec.inTransit')}
          count={inTransit.length}
          empty={tt(locale, 'tr.empty.inTransit')}
        >
          {inTransit.map((t) => (
            <ShippedRow key={t.id} t={t} showReceive showCancel locale={locale} />
          ))}
        </Section>

        <Section title={tt(locale, 'tr.sec.received')} empty={tt(locale, 'tr.empty.received')}>
          {received.map((t) => (
            <ShippedRow key={t.id} t={t} showReceive={false} locale={locale} />
          ))}
        </Section>
      </div>
    )
  }

  // ---- Distributor view (Spanish) ----
  const mine = await listWarehousesForDistributor(caller.id)
  const myWh = mine[0] ?? null
  if (!myWh) {
    return (
      <div className="space-y-4">
        <PageHeader
          title={tt(locale, 'tr.list.title')}
          blurb={tt(locale, 'tr.list.distBlurb')}
          newHref="/transfers/new"
          newLabel={tt(locale, 'tr.list.newRequest')}
        />
        <Card>
          <CardContent className="px-6 py-6 text-sm text-muted-foreground">
            {tt(locale, 'tr.list.noWh')}
          </CardContent>
        </Card>
      </div>
    )
  }

  const all = await listTransfersForDistributor(caller.id, myWh.id)
  const myRequests = all.filter((t) => t.status === 'requested')
  const incoming = all.filter((t) => t.status === 'in_transit' && t.to_warehouse_id === myWh.id)
  const outgoing = all.filter((t) => t.status === 'in_transit' && t.from_warehouse_id === myWh.id)
  const received = all.filter((t) => t.status === 'received').slice(0, 50)
  const closed = all
    .filter((t) => t.status === 'rejected' || t.status === 'cancelled')
    .slice(0, 20)

  return (
    <div className="space-y-4">
      <PageHeader
        title={tt(locale, 'tr.list.title')}
        blurb={tt(locale, 'tr.list.distBlurb')}
        newHref="/transfers/new"
        newLabel={tt(locale, 'tr.list.newRequest')}
      />

      <Section
        title={tt(locale, 'tr.sec.myRequests')}
        count={myRequests.length}
        empty={tt(locale, 'tr.empty.pending')}
      >
        {myRequests.map((t) => (
          <PlainRow
            key={t.id}
            t={t}
            locale={locale}
            action={<WithdrawRequestButton transferId={t.id} locale={locale} />}
          />
        ))}
      </Section>

      <Section
        title={tt(locale, 'tr.sec.coming')}
        count={incoming.length}
        empty={tt(locale, 'tr.empty.coming')}
      >
        {incoming.map((t) => (
          <ShippedRow key={t.id} t={t} showReceive locale={locale} />
        ))}
      </Section>

      <Section
        title={tt(locale, 'tr.sec.sending')}
        count={outgoing.length}
        empty={tt(locale, 'tr.empty.sending')}
      >
        {outgoing.map((t) => (
          <ShippedRow key={t.id} t={t} showReceive={false} locale={locale} />
        ))}
      </Section>

      <Section title={tt(locale, 'tr.sec.received')} empty={tt(locale, 'tr.empty.received')}>
        {received.map((t) => (
          <ShippedRow key={t.id} t={t} showReceive={false} locale={locale} />
        ))}
      </Section>

      {closed.length > 0 ? (
        <Section title={tt(locale, 'tr.sec.closed')} empty="">
          {closed.map((t) => (
            <PlainRow key={t.id} t={t} locale={locale} />
          ))}
        </Section>
      ) : null}
    </div>
  )
}

'use client'

// app/(dashboard)/us-orders/us-orders-view.tsx
// US dropship orders admin (Phase 4). Owner only.
// List + detail, fulfilment stages, and ledger posting (sale income + supplier cost).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  usd,
  shortId,
  usOrderProfit,
  US_STATUS_LABEL,
  type UsOrder,
  type UsOrderStatus,
  type MoneyAccountOption,
  type AccountCategoryOption,
} from '@/lib/us-orders'
import {
  advanceUsOrderStage,
  saveUsOrderNotes,
  deleteUsOrder,
  postUsOrderIncome,
  reverseUsOrderIncome,
  postUsOrderSupplierCost,
  reverseUsOrderSupplierCost,
} from './actions'

const NAVY = '#0A2A66'
const RED = '#CE1126'

const NEXT_STAGE: Partial<Record<UsOrderStatus, UsOrderStatus>> = {
  paid: 'forwarded',
  forwarded: 'shipped',
  shipped: 'completed',
}
const NEXT_STAGE_LABEL: Partial<Record<UsOrderStatus, string>> = {
  paid: 'Mark forwarded to supplier',
  forwarded: 'Mark shipped',
  shipped: 'Mark completed',
}

function statusColor(s: UsOrderStatus): string {
  switch (s) {
    case 'paid': return '#1f7a3d'
    case 'forwarded': return '#9a6a00'
    case 'shipped': return '#1a4a8a'
    case 'completed': return '#3a3a3a'
    case 'cancelled': return '#9b1c1c'
    default: return '#6b7280' // pending
  }
}

export function UsOrdersView({
  orders,
  moneyAccounts,
  incomeCategories,
  expenseCategories,
}: {
  orders: UsOrder[]
  moneyAccounts: MoneyAccountOption[]
  incomeCategories: AccountCategoryOption[]
  expenseCategories: AccountCategoryOption[]
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(orders[0]?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = orders.find((o) => o.id === selectedId) ?? null

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    setBusy(true)
    const r = await fn()
    setBusy(false)
    if (!r.ok) {
      setError(r.error || 'Something went wrong')
      return
    }
    router.refresh()
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: NAVY, marginBottom: 4 }}>
        US Orders
      </h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 18 }}>
        Dropship orders from the US shop. Forward to the supplier, then post the sale income
        and supplier cost to the books.
      </p>

      {error && (
        <div style={{ background: '#fde8e8', color: '#9b1c1c', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 14 }}>
          {error}
        </div>
      )}

      {orders.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No US orders yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 18, alignItems: 'start' }}>
          {/* List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orders.map((o) => {
              const isSel = o.id === selectedId
              return (
                <button
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid ' + (isSel ? NAVY : '#e5e7eb'),
                    background: isSel ? '#f0f4ff' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{o.customerName}</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: NAVY }}>{usd(o.totalUsd)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>#{shortId(o.id)}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: statusColor(o.status) }}>
                      {US_STATUS_LABEL[o.status]}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Detail */}
          {selected && (
            <OrderDetail
              key={selected.id}
              order={selected}
              moneyAccounts={moneyAccounts}
              incomeCategories={incomeCategories}
              expenseCategories={expenseCategories}
              busy={busy}
              run={run}
            />
          )}
        </div>
      )}
    </div>
  )
}

function OrderDetail({
  order,
  moneyAccounts,
  incomeCategories,
  expenseCategories,
  busy,
  run,
}: {
  order: UsOrder
  moneyAccounts: MoneyAccountOption[]
  incomeCategories: AccountCategoryOption[]
  expenseCategories: AccountCategoryOption[]
  busy: boolean
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>
}) {
  const [showIncome, setShowIncome] = useState(false)
  const [showSupplier, setShowSupplier] = useState(false)
  const [notes, setNotes] = useState(order.internalNotes ?? '')

  const profit = usOrderProfit(order)
  const next = NEXT_STAGE[order.status]
  const nextLabel = NEXT_STAGE_LABEL[order.status]
  const addr = [
    order.shipLine1,
    order.shipLine2,
    order.shipCity + ', ' + order.shipState + ' ' + order.shipZip,
    order.shipCountry,
  ].filter(Boolean).join('\n')

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, marginBottom: 14,
  }
  const h: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, padding: '3px 0' }

  return (
    <div>
      {/* Header */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{order.customerName}</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              #{shortId(order.id)} - {new Date(order.createdAt).toLocaleString()}
            </div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: statusColor(order.status) }}>
            {US_STATUS_LABEL[order.status]}
          </span>
        </div>
        <div style={{ marginTop: 10, fontSize: 14 }}>
          <div>{order.customerEmail}</div>
          {order.customerPhone ? <div>{order.customerPhone}</div> : null}
        </div>
      </div>

      {/* Shipping */}
      <div style={card}>
        <div style={h}>Ship to</div>
        <div style={{ whiteSpace: 'pre-line', fontSize: 14 }}>{addr}</div>
      </div>

      {/* Items */}
      <div style={card}>
        <div style={h}>Items</div>
        {order.items.map((it, i) => (
          <div key={i} style={row}>
            <span>{it.qty} x {it.name}</span>
            <span style={{ fontWeight: 600 }}>{usd(it.price_usd * it.qty)}</span>
          </div>
        ))}
        <div style={{ ...row, borderTop: '1px solid #eee', marginTop: 6, paddingTop: 8, fontWeight: 700 }}>
          <span>Total (free shipping, no tax)</span>
          <span style={{ color: NAVY }}>{usd(order.totalUsd)}</span>
        </div>
      </div>

      {/* Money / books */}
      <div style={card}>
        <div style={h}>Accounting</div>
        <div style={row}>
          <span>Payment</span>
          <span>{order.paymentMethod ? order.paymentMethod + (order.paymentRef ? ' (' + order.paymentRef.slice(0, 12) + '...)' : '') : 'not paid online'}</span>
        </div>
        <div style={row}>
          <span>Sale income posted</span>
          <span style={{ fontWeight: 600 }}>{order.incomeTransactionId ? 'Yes - ' + usd(order.totalUsd) : 'No'}</span>
        </div>
        <div style={row}>
          <span>Supplier cost posted</span>
          <span style={{ fontWeight: 600 }}>{order.supplierTransactionId ? 'Yes - ' + usd(order.supplierCostUsd) : 'No'}</span>
        </div>
        {profit != null && (
          <div style={{ ...row, fontWeight: 700, color: profit >= 0 ? '#1f7a3d' : '#9b1c1c' }}>
            <span>Profit</span>
            <span>{usd(profit)}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {!order.incomeTransactionId ? (
            <button disabled={busy} onClick={() => setShowIncome((v) => !v)}
              style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: NAVY, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Post sale income
            </button>
          ) : (
            <button disabled={busy} onClick={() => run(() => reverseUsOrderIncome(order.id))}
              style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid #9b1c1c', background: '#fff', color: '#9b1c1c', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Reverse income
            </button>
          )}
          {!order.supplierTransactionId ? (
            <button disabled={busy} onClick={() => setShowSupplier((v) => !v)}
              style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid ' + NAVY, background: '#fff', color: NAVY, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Record supplier cost
            </button>
          ) : (
            <button disabled={busy} onClick={() => run(() => reverseUsOrderSupplierCost(order.id))}
              style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid #9b1c1c', background: '#fff', color: '#9b1c1c', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Reverse supplier cost
            </button>
          )}
        </div>

        {showIncome && !order.incomeTransactionId && (
          <PostMoneyForm
            kind="income"
            fixedAmount={order.totalUsd}
            accounts={moneyAccounts}
            categories={incomeCategories}
            busy={busy}
            onCancel={() => setShowIncome(false)}
            onSubmit={(accId, catId) =>
              run(() => postUsOrderIncome({ orderId: order.id, moneyAccountId: accId, categoryId: catId }))
            }
          />
        )}
        {showSupplier && !order.supplierTransactionId && (
          <PostMoneyForm
            kind="supplier"
            accounts={moneyAccounts}
            categories={expenseCategories}
            busy={busy}
            onCancel={() => setShowSupplier(false)}
            onSubmit={(accId, catId, amount, note) =>
              run(() => postUsOrderSupplierCost({ orderId: order.id, amountUsd: amount ?? 0, moneyAccountId: accId, categoryId: catId, note }))
            }
          />
        )}
      </div>

      {/* Fulfilment */}
      <div style={card}>
        <div style={h}>Fulfilment</div>
        {next && nextLabel ? (
          <button disabled={busy} onClick={() => run(() => advanceUsOrderStage(order.id, next))}
            style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: RED, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            {nextLabel}
          </button>
        ) : (
          <div style={{ fontSize: 14, color: '#6b7280' }}>
            {order.status === 'pending' ? 'Waiting for payment.' : 'No further stage.'}
          </div>
        )}
      </div>

      {/* Notes + delete */}
      <div style={card}>
        <div style={h}>Internal notes</div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d7dbe3', fontSize: 14 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <button disabled={busy} onClick={() => run(() => saveUsOrderNotes(order.id, notes))}
            style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid ' + NAVY, background: '#fff', color: NAVY, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Save notes
          </button>
          <button disabled={busy}
            onClick={() => { if (confirm('Delete this US order? This cannot be undone.')) run(() => deleteUsOrder(order.id)) }}
            style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid #9b1c1c', background: '#fff', color: '#9b1c1c', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Delete order
          </button>
        </div>
      </div>
    </div>
  )
}

function PostMoneyForm({
  kind,
  fixedAmount,
  accounts,
  categories,
  busy,
  onCancel,
  onSubmit,
}: {
  kind: 'income' | 'supplier'
  fixedAmount?: number
  accounts: MoneyAccountOption[]
  categories: AccountCategoryOption[]
  busy: boolean
  onCancel: () => void
  onSubmit: (accountId: string, categoryId: string, amountUsd?: number, note?: string) => void
}) {
  const [accId, setAccId] = useState('')
  const [catId, setCatId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const sel: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #d7dbe3', fontSize: 14, marginTop: 4, background: '#fff' }
  const lab: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: NAVY, display: 'block', marginTop: 10 }

  const canSubmit =
    accId && catId && (kind === 'income' || (parseFloat(amount) > 0))

  return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: '#f7f8fa', border: '1px solid #e5e7eb' }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>
        {kind === 'income' ? 'Post sale income' : 'Record supplier cost'}
      </div>

      {kind === 'income' ? (
        <div style={{ fontSize: 14, marginTop: 6 }}>
          Amount: <strong>{usd(fixedAmount)}</strong> (the order total)
        </div>
      ) : (
        <>
          <label style={lab}>Amount you paid the supplier (USD)</label>
          <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 38.50" style={sel} />
        </>
      )}

      <label style={lab}>Money account</label>
      <select value={accId} onChange={(e) => setAccId(e.target.value)} style={sel}>
        <option value="">Select an account...</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
        ))}
      </select>

      <label style={lab}>{kind === 'income' ? 'Income category' : 'Expense category'}</label>
      <select value={catId} onChange={(e) => setCatId(e.target.value)} style={sel}>
        <option value="">Select a category...</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name} ({c.scope})</option>
        ))}
      </select>

      {kind === 'supplier' && (
        <>
          <label style={lab}>Note (optional)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} style={sel} />
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button disabled={busy || !canSubmit}
          onClick={() => onSubmit(accId, catId, kind === 'supplier' ? parseFloat(amount) : undefined, note)}
          style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: NAVY, color: '#fff', fontWeight: 600, fontSize: 13, cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5 }}>
          Post to books
        </button>
        <button disabled={busy} onClick={onCancel}
          style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid #d7dbe3', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

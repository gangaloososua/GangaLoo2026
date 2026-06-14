import Link from 'next/link'
import { getUsOrderForThanks } from '../actions'

export const dynamic = 'force-dynamic'

// US checkout thank-you page. Reached after:
//   - Stripe success  (?order=...)  -> order already 'paid' via webhook
//   - PayPal capture  (?order=...)  -> order already 'paid' via paypal-return
//   - Bank deposit    (?order=...)  -> order still 'pending'; show pay-by-deposit info
export default async function UsGraciasPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>
}) {
  const sp = await searchParams
  const orderId = sp.order ?? ''
  const info = orderId ? await getUsOrderForThanks(orderId) : { ok: false as const }

  const isPaid = info.ok && info.status === 'paid'
  const isDeposit = info.ok && !isPaid // pending => awaiting bank deposit
  const shortId = info.ok ? info.orderId.slice(0, 8).toUpperCase() : ''
  const totalLabel = info.ok
    ? `US$ ${info.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : ''

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#0A2A66',
        color: '#f0f4ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 16,
          padding: '32px 28px',
        }}
      >
        <div style={{ height: 6, background: '#CE1126', borderRadius: 4, marginBottom: 24 }} />

        {!info.ok && (
          <>
            <h1 style={{ fontSize: 24, margin: '0 0 12px' }}>Order not found</h1>
            <p style={{ opacity: 0.8, lineHeight: 1.5 }}>
              We couldn&apos;t find that order. If you just paid, give it a moment and refresh,
              or contact us and we&apos;ll sort it out.
            </p>
          </>
        )}

        {isPaid && (
          <>
            <h1 style={{ fontSize: 26, margin: '0 0 8px' }}>Payment received — thank you!</h1>
            <p style={{ opacity: 0.85, lineHeight: 1.5, margin: '0 0 20px' }}>
              Your order is confirmed. We&apos;ll get it on its way to you and email any updates.
            </p>
            <SummaryBox label="Order #" value={shortId} total={totalLabel} />
          </>
        )}

        {isDeposit && (
          <>
            <h1 style={{ fontSize: 26, margin: '0 0 8px' }}>Order placed — pending deposit</h1>
            <p style={{ opacity: 0.85, lineHeight: 1.5, margin: '0 0 20px' }}>
              Your order is reserved. To complete it, please make your bank deposit using the
              details below and include your order number. We&apos;ll confirm once it arrives.
            </p>
            <SummaryBox label="Order #" value={shortId} total={totalLabel} />

            {/* ====================================================================
                PLACEHOLDER — replace with the real DR bank deposit details.
                ==================================================================== */}
            <div
              style={{
                marginTop: 18,
                padding: '16px 18px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 12,
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6, color: '#ffd24a' }}>
                Bank deposit details
              </div>
              <div>Bank: [BANK NAME]</div>
              <div>Account name: [ACCOUNT NAME]</div>
              <div>Account #: [ACCOUNT NUMBER]</div>
              <div>Type: [SAVINGS / CHECKING]</div>
              <div style={{ marginTop: 8, fontSize: 14, opacity: 0.8 }}>
                Reference: order <strong>{shortId}</strong>
              </div>
            </div>
            {/* ==================================================================== */}
          </>
        )}

        <div style={{ marginTop: 28 }}>
          <Link
            href="/us"
            style={{
              display: 'inline-block',
              padding: '12px 22px',
              background: '#CE1126',
              color: '#fff',
              borderRadius: 10,
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Back to shop
          </Link>
        </div>
      </div>
    </main>
  )
}

function SummaryBox({ label, value, total }: { label: string; value: string; total: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 16px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 12,
      }}
    >
      <span style={{ opacity: 0.8 }}>
        {label} <strong style={{ color: '#fff' }}>{value}</strong>
      </span>
      <span style={{ fontWeight: 700 }}>{total}</span>
    </div>
  )
}

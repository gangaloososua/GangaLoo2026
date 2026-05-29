import { createAdminClient } from '@/lib/supabase/admin'

// Where Stripe sends the customer back after a successful payment. Reads the
// order by its invoice number and shows whether it's confirmed yet. (The webhook
// may take a second or two to mark it paid, so we show a "confirming" state too.)
export const dynamic = 'force-dynamic'

const NAVY = '#0A2A66'
const RED = '#CE1126'
const MUTED = '#6b7280'

function fmtDOP(cents: number): string {
  return 'RD$' + Math.round(cents / 100).toLocaleString('es-DO')
}

export default async function GraciasPage({
  params,
  searchParams,
}: {
  params: Promise<{ warehouse: string }>
  searchParams: Promise<{ inv?: string }>
}) {
  const { warehouse } = await params
  const { inv } = await searchParams

  let status: string | null = null
  let amount = 0
  if (inv) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('sales')
      .select('status, total_cents, payment_fee_cents')
      .eq('invoice_number', inv)
      .maybeSingle()
    if (data) {
      status = String(data.status)
      amount = (data.total_cents ?? 0) + (data.payment_fee_cents ?? 0)
    }
  }

  const paid = status === 'paid'

  return (
    <div style={{ background: '#f7f8fa', minHeight: '100vh', padding: 24 }}>
      <div
        style={{
          maxWidth: 520,
          margin: '40px auto',
          background: '#fff',
          borderRadius: 16,
          padding: 28,
          textAlign: 'center',
          border: '1px solid #eceef2',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: paid ? '#1d9e75' : '#e6a700',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            fontSize: 26,
          }}
        >
          {paid ? '\u2713' : '\u2026'}
        </div>
        <h1 style={{ color: NAVY, fontSize: 22, fontWeight: 600 }}>
          {paid ? '\u00a1Pago confirmado!' : 'Procesando tu pago'}
        </h1>
        {inv && (
          <p style={{ color: RED, fontSize: 20, fontWeight: 600, marginTop: 6 }}>{inv}</p>
        )}
        <p style={{ color: MUTED, marginTop: 8, fontSize: 14 }}>
          {paid
            ? 'Gracias por tu compra. Hemos recibido tu pago y tu pedido est\u00e1 confirmado.'
            : 'Estamos confirmando tu pago. Esto puede tardar unos segundos \u2014 puedes actualizar esta p\u00e1gina.'}
        </p>
        {amount > 0 && (
          <p style={{ color: NAVY, marginTop: 10, fontSize: 15 }}>
            Total: <b>{fmtDOP(amount)}</b>
          </p>
        )}
        <a
          href={`/tienda/${warehouse}`}
          style={{
            display: 'inline-block',
            marginTop: 18,
            background: NAVY,
            color: '#fff',
            borderRadius: 10,
            padding: '10px 18px',
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          Volver a la tienda
        </a>
      </div>
    </div>
  )
}

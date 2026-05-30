'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAVY = '#0A2A66'
const RED = '#CE1126'
const MUTED = '#6b7280'

function fmtDOP(cents: number): string {
  return 'RD$' + Math.round(cents / 100).toLocaleString('es-DO')
}

type OrderStatus = {
  ok?: boolean
  status?: string
  invoice_number?: string
  amount_cents?: number
}

export function GraciasStatus({ inv, warehouse }: { inv: string; warehouse: string }) {
  const [status, setStatus] = useState<string | null>(null)
  const [amount, setAmount] = useState(0)
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    if (!inv) {
      setGaveUp(true)
      return
    }
    let active = true
    let tries = 0
    const supabase = createClient()

    const poll = async (): Promise<boolean> => {
      tries += 1
      try {
        const { data } = await supabase.rpc('get_online_order_status_by_invoice', {
          p_invoice: inv,
        })
        const r = data as OrderStatus | null
        if (r?.ok && active) {
          setStatus(String(r.status))
          setAmount(r.amount_cents ?? 0)
          if (r.status === 'paid') return true
        }
      } catch {
        // ignore and retry
      }
      return false
    }

    ;(async () => {
      // Re-check every 2s for up to ~40s, then stop.
      while (active && tries < 20) {
        const done = await poll()
        if (done) return
        await new Promise((res) => setTimeout(res, 2000))
      }
      if (active) setGaveUp(true)
    })()

    return () => {
      active = false
    }
  }, [inv])

  const paid = status === 'paid'
  const stillWaiting = !paid && !gaveUp

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
            : stillWaiting
              ? 'Estamos confirmando tu pago\u2026 esto toma solo unos segundos.'
              : 'Tu pago se est\u00e1 procesando. Si ya pagaste, tu pedido quedar\u00e1 confirmado en breve; cualquier duda, escr\u00edbenos.'}
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

// app/encargo/[id]/page.tsx
// PUBLIC page a customer opens from the WhatsApp link. No login. It reads only
// the whitelisted fields exposed by get_service_order_public (no phone, no
// internal notes, no individual payments).

import { createClient } from '@/lib/supabase/server'
import { EncargoClient } from './encargo-client'
import { type PublicOrder } from './actions'

export const dynamic = 'force-dynamic'

export default async function EncargoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let order: PublicOrder | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.rpc('get_service_order_public', { p_id: id })
    if (data) order = data as PublicOrder
  } catch {
    order = null
  }

  if (!order) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="text-4xl">🔍</div>
          <h1 className="mt-3 text-xl font-semibold text-neutral-900">
            No encontramos este pedido
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            El enlace puede haber expirado o ser incorrecto. Escríbenos por WhatsApp y con
            gusto te ayudamos.
          </p>
        </div>
      </main>
    )
  }

  return <EncargoClient order={order} />
}

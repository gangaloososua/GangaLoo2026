// Full-page "store temporarily closed" notice (2026-10-30). Shown instead of
// the store page, product pages, cart and checkout of a store listed in
// lib/store/closures.ts. Bilingual (Spanish first), no client JS needed.
import Link from 'next/link'
import { listStoreWarehouses } from '@/lib/store/catalog'
import { closureFor, whatsappHref, prettyPhone } from '@/lib/store/closures'

const NAVY = '#0A2A66'
const RED = '#CE1126'
const INK = '#16181d'
const MUTED = '#6b7280'
const WA_GREEN = '#1fa855'

export async function ClosedStoreNotice({ slug }: { slug: string }) {
  const closure = closureFor(slug)
  const stores = await listStoreWarehouses()
  const closed = stores.find((s) => s.slug === slug)
  const open = stores.find((s) => s.slug === closure?.redirectSlug) ?? null
  const closedName = closed?.name ?? slug
  const openName = open?.name ?? 'Montellano'
  const openSlug = open?.slug ?? closure?.redirectSlug ?? 'montellano'
  const wa = whatsappHref(
    open?.whatsapp,
    `Hola, vengo de la tienda online. La tienda ${closedName} está cerrada, me gustaría comprar en ${openName}.`,
  )

  return (
    <div style={{ background: '#f7f8fa', color: INK, minHeight: '100vh' }}>
      <header style={{ background: NAVY, color: '#fff' }}>
        <div className="mx-auto flex w-full max-w-[640px] items-center justify-between px-4 py-3">
          <Link href="/tienda" className="text-[20px] font-semibold tracking-wide">GangaLoo</Link>
        </div>
        <div className="flex h-1">
          <div className="flex-1" style={{ background: NAVY }} />
          <div className="flex-1 bg-white" />
          <div className="flex-1" style={{ background: RED }} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[640px] px-4 py-10">
        <div className="overflow-hidden rounded-2xl bg-white" style={{ border: '1px solid #eceef2' }}>
          <div className="px-6 pb-6 pt-8 text-center">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-[26px]"
              style={{ background: '#fdecee' }}
              aria-hidden="true"
            >
              🔒
            </div>
            <h1 className="text-[22px] font-semibold leading-tight sm:text-[26px]" style={{ color: NAVY }}>
              La tienda {closedName} está cerrada temporalmente
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: MUTED }}>
              Our {closedName} store is temporarily closed.
            </p>
            <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed">
              Te atendemos con gusto en nuestra tienda <strong>{openName}</strong>: compra en línea o
              escríbenos por WhatsApp.
            </p>
            <p className="mt-1 text-[12px]" style={{ color: MUTED }}>
              We&apos;re happy to serve you at our {openName} store: shop online or message us on WhatsApp.
            </p>
          </div>

          <div className="flex flex-col gap-3 border-t px-6 py-6" style={{ borderColor: '#eceef2' }}>
            <Link
              href={`/tienda/${openSlug}`}
              className="block w-full rounded-full px-6 py-3 text-center text-[15px] font-semibold text-white transition active:scale-[.98]"
              style={{ background: RED }}
            >
              Ir a la tienda {openName} →
            </Link>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold text-white transition active:scale-[.98]"
              style={{ background: WA_GREEN }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4 5.1 5.1 0 0 0 3.2.7 2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z" />
              </svg>
              WhatsApp {openName}
            </a>
            <p className="text-center text-[13px]" style={{ color: MUTED }}>
              {prettyPhone(open?.whatsapp)}
              {open?.address ? ` · ${open.address}${open.city ? `, ${open.city}` : ''}` : ''}
            </p>
            {open?.mapsUrl ? (
              <a
                href={open.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-center text-[13px] font-semibold underline"
                style={{ color: NAVY }}
              >
                Ver ubicación de {openName} / Map
              </a>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  )
}

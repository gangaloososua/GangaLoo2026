'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDOP } from '@/lib/format'
import { ts, type Locale } from '@/lib/i18n/shop'
import { useCart } from '@/lib/store/cart'

const NAVY = '#0A2A66'
const RED = '#CE1126'
const INK = '#16181d'
const MUTED = '#6b7280'

function price(cents: number) {
  return formatDOP(cents, { decimals: 0 })
}

// A line is at its cap when its known stock (maxQty) is reached. Lines added
// before maxQty existed have no cap, so they're never "at max".
function atMax(item: { qty: number; maxQty?: number }): boolean {
  return typeof item.maxQty === 'number' && item.maxQty > 0 && item.qty >= item.maxQty
}

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const ICON = {
  back: 'M15 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13',
  bag: 'M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2',
}

export function CartView({
  warehouseSlug,
  warehouseName,
}: {
  warehouseSlug: string
  warehouseName: string
}) {
  const [locale, setLocale] = useState<Locale>('es')
  const cart = useCart(warehouseSlug)
  const storeHref = `/tienda/${warehouseSlug}`

  return (
    <div style={{ background: '#f7f8fa', color: INK, minHeight: '100vh', paddingBottom: 24 }}>
      <header className="sticky top-0 z-30" style={{ background: NAVY, color: '#fff' }}>
        <div className="mx-auto flex w-full max-w-[900px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href={storeHref} aria-label={ts(locale, 'shop.back')} className="opacity-90"><Icon d={ICON.back} /></Link>
            <span className="text-[19px] font-semibold tracking-wide">GangaLoo</span>
          </div>
          <div className="flex overflow-hidden rounded-full text-[11px]" style={{ border: '1px solid rgba(255,255,255,.5)' }}>
            <button onClick={() => setLocale('es')} className="px-2.5 py-1 transition" style={locale === 'es' ? { background: '#fff', color: NAVY } : { color: '#cdd8ee' }}>ES</button>
            <button onClick={() => setLocale('en')} className="px-2.5 py-1 transition" style={locale === 'en' ? { background: '#fff', color: NAVY } : { color: '#cdd8ee' }}>EN</button>
          </div>
        </div>
        <div className="flex h-1">
          <div className="flex-1" style={{ background: NAVY }} />
          <div className="flex-1 bg-white" />
          <div className="flex-1" style={{ background: RED }} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[900px] px-4 py-6">
        <div className="mb-4 flex items-baseline gap-2">
          <h1 className="text-[22px] font-semibold" style={{ color: NAVY }}>{ts(locale, 'shop.cartTitle')}</h1>
          <span className="text-[13px]" style={{ color: MUTED }}>Â· {warehouseName}</span>
        </div>

        {cart.items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div style={{ color: '#c2c8d2' }}><Icon d={ICON.bag} size={48} /></div>
            <p className="text-[15px]" style={{ color: MUTED }}>{ts(locale, 'shop.cartEmpty')}</p>
            <Link href={storeHref} className="rounded-full px-6 py-2.5 text-[13px] font-semibold text-white" style={{ background: RED }}>{ts(locale, 'shop.keepShopping')}</Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {cart.items.map((item) => (
                <div key={item.id} className="flex gap-3 rounded-2xl bg-white p-3" style={{ border: '1px solid #eceef2' }}>
                  <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg" style={{ background: '#fff', border: '1px solid #eceef2' }}>
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center" style={{ color: '#c2c8d2', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 24 }}>G</div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`${storeHref}/${item.slug}`} className="text-[13px] leading-snug" style={{ color: INK }}>{item.name}</Link>
                      <button onClick={() => cart.remove(item.id)} aria-label={ts(locale, 'shop.remove')} style={{ color: '#aab2bf' }}><Icon d={ICON.trash} size={18} /></button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center rounded-full" style={{ border: '1px solid #d7dde6' }}>
                        <button onClick={() => cart.setQty(item.id, item.qty - 1)} className="flex h-8 w-8 items-center justify-center" aria-label="-" style={{ color: NAVY }}><Icon d={ICON.minus} size={16} /></button>
                        <span className="w-7 text-center text-[14px] font-medium">{item.qty}</span>
                        <button onClick={() => cart.setQty(item.id, item.qty + 1)} disabled={atMax(item)} className="flex h-8 w-8 items-center justify-center disabled:opacity-40" aria-label="+" style={{ color: NAVY }}><Icon d={ICON.plus} size={16} /></button>
                      </div>
                      <span className="text-[15px] font-semibold" style={{ color: NAVY }}>{price(item.priceCents * item.qty)}</span>
                    </div>
                    {atMax(item) && typeof item.maxQty === 'number' && (
                      <p className="mt-1 text-right text-[11px]" style={{ color: MUTED }}>
                        {locale === 'es' ? `Solo ${item.maxQty} disponible${item.maxQty === 1 ? '' : 's'}` : `Only ${item.maxQty} in stock`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl bg-white p-4" style={{ border: '1px solid #eceef2' }}>
              <div className="flex items-center justify-between">
                <span className="text-[15px]" style={{ color: MUTED }}>{ts(locale, 'shop.subtotal')}</span>
                <span className="text-[20px] font-semibold" style={{ color: NAVY }}>{price(cart.subtotalCents)}</span>
              </div>
              <Link href={`${storeHref}/checkout`} className="mt-4 block w-full rounded-full px-6 py-3 text-center text-[14px] font-semibold text-white transition active:scale-95" style={{ background: RED }}>
                {ts(locale, 'shop.checkout')}
              </Link>
              <Link href={storeHref} className="mt-3 block text-center text-[13px]" style={{ color: NAVY }}>{ts(locale, 'shop.keepShopping')}</Link>
            </div>
          </>
        )}
      </main>
    </div>
  )
}


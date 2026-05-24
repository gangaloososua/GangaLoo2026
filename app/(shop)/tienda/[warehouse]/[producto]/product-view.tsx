'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDOP } from '@/lib/format'
import { ts, type Locale } from '@/lib/i18n/shop'
import { useCart } from '@/lib/store/cart'
import type { StoreWarehouse } from '@/lib/store/catalog'
import type { StoreProductDetail } from '@/lib/store/product'

const NAVY = '#0A2A66'
const RED = '#CE1126'
const INK = '#16181d'
const MUTED = '#6b7280'

function price(cents: number) {
  return formatDOP(cents, { decimals: 0 })
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
  cart: 'M6 6h15l-1.5 9h-12zM6 6L5 3H2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12l4 4 10-10',
}

export function ProductView({
  warehouse,
  product,
}: {
  warehouse: StoreWarehouse
  product: StoreProductDetail
}) {
  const [locale, setLocale] = useState<Locale>('es')
  const [active, setActive] = useState(0)
  const [qty, setQty] = useState(1)
  const [bump, setBump] = useState(false)
  const cart = useCart(warehouse.slug)

  const out = product.stock <= 0
  const mainImage = product.images[active]?.url ?? null
  const cartHref = `/tienda/${warehouse.slug}/carrito`

  const addToCart = () => {
    cart.add(
      warehouse.slug,
      { id: product.id, slug: product.slug, name: product.name, imageUrl: product.images[0]?.url ?? null, priceCents: product.priceCents },
      qty,
    )
    setBump(true)
    window.setTimeout(() => setBump(false), 350)
  }

  return (
    <div style={{ background: '#f7f8fa', color: INK, minHeight: '100vh' }}>
      <style>{`@keyframes glpop{0%{transform:scale(1)}50%{transform:scale(1.3)}100%{transform:scale(1)}}.gl-pop{animation:glpop .35s ease}`}</style>

      <header className="sticky top-0 z-30" style={{ background: NAVY, color: '#fff' }}>
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href={`/tienda/${warehouse.slug}`} aria-label={ts(locale, 'shop.back')} className="opacity-90"><Icon d={ICON.back} /></Link>
            <span className="text-[19px] font-semibold tracking-wide">GangaLoo</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex overflow-hidden rounded-full text-[11px]" style={{ border: '1px solid rgba(255,255,255,.5)' }}>
              <button onClick={() => setLocale('es')} className="px-2.5 py-1 transition" style={locale === 'es' ? { background: '#fff', color: NAVY } : { color: '#cdd8ee' }}>ES</button>
              <button onClick={() => setLocale('en')} className="px-2.5 py-1 transition" style={locale === 'en' ? { background: '#fff', color: NAVY } : { color: '#cdd8ee' }}>EN</button>
            </div>
            <Link href={cartHref} aria-label={ts(locale, 'shop.nav.cart')} className="relative">
              <Icon d={ICON.cart} />
              <span className={`absolute -right-2 -top-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ${bump ? 'gl-pop' : ''}`} style={{ background: RED }}>{cart.count}</span>
            </Link>
          </div>
        </div>
        <div className="flex h-1">
          <div className="flex-1" style={{ background: NAVY }} />
          <div className="flex-1 bg-white" />
          <div className="flex-1" style={{ background: RED }} />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-8 px-4 py-6 lg:grid-cols-2">
        <div>
          <div className="overflow-hidden rounded-2xl" style={{ aspectRatio: '4 / 5', background: '#ffffff', border: '1px solid #eceef2' }}>
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainImage} alt={product.name} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full w-full items-center justify-center" style={{ color: '#c2c8d2' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 64, fontStyle: 'italic' }}>G</span>
              </div>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {product.images.map((img, i) => (
                <button key={i} onClick={() => setActive(i)} className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg" style={{ border: i === active ? `2px solid ${NAVY}` : '1px solid #d7dde6', background: '#fff' }} aria-label={`image ${i + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt ?? product.name} className="h-full w-full object-contain" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {product.category && (
            <p className="mb-1 text-[11px] uppercase tracking-wide" style={{ color: MUTED }}>{product.category.name}</p>
          )}
          <h1 className="text-[24px] leading-tight sm:text-[28px]" style={{ color: INK, fontWeight: 600 }}>{product.name}</h1>
          <p className="mt-1 text-[12px]" style={{ color: MUTED }}>SKU: {product.sku}</p>

          <div className="mt-4 flex items-center gap-3">
            {product.isOffer && (
              <span className="rounded-full px-2 py-1 text-[12px] font-semibold text-white" style={{ background: RED }}>-{product.offerPercent}%</span>
            )}
            <div>
              {product.isOffer && (
                <span className="block text-[13px] line-through" style={{ color: '#9aa3b2' }}>{price(product.basePriceCents)}</span>
              )}
              <span className="text-[26px] font-semibold" style={{ color: product.isOffer ? RED : NAVY }}>{price(product.priceCents)}</span>
            </div>
          </div>

          <p className="mt-3 text-[13px]" style={{ color: out ? RED : '#1d9e75' }}>
            {out ? ts(locale, 'shop.out') : `${ts(locale, 'shop.inStock')}: ${product.stock} ${ts(locale, 'shop.units')}`}
          </p>

          <div className="mt-5 flex items-center gap-3">
            <div className="flex items-center rounded-full" style={{ border: '1px solid #d7dde6' }}>
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={out} className="flex h-10 w-10 items-center justify-center disabled:opacity-40" aria-label="-" style={{ color: NAVY }}><Icon d={ICON.minus} size={18} /></button>
              <span className="w-8 text-center text-[15px] font-medium">{qty}</span>
              <button onClick={() => setQty((q) => Math.min(Math.max(1, product.stock), q + 1))} disabled={out} className="flex h-10 w-10 items-center justify-center disabled:opacity-40" aria-label="+" style={{ color: NAVY }}><Icon d={ICON.plus} size={18} /></button>
            </div>
            <button onClick={addToCart} disabled={out} className="flex flex-1 items-center justify-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold text-white transition active:scale-95 disabled:opacity-40" style={{ background: RED }}>
              {cart.count > 0 ? <Icon d={ICON.check} size={18} /> : null}
              {ts(locale, 'shop.add')}
            </button>
          </div>

          {product.description && (
            <div className="mt-7">
              <h2 className="mb-2 text-[15px] font-semibold" style={{ color: NAVY }}>{ts(locale, 'shop.description')}</h2>
              <p className="whitespace-pre-line text-[14px] leading-relaxed" style={{ color: '#3a4452' }}>{product.description}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

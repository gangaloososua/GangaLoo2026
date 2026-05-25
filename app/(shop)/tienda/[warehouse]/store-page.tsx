'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { formatDOP } from '@/lib/format'
import { ts, type Locale } from '@/lib/i18n/shop'
import { useCart } from '@/lib/store/cart'
import type { StoreCatalog, StoreProduct, StoreDeal, StoreWarehouse } from '@/lib/store/catalog'

const NAVY = '#0A2A66'
const RED = '#CE1126'
const INK = '#16181d'
const MUTED = '#6b7280'
const PAGE = 24

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
  menu: 'M4 6h16M4 12h16M4 18h16',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  cart: 'M6 6h15l-1.5 9h-12zM6 6L5 3H2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  plus: 'M12 5v14M5 12h14',
  warehouse: 'M3 9l9-5 9 5v11H3zM7 20v-6h10v6',
  chevron: 'M6 9l6 6 6-6',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18',
  share: 'M4 12v8h16v-8M12 15V4M8 8l4-4 4 4',
  chat: 'M4 5h16v10H8l-4 4z',
  link: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
}

function ProductCard({
  p,
  locale,
  delay,
  storeSlug,
  onAdd,
  onShare,
}: {
  p: StoreProduct
  locale: Locale
  delay: number
  storeSlug: string
  onAdd: (p: StoreProduct) => void
  onShare: (p: StoreProduct) => void
}) {
  const out = p.stock <= 0
  return (
    <div className="gl-rise relative overflow-hidden rounded-2xl bg-white" style={{ border: '1px solid #eceef2', animationDelay: `${delay}ms` }}>
      <Link href={`/tienda/${storeSlug}/${p.slug}`} className="block">
        <div className="relative" style={{ aspectRatio: '4 / 5', background: '#ffffff' }}>
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt={p.name} className="h-full w-full object-contain" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center" style={{ color: '#c2c8d2' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontStyle: 'italic' }}>G</span>
            </div>
          )}
          {p.isOffer && (
            <span className="absolute left-2 top-2 rounded-full px-2 py-1 text-[11px] font-semibold text-white" style={{ background: RED }}>-{p.offerPercent}%</span>
          )}
          {out && (
            <span className="absolute right-2 top-2 rounded-full px-2 py-1 text-[11px] font-medium" style={{ background: 'rgba(22,24,29,.78)', color: '#fff' }}>{ts(locale, 'shop.out')}</span>
          )}
        </div>

        <div className="p-3 pr-12">
          {p.category && (
            <p className="mb-1 text-[11px] uppercase tracking-wide" style={{ color: MUTED }}>{p.category.name}</p>
          )}
          <p className="mb-2 text-[13px] leading-snug" style={{ color: INK, minHeight: 34 }}>{p.name}</p>
          <div>
            {p.isOffer && (
              <span className="block text-[11px] line-through" style={{ color: '#9aa3b2' }}>{price(p.basePriceCents)}</span>
            )}
            <span className="text-[15px] font-semibold" style={{ color: p.isOffer ? RED : NAVY }}>{price(p.priceCents)}</span>
          </div>
        </div>
      </Link>

      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShare(p) }}
        aria-label={locale === 'es' ? 'Compartir' : 'Share'}
        className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full bg-white transition active:scale-95"
        style={{ border: '1px solid #eceef2', color: NAVY }}
      >
        <Icon d={ICON.share} size={15} />
      </button>

      <button
        type="button"
        onClick={() => onAdd(p)}
        disabled={out}
        aria-label={ts(locale, 'shop.add')}
        className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full text-white transition active:scale-95 disabled:opacity-40"
        style={{ background: NAVY }}
      >
        <Icon d={ICON.plus} size={18} />
      </button>
    </div>
  )
}

const DEAL_T = {
  es: { daily: 'Oferta del Día', weekly: 'Oferta de la Semana', endsIn: 'Termina en' },
  en: { daily: 'Deal of the Day', weekly: 'Deal of the Week', endsIn: 'Ends in' },
} as const

const MENU_T = {
  es: { home: 'Inicio', account: 'Mi cuenta', cart: 'Carrito', stores: 'Todas las tiendas', browse: 'Explorar por categoría', lang: 'Idioma' },
  en: { home: 'Home', account: 'My account', cart: 'Cart', stores: 'All stores', browse: 'Browse by category', lang: 'Language' },
} as const

function Countdown({ endsAt, onExpire, locale, accent }: { endsAt: string; onExpire: () => void; locale: Locale; accent: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => {
      setNow(Date.now())
      if (new Date(endsAt).getTime() - Date.now() <= 0) onExpire()
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [endsAt, onExpire])

  let text = ''
  if (now != null) {
    const s = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000))
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    const x = s % 60
    const pad = (n: number) => (n < 10 ? '0' : '') + n
    text = d > 0 ? `${d}d ${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(x)}`
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold text-white" style={{ background: accent }}>
      <Icon d={ICON.clock} size={14} />
      <span>{DEAL_T[locale].endsIn} {text}</span>
    </span>
  )
}

function DealSection({ deal, locale, storeSlug, onAdd, onShare }: { deal: StoreDeal; locale: Locale; storeSlug: string; onAdd: (p: StoreProduct) => void; onShare: (p: StoreProduct) => void }) {
  const [hidden, setHidden] = useState(false)
  const onExpire = useCallback(() => setHidden(true), [])
  if (hidden || deal.products.length === 0) return null
  const accent = deal.slot === 'daily' ? RED : NAVY
  return (
    <section className="mx-auto w-full max-w-[1100px] px-4 pb-7">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-[16px] font-semibold" style={{ color: NAVY }}>{DEAL_T[locale][deal.slot]}</h2>
        {deal.endsAt && <Countdown endsAt={deal.endsAt} onExpire={onExpire} locale={locale} accent={accent} />}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {deal.products.slice(0, 8).map((p, i) => (
          <ProductCard key={p.id} p={p} locale={locale} delay={i * 35} storeSlug={storeSlug} onAdd={onAdd} onShare={onShare} />
        ))}
      </div>
    </section>
  )
}

export function StorePage({ catalog, stores = [] }: { catalog: StoreCatalog; stores?: StoreWarehouse[] }) {
  const [locale, setLocale] = useState<Locale>('es')
  const [activeCat, setActiveCat] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE)
  const [bump, setBump] = useState(false)
  const [storeMenu, setStoreMenu] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [shareProduct, setShareProduct] = useState<StoreProduct | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  const { warehouse, products, offers, categories, dailyDeal, weeklyDeal } = catalog
  const cart = useCart(warehouse.slug)

  const handleAdd = (p: StoreProduct) => {
    cart.add(warehouse.slug, { id: p.id, slug: p.slug, name: p.name, imageUrl: p.imageUrl, priceCents: p.priceCents })
    setBump(true)
    window.setTimeout(() => setBump(false), 350)
  }

  const productUrl = (p: StoreProduct) =>
    `${window.location.origin}/tienda/${warehouse.slug}/${p.slug}`
  const shareMsg = (p: StoreProduct) => `${p.name} · ${price(p.priceCents)}`

  const handleShare = async (p: StoreProduct) => {
    const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (isMobile && typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: p.name, text: shareMsg(p), url: productUrl(p) })
        return
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return
      }
    }
    setShareCopied(false)
    setShareProduct(p)
  }
  const shareWhatsApp = () => {
    if (!shareProduct) return
    const msg = `${shareMsg(shareProduct)}\n${productUrl(shareProduct)}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
    setShareProduct(null)
  }
  const shareCopyLink = async () => {
    if (!shareProduct) return
    try {
      await navigator.clipboard.writeText(productUrl(shareProduct))
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 1500)
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  const selectCat = (id: string) => {
    setActiveCat(id)
    setVisible(PAGE)
  }

  const onQuery = (v: string) => {
    setQuery(v)
    setVisible(PAGE)
  }

  // Pick a category from the slide-out menu: clear any search so the category
  // filter actually shows, close the drawer, then scroll down to the products.
  const jumpToCategory = (id: string) => {
    setQuery('')
    setActiveCat(id)
    setVisible(PAGE)
    setMenuOpen(false)
    window.setTimeout(() => {
      document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  const trimmedQuery = query.trim().toLowerCase()
  const searching = trimmedQuery.length > 0

  const filtered = useMemo(() => {
    // When searching, look across ALL products (ignore the category chips).
    if (searching) {
      return products.filter((p) => {
        const hay = `${p.name} ${p.sku} ${p.category?.name ?? ''}`.toLowerCase()
        return hay.includes(trimmedQuery)
      })
    }
    if (activeCat === 'all') return products
    return products.filter((p) => p.category?.id === activeCat)
  }, [searching, trimmedQuery, activeCat, products])

  const shown = filtered.slice(0, visible)
  const cartHref = `/tienda/${warehouse.slug}/carrito`
  const accountHref = `/tienda/${warehouse.slug}/cuenta`

  return (
    <div style={{ background: '#f7f8fa', color: INK, minHeight: '100vh', paddingBottom: 76 }}>
      <style>{`
        @keyframes glrise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        .gl-rise { animation: glrise .45s ease both }
        .gl-chips::-webkit-scrollbar { display: none }
        .gl-chips { scrollbar-width: none }
        @keyframes glpop { 0% { transform: scale(1) } 50% { transform: scale(1.3) } 100% { transform: scale(1) } }
        .gl-pop { animation: glpop .35s ease }
        @keyframes gldrawer { from { transform: translateX(-100%) } to { transform: none } }
        .gl-drawer { animation: gldrawer .22s ease both }
      `}</style>

      <header className="sticky top-0 z-30" style={{ background: NAVY, color: '#fff' }}>
        <div className="mx-auto w-full max-w-[1100px] px-4 pt-3 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button type="button" aria-label="menu" onClick={() => setMenuOpen(true)} className="opacity-90 transition active:scale-90"><Icon d={ICON.menu} /></button>
              <span className="text-[20px] font-semibold tracking-wide">GangaLoo</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex overflow-hidden rounded-full text-[11px]" style={{ border: '1px solid rgba(255,255,255,.5)' }}>
                <button onClick={() => setLocale('es')} className="px-2.5 py-1 transition" style={locale === 'es' ? { background: '#fff', color: NAVY } : { color: '#cdd8ee' }}>ES</button>
                <button onClick={() => setLocale('en')} className="px-2.5 py-1 transition" style={locale === 'en' ? { background: '#fff', color: NAVY } : { color: '#cdd8ee' }}>EN</button>
              </div>
              <Link href={accountHref} aria-label={ts(locale, 'shop.nav.account')} className="opacity-90">
                <Icon d={ICON.user} />
              </Link>
              <Link href={cartHref} aria-label={ts(locale, 'shop.nav.cart')} className="relative">
                <Icon d={ICON.cart} />
                <span className={`absolute -right-2 -top-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ${bump ? 'gl-pop' : ''}`} style={{ background: RED }}>{cart.count}</span>
              </Link>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setStoreMenu((v) => !v)}
                aria-label={locale === 'es' ? 'Cambiar de tienda' : 'Change store'}
                aria-expanded={storeMenu}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] text-white transition active:scale-95"
                style={{ background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.25)' }}
              >
                <Icon d={ICON.warehouse} size={15} />
                <span>{warehouse.name}</span>
                <Icon d={ICON.chevron} size={15} />
              </button>
              {storeMenu && (
                <>
                  <button
                    type="button"
                    aria-hidden="true"
                    onClick={() => setStoreMenu(false)}
                    className="fixed inset-0 z-40 cursor-default"
                    style={{ background: 'transparent' }}
                  />
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-xl bg-white py-1 shadow-lg" style={{ border: '1px solid #eceef2' }}>
                    {(stores.length > 0 ? stores : [warehouse]).map((s) => {
                      const current = s.slug === warehouse.slug
                      return (
                        <Link
                          key={s.id}
                          href={`/tienda/${s.slug}`}
                          onClick={() => setStoreMenu(false)}
                          className="flex items-center gap-2 px-3 py-2.5 text-[13px]"
                          style={{ color: current ? NAVY : INK, background: current ? '#f0f4fb' : '#fff', fontWeight: current ? 600 : 400 }}
                        >
                          <Icon d={ICON.warehouse} size={15} />
                          <span className="flex-1">{s.name}</span>
                          {current && <Icon d="M5 12l4 4 10-10" size={15} />}
                        </Link>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 text-[12px]">
              <Icon d={ICON.search} size={15} />
              <input
                id="store-search"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder={ts(locale, 'shop.search')}
                className="w-full bg-transparent outline-none"
                style={{ color: INK }}
                inputMode="search"
                autoComplete="off"
              />
              {query && (
                <button type="button" onClick={() => onQuery('')} aria-label="clear" style={{ color: '#7c8aa3' }}>
                  <Icon d="M6 6l12 12M18 6L6 18" size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex h-1">
          <div className="flex-1" style={{ background: NAVY }} />
          <div className="flex-1 bg-white" />
          <div className="flex-1" style={{ background: RED }} />
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1100px] px-4 pt-10 pb-5 sm:pt-12">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[2px]" style={{ color: RED }}>{ts(locale, 'shop.eyebrow')}</p>
        <h1 className="text-[30px] leading-[1.1] sm:text-[40px]" style={{ color: NAVY, fontWeight: 600 }}>
          {ts(locale, 'shop.heroTitle')}{' '}
          <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: RED, fontWeight: 500 }}>{ts(locale, 'shop.heroAccent')}</span>
        </h1>
        <p className="mt-2 max-w-md text-[14px]" style={{ color: MUTED }}>{ts(locale, 'shop.heroSub')}</p>
        <a href="#productos" className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white transition active:scale-95" style={{ background: RED }}>
          {ts(locale, 'shop.cta')}
          <Icon d="M5 12h14M13 6l6 6-6 6" size={16} />
        </a>
      </section>

      {!searching && activeCat === 'all' && dailyDeal && (
        <DealSection deal={dailyDeal} locale={locale} storeSlug={warehouse.slug} onAdd={handleAdd} onShare={handleShare} />
      )}
      {!searching && activeCat === 'all' && weeklyDeal && (
        <DealSection deal={weeklyDeal} locale={locale} storeSlug={warehouse.slug} onAdd={handleAdd} onShare={handleShare} />
      )}

      {!searching && categories.length > 0 && (
        <CategoryBar
          categories={categories}
          activeCat={activeCat}
          allLabel={ts(locale, 'shop.all')}
          onSelect={selectCat}
        />
      )}

      {!searching && offers.length > 0 && activeCat === 'all' && (
        <section className="mx-auto w-full max-w-[1100px] px-4 pb-7">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[16px] font-semibold" style={{ color: NAVY }}>{ts(locale, 'shop.offers')} {warehouse.name}</h2>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white" style={{ background: RED }}>{ts(locale, 'shop.only')}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {offers.slice(0, 8).map((p, i) => (
              <ProductCard key={p.id} p={p} locale={locale} delay={i * 35} storeSlug={warehouse.slug} onAdd={handleAdd} onShare={handleShare} />
            ))}
          </div>
        </section>
      )}

      <section id="productos" className="mx-auto w-full max-w-[1100px] px-4 pb-10">
        <h2 className="mb-3 text-[16px] font-semibold" style={{ color: NAVY }}>
          {searching
            ? `${locale === 'es' ? 'Resultados' : 'Results'} "${query.trim()}"`
            : ts(locale, 'shop.allProducts')}{' '}
          <span style={{ color: MUTED, fontWeight: 400 }}>· {filtered.length}</span>
        </h2>
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-[14px]" style={{ color: MUTED }}>{ts(locale, 'shop.empty')}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shown.map((p, i) => (
                <ProductCard key={p.id} p={p} locale={locale} delay={Math.min(i % PAGE, 12) * 35} storeSlug={warehouse.slug} onAdd={handleAdd} onShare={handleShare} />
              ))}
            </div>
            {visible < filtered.length && (
              <div className="mt-7 flex justify-center">
                <button type="button" onClick={() => setVisible((v) => v + PAGE)} className="rounded-full px-7 py-2.5 text-[13px] font-semibold transition active:scale-95" style={{ color: NAVY, background: '#fff', border: `1.5px solid ${NAVY}` }}>
                  {ts(locale, 'shop.loadMore')} · {filtered.length - visible}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <footer className="mx-auto w-full max-w-[1100px] px-4 pb-8 text-center text-[12px]" style={{ color: MUTED }}>{ts(locale, 'shop.footer')}</footer>

      {menuOpen && (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label={locale === 'es' ? 'Cerrar menú' : 'Close menu'}
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0"
            style={{ background: 'rgba(10,16,28,.45)' }}
          />
          <div className="gl-drawer absolute left-0 top-0 flex h-full w-[82%] max-w-[320px] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between px-4 py-4" style={{ background: NAVY, color: '#fff' }}>
              <span className="text-[18px] font-semibold tracking-wide">GangaLoo</span>
              <button type="button" aria-label={locale === 'es' ? 'Cerrar' : 'Close'} onClick={() => setMenuOpen(false)} className="opacity-90 transition active:scale-90">
                <Icon d="M6 6l12 12M18 6L6 18" size={22} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              <MenuLink href={`/tienda/${warehouse.slug}`} d={ICON.home} label={MENU_T[locale].home} onClose={() => setMenuOpen(false)} />
              <MenuLink href={accountHref} d={ICON.user} label={MENU_T[locale].account} onClose={() => setMenuOpen(false)} />
              <MenuLink href={cartHref} d={ICON.cart} label={MENU_T[locale].cart} badge={cart.count} onClose={() => setMenuOpen(false)} />
              <MenuLink href="/tienda" d={ICON.warehouse} label={MENU_T[locale].stores} onClose={() => setMenuOpen(false)} />

              {categories.length > 0 && (
                <>
                  <p className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{MENU_T[locale].browse}</p>
                  <button type="button" onClick={() => jumpToCategory('all')} className="flex w-full items-center px-4 py-2.5 text-left text-[13px]" style={{ color: activeCat === 'all' ? NAVY : INK, fontWeight: activeCat === 'all' ? 600 : 400, background: activeCat === 'all' ? '#f0f4fb' : 'transparent' }}>
                    {ts(locale, 'shop.all')}
                  </button>
                  {categories.map((c) => (
                    <button key={c.id} type="button" onClick={() => jumpToCategory(c.id)} className="flex w-full items-center px-4 py-2.5 text-left text-[13px]" style={{ color: activeCat === c.id ? NAVY : INK, fontWeight: activeCat === c.id ? 600 : 400, background: activeCat === c.id ? '#f0f4fb' : 'transparent' }}>
                      {c.name}
                    </button>
                  ))}
                </>
              )}
            </div>

            <div className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: '#eceef2' }}>
              <span className="text-[12px]" style={{ color: MUTED }}>{MENU_T[locale].lang}</span>
              <div className="flex overflow-hidden rounded-full text-[11px]" style={{ border: `1px solid ${NAVY}` }}>
                <button type="button" onClick={() => setLocale('es')} className="px-3 py-1 transition" style={locale === 'es' ? { background: NAVY, color: '#fff' } : { color: NAVY }}>ES</button>
                <button type="button" onClick={() => setLocale('en')} className="px-3 py-1 transition" style={locale === 'en' ? { background: NAVY, color: '#fff' } : { color: NAVY }}>EN</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {shareProduct && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-hidden="true"
            onClick={() => setShareProduct(null)}
            className="absolute inset-0"
            style={{ background: 'rgba(10,16,28,.45)' }}
          />
          <div className="relative z-10 w-full max-w-[360px] rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl" style={{ border: '1px solid #eceef2' }}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide" style={{ color: MUTED }}>{locale === 'es' ? 'Compartir' : 'Share'}</p>
                <p className="text-[14px] font-semibold" style={{ color: INK }}>{shareProduct.name}</p>
              </div>
              <button type="button" onClick={() => setShareProduct(null)} aria-label={locale === 'es' ? 'Cerrar' : 'Close'} style={{ color: '#7c8aa3' }}>
                <Icon d="M6 6l12 12M18 6L6 18" size={20} />
              </button>
            </div>
            <button type="button" onClick={shareWhatsApp} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px]" style={{ border: '1px solid #eceef2', color: INK }}>
              <span style={{ color: '#25D366' }}><Icon d={ICON.chat} size={20} /></span> WhatsApp
            </button>
            <button type="button" onClick={shareCopyLink} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px]" style={{ border: '1px solid #eceef2', color: INK }}>
              <span style={{ color: shareCopied ? '#1d9e75' : NAVY }}><Icon d={shareCopied ? 'M5 12l4 4 10-10' : ICON.link} size={20} /></span>
              {shareCopied ? (locale === 'es' ? '¡Copiado!' : 'Copied!') : (locale === 'es' ? 'Copiar enlace' : 'Copy link')}
            </button>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t bg-white py-2 sm:hidden" style={{ borderColor: '#e6e9ee', color: NAVY }}>
        <NavItem href="#" d={ICON.home} label={ts(locale, 'shop.nav.home')} active />
        <NavItem href="#" d={ICON.search} label={ts(locale, 'shop.nav.search')} />
        <NavItem href={cartHref} d={ICON.cart} label={ts(locale, 'shop.nav.cart')} badge={cart.count} />
        <NavItem href={accountHref} d={ICON.user} label={ts(locale, 'shop.nav.account')} />
      </nav>
    </div>
  )
}

function CategoryBar({
  categories,
  activeCat,
  allLabel,
  onSelect,
}: {
  categories: { id: string; name: string }[]
  activeCat: string
  allLabel: string
  onSelect: (id: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  const update = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    setIsDesktop(window.innerWidth >= 640)
  }, [])

  useEffect(() => {
    // Run after paint so the row has its real width, then again on the next
    // frame as a safety net for late layout/font loading.
    update()
    const raf = requestAnimationFrame(update)
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [update, categories])

  const nudge = (dir: -1 | 1) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.7), behavior: 'smooth' })
  }

  // Explicit flex (no `hidden`/`sm:flex` combo, which can leave display:none
  // winning on desktop). We gate desktop-only via the isDesktop state instead.
  const arrowBtn = 'absolute top-1/2 z-10 flex -translate-y-1/2 h-8 w-8 items-center justify-center rounded-full bg-white shadow-md transition active:scale-90'

  return (
    <div className="relative mx-auto w-full max-w-[1100px] px-4 pb-5">
      {isDesktop && canLeft && (
        <button type="button" onClick={() => nudge(-1)} aria-label="prev" className={arrowBtn} style={{ left: 8, border: '1px solid #eceef2', color: NAVY }}>
          <Icon d="M15 6l-6 6 6 6" size={18} />
        </button>
      )}
      <div ref={scrollRef} className="gl-chips flex gap-2 overflow-x-auto scroll-smooth">
        <Chip label={allLabel} active={activeCat === 'all'} onClick={() => onSelect('all')} />
        {categories.map((c) => (
          <Chip key={c.id} label={c.name} active={activeCat === c.id} onClick={() => onSelect(c.id)} />
        ))}
      </div>
      {isDesktop && canRight && (
        <button type="button" onClick={() => nudge(1)} aria-label="next" className={arrowBtn} style={{ right: 8, border: '1px solid #eceef2', color: NAVY }}>
          <Icon d="M9 6l6 6-6 6" size={18} />
        </button>
      )}
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="whitespace-nowrap rounded-full px-4 py-2 text-[12px] transition" style={active ? { background: NAVY, color: '#fff', border: `1px solid ${NAVY}` } : { background: '#fff', color: INK, border: '1px solid #d7dde6' }}>
      {label}
    </button>
  )
}

function NavItem({ href, d, label, active, badge }: { href: string; d: string; label: string; active?: boolean; badge?: number }) {
  return (
    <Link href={href} className="relative flex flex-col items-center gap-0.5 text-[10px]" style={{ color: active ? NAVY : '#9aa5b3' }}>
      <Icon d={d} size={20} />
      {badge != null && badge > 0 && (
        <span className="absolute right-3 top-[-4px] flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white" style={{ background: RED }}>{badge}</span>
      )}
      <span>{label}</span>
    </Link>
  )
}

function MenuLink({ href, d, label, badge, onClose }: { href: string; d: string; label: string; badge?: number; onClose: () => void }) {
  return (
    <Link href={href} onClick={onClose} className="flex items-center gap-3 px-4 py-3 text-[14px]" style={{ color: INK }}>
      <span style={{ color: NAVY }}><Icon d={d} size={20} /></span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white" style={{ background: RED }}>{badge}</span>
      )}
    </Link>
  )
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatDOP } from '@/lib/format'
import type { StoreWithDeals } from '@/lib/store/catalog'

const NAVY = '#0A2A66'
const RED = '#CE1126'
const INK = '#16181d'
const MUTED = '#6b7280'

type Locale = 'es' | 'en'

const T = {
  es: {
    welcome: 'Bienvenido(a)',
    title: 'Elige tu tienda',
    sub: 'Cada tienda tiene su propio inventario y ofertas. Escoge la más cercana para empezar a comprar.',
    deals: 'Ofertas de hoy',
    shopAt: 'Comprar en',
    none: 'No hay tiendas disponibles por ahora.',
    banner: 'Crea tu cuenta y obtén mejores precios en cada compra.',
    bannerBtn: 'Crear cuenta',
    bannerClose: 'Cerrar aviso',
  },
  en: {
    welcome: 'Welcome',
    title: 'Choose your store',
    sub: 'Each store has its own stock and offers. Pick the nearest one to start shopping.',
    deals: "Today's offers",
    shopAt: 'Shop at',
    none: 'No stores available right now.',
    banner: 'Create an account and get better prices on every order.',
    bannerBtn: 'Create account',
    bannerClose: 'Dismiss',
  },
} as const

function price(cents: number) {
  return formatDOP(cents, { decimals: 0 })
}

export function StoreLandingView({
  stores,
  isLoggedIn = false,
}: {
  stores: StoreWithDeals[]
  isLoggedIn?: boolean
}) {
  const [locale, setLocale] = useState<Locale>('es')
  const [showBanner, setShowBanner] = useState(false)
  const t = T[locale]

  // The "Crear cuenta" sign-up form lives under a store (/tienda/<store>/cuenta).
  // The account is global, so any store works — we use the first available one.
  // (If you'd rather always send people to the Club page, set this to '/club'.)
  const signupHref = stores[0] ? `/tienda/${stores[0].slug}/cuenta` : '/club'

  // Show the sign-up banner only to visitors who aren't signed in, and only
  // if they haven't dismissed it before (remembered per browser).
  useEffect(() => {
    if (isLoggedIn) return
    let dismissed = false
    try {
      dismissed = localStorage.getItem('gl_signup_banner') === 'dismissed'
    } catch {
      dismissed = false
    }
    if (!dismissed) setShowBanner(true)
  }, [isLoggedIn])

  function dismissBanner() {
    setShowBanner(false)
    try {
      localStorage.setItem('gl_signup_banner', 'dismissed')
    } catch {
      /* ignore — banner just won't be remembered */
    }
  }

  return (
    <div style={{ background: '#f7f8fa', color: INK, minHeight: '100vh' }}>
      <header className="sticky top-0 z-30" style={{ background: NAVY, color: '#fff' }}>
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between px-4 py-3">
          <span className="text-[20px] font-semibold tracking-wide">GangaLoo</span>
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

      <main className="mx-auto w-full max-w-[760px] px-4 py-10">
        {showBanner && (
          <div
            className="mb-6 flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: NAVY, color: '#fff' }}
          >
            <span className="text-[18px] leading-none" aria-hidden="true">💡</span>
            <p className="flex-1 text-[13px] leading-snug">{t.banner}</p>
            <Link
              href={signupHref}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white transition active:scale-[.97]"
              style={{ background: RED }}
            >
              {t.bannerBtn}
            </Link>
            <button
              onClick={dismissBanner}
              aria-label={t.bannerClose}
              className="shrink-0 px-1 text-[20px] leading-none"
              style={{ color: 'rgba(255,255,255,.7)' }}
            >
              ×
            </button>
          </div>
        )}

        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[2px]" style={{ color: RED }}>{t.welcome}</p>
        <h1 className="text-[28px] leading-[1.15] sm:text-[34px]" style={{ color: NAVY, fontWeight: 600 }}>{t.title}</h1>
        <p className="mt-2 max-w-md text-[14px]" style={{ color: MUTED }}>{t.sub}</p>

        {stores.length === 0 ? (
          <p className="mt-8 text-[14px]" style={{ color: MUTED }}>{t.none}</p>
        ) : (
          <div className="mt-7 flex flex-col gap-5">
            {stores.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-2xl bg-white" style={{ border: '1px solid #eceef2' }}>
                <Link href={`/tienda/${s.slug}`} className="flex items-center justify-between p-5 transition active:scale-[.99]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl text-white" style={{ background: NAVY }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9l9-5 9 5v11H3zM7 20v-6h10v6" /></svg>
                    </span>
                    <span className="text-[17px] font-semibold" style={{ color: NAVY }}>{s.name}</span>
                  </div>
                  <span style={{ color: RED }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </span>
                </Link>

                {s.deals.length > 0 && (
                  <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: '#eceef2' }}>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-[13px] font-semibold" style={{ color: NAVY }}>{t.deals}</span>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white" style={{ background: RED }}>{s.deals.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {s.deals.map((d) => (
                        <Link key={d.productId} href={`/tienda/${s.slug}/${d.slug}`} className="block overflow-hidden rounded-xl transition active:scale-[.98]" style={{ border: '1px solid #eceef2', maxWidth: 200 }}>
                          <div className="relative w-full" style={{ height: 120, background: '#fff' }}>
                            {d.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={d.imageUrl} alt={d.name} className="h-full w-full object-contain" loading="lazy" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center" style={{ color: '#c2c8d2', fontStyle: 'italic', fontSize: 26 }}>G</div>
                            )}
                            <span className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: RED }}>-{d.percent}%</span>
                          </div>
                          <div className="p-2">
                            <p className="mb-1 truncate text-[11px]" style={{ color: INK }}>{d.name}</p>
                            <span className="block text-[10px] line-through" style={{ color: '#9aa3b2' }}>{price(d.normalCents)}</span>
                            <span className="text-[12px] font-semibold" style={{ color: RED }}>{price(d.dealCents)}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                    <Link href={`/tienda/${s.slug}`} className="mt-3 inline-block text-[12px] font-semibold" style={{ color: NAVY }}>
                      {t.shopAt} {s.name} →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

'use client'

// app/us/us-shop-view.tsx
// US shop Phase 2 — browse grid. English, USD. Brand-styled to match the DR
// store landing (navy/red, flag stripe). Browse-only: no cart/checkout yet.

import Link from 'next/link'
import type { UsStoreProduct } from '@/lib/us-store'

const NAVY = '#0A2A66'
const RED = '#CE1126'
const INK = '#16181d'
const MUTED = '#6b7280'

function usd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n)
}

export function UsShopView({ products }: { products: UsStoreProduct[] }) {
  return (
    <div style={{ background: '#f7f8fa', color: INK, minHeight: '100vh' }}>
      <header className="sticky top-0 z-30" style={{ background: NAVY, color: '#fff' }}>
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-4 py-3">
          <span className="text-[20px] font-semibold tracking-wide">
            GangaLoo <span style={{ color: '#cdd8ee', fontWeight: 400 }}>· US</span>
          </span>
          <span className="text-[12px]" style={{ color: '#cdd8ee' }}>
            Shipped to the USA
          </span>
        </div>
        <div className="flex h-1">
          <div className="flex-1" style={{ background: NAVY }} />
          <div className="flex-1 bg-white" />
          <div className="flex-1" style={{ background: RED }} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] px-4 py-10">
        <p
          className="mb-1 text-[11px] font-semibold uppercase tracking-[2px]"
          style={{ color: RED }}
        >
          GangaLoo US
        </p>
        <h1
          className="text-[28px] leading-[1.15] sm:text-[34px]"
          style={{ color: NAVY, fontWeight: 600 }}
        >
          Shop our products
        </h1>
        <p className="mt-2 max-w-md text-[14px]" style={{ color: MUTED }}>
          Prices in US dollars. Delivered to your door in the United States.
        </p>

        {products.length === 0 ? (
          <p className="mt-8 text-[14px]" style={{ color: MUTED }}>
            No products available right now. Please check back soon.
          </p>
        ) : (
          <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/us/${p.slug}`}
                className="block overflow-hidden rounded-2xl bg-white transition active:scale-[.99]"
                style={{ border: '1px solid #eceef2' }}
              >
                <div
                  className="relative w-full"
                  style={{ height: 180, background: '#fff' }}
                >
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center"
                      style={{ color: '#c2c8d2', fontStyle: 'italic', fontSize: 32 }}
                    >
                      G
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p
                    className="mb-1 line-clamp-2 text-[13px] leading-snug"
                    style={{ color: INK, minHeight: 34 }}
                  >
                    {p.name}
                  </p>
                  <span className="text-[16px] font-semibold" style={{ color: NAVY }}>
                    {usd(p.priceUsd)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer
        className="mx-auto w-full max-w-[1100px] px-4 py-8 text-[12px]"
        style={{ color: MUTED }}
      >
        GangaLoo US — prices in USD.
      </footer>
    </div>
  )
}

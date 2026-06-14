'use client'

// app/us/[slug]/us-product-view.tsx
// US shop Phase 2 — single product page. English, USD. Browse-only (no cart
// yet); a "Buy" affordance arrives with checkout in Phase 3.

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

export function UsProductView({ product }: { product: UsStoreProduct }) {
  return (
    <div style={{ background: '#f7f8fa', color: INK, minHeight: '100vh' }}>
      <header className="sticky top-0 z-30" style={{ background: NAVY, color: '#fff' }}>
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-4 py-3">
          <Link href="/us" className="text-[20px] font-semibold tracking-wide">
            GangaLoo <span style={{ color: '#cdd8ee', fontWeight: 400 }}>· US</span>
          </Link>
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

      <main className="mx-auto w-full max-w-[1100px] px-4 py-8">
        <Link
          href="/us"
          className="mb-6 inline-flex items-center gap-1 text-[13px] font-semibold"
          style={{ color: NAVY }}
        >
          ← Back to shop
        </Link>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div
            className="overflow-hidden rounded-2xl bg-white"
            style={{ border: '1px solid #eceef2' }}
          >
            <div
              className="relative w-full"
              style={{ height: 420, background: '#fff' }}
            >
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={{ color: '#c2c8d2', fontStyle: 'italic', fontSize: 48 }}
                >
                  G
                </div>
              )}
            </div>
          </div>

          <div>
            <h1
              className="text-[24px] leading-[1.2] sm:text-[28px]"
              style={{ color: NAVY, fontWeight: 600 }}
            >
              {product.name}
            </h1>
            <p className="mt-3 text-[28px] font-semibold" style={{ color: NAVY }}>
              {usd(product.priceUsd)}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: MUTED }}>
              Price in US dollars. Shipping calculated at checkout.
            </p>

            {product.description ? (
              <p
                className="mt-5 whitespace-pre-line text-[14px] leading-relaxed"
                style={{ color: INK }}
              >
                {product.description}
              </p>
            ) : null}

            <div
              className="mt-6 rounded-xl px-4 py-3 text-[13px]"
              style={{ background: '#eef2fb', color: NAVY }}
            >
              Online ordering for the US is coming soon. To order now, contact us
              and we&apos;ll help you place it.
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

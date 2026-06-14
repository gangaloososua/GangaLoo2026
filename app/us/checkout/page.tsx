import Link from 'next/link'
import { fetchUsStoreProduct } from '@/lib/us-store'
import { UsCheckoutForm } from './us-checkout-form'

export const dynamic = 'force-dynamic'

// US checkout page (single-product "Buy now" flow).
// Reached from a product page as /us/checkout?slug=<slug>&qty=<n>.
// Loads the product server-side (authoritative USD price) and renders the form.
export default async function UsCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; qty?: string; cancelled?: string; payfail?: string }>
}) {
  const sp = await searchParams
  const slug = sp.slug ?? ''
  const qty = Math.max(1, Math.min(99, parseInt(sp.qty ?? '1', 10) || 1))
  const product = slug ? await fetchUsStoreProduct(slug) : null

  const NAVY = '#0A2A66'
  const RED = '#CE1126'

  return (
    <div style={{ background: '#f7f8fa', color: '#16181d', minHeight: '100vh' }}>
      <header className="sticky top-0 z-30" style={{ background: NAVY, color: '#fff' }}>
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-4 py-3">
          <Link href="/us" className="text-[20px] font-semibold tracking-wide">
            GangaLoo <span style={{ color: '#cdd8ee', fontWeight: 400 }}>· US</span>
          </Link>
          <span className="text-[12px]" style={{ color: '#cdd8ee' }}>
            Secure checkout
          </span>
        </div>
        <div className="flex h-1">
          <div className="flex-1" style={{ background: NAVY }} />
          <div className="flex-1 bg-white" />
          <div className="flex-1" style={{ background: RED }} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[680px] px-4 py-8">
        {!product ? (
          <div className="rounded-2xl bg-white p-8 text-center" style={{ border: '1px solid #eceef2' }}>
            <h1 className="text-[22px]" style={{ color: NAVY, fontWeight: 600 }}>
              Nothing to check out
            </h1>
            <p className="mt-2 text-[14px]" style={{ color: '#6b7280' }}>
              We couldn&apos;t load that product. Please go back and try again.
            </p>
            <Link
              href="/us"
              className="mt-5 inline-block rounded-[10px] px-5 py-3 text-[14px] font-semibold text-white"
              style={{ background: RED }}
            >
              Back to shop
            </Link>
          </div>
        ) : (
          <>
            {sp.cancelled === '1' && (
              <div className="mb-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: '#fff4e5', color: '#92400e' }}>
                Payment cancelled — your order was not placed. You can try again below.
              </div>
            )}
            {sp.payfail === '1' && (
              <div className="mb-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: '#fde8e8', color: '#9b1c1c' }}>
                Something went wrong with the payment. No charge was made — please try again.
              </div>
            )}
            <UsCheckoutForm
              productId={product.id}
              name={product.name}
              imageUrl={product.imageUrl}
              priceUsd={product.priceUsd}
              initialQty={qty}
            />
          </>
        )}
      </main>
    </div>
  )
}

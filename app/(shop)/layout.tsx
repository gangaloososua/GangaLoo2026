// Layout for the public shop route group. This sits OUTSIDE the admin
// (dashboard) group, so the store does not inherit the seller/owner sidebar.
// It only loads the storefront fonts; the root layout still provides <html>/<body>.

import type { ReactNode } from 'react'
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google'

const display = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-display',
})

const body = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
})

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${display.variable} ${body.variable}`}
      style={{ fontFamily: 'var(--font-body)' }}
    >
      {children}
    </div>
  )
}

'use client'

// Round 43 — captures ?coupon=CODE from a scanned flyer QR on any storefront
// page, stores it for the visit, then removes it from the address bar so a
// refresh or back-button doesn't re-trigger. Renders nothing.

import { useEffect } from 'react'
import { saveFlyerCoupon } from '@/lib/store/flyer-coupon'

export function CouponCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const raw = params.get('coupon')
      if (!raw) return
      saveFlyerCoupon(raw)
      // Clean ?coupon= out of the URL, preserving any other params + hash.
      params.delete('coupon')
      const qs = params.toString()
      const newUrl =
        window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
      window.history.replaceState(null, '', newUrl)
    } catch {
      /* ignore */
    }
  }, [])
  return null
}

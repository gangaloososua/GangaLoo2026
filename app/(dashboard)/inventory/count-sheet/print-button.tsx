'use client'

import { useEffect } from 'react'

// Renders a Print button and auto-opens the print dialog once on mount.
// The button (and the surrounding nav) carry a `no-print` class so they
// don't appear on the printed page.
export function PrintButton() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [])
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
    >
      Print
    </button>
  )
}
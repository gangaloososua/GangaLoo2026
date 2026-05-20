// Shared badge helpers for online-orders pages.
//
// Underscore-prefixed folder so Next.js does NOT treat it as a route.
// Used by:
//   - app/(dashboard)/online-orders/list-table.tsx        (list rows)
//   - app/(dashboard)/online-orders/[id]/page.tsx         (detail header + commissions table)
//
// Inline tailwind classes; no shadcn Badge dependency. Same approach
// the list-table and detail page used before extraction.

import type * as React from 'react'

export function trackingBadgeClass(status: string | null): string {
  switch (status) {
    case 'received':
      return 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200'
    case 'dispatched':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
    case 'delivered':
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
    case 'cancelled':
      return 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function saleStatusBadgeClass(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
    case 'partially_paid':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
    case 'confirmed':
      return 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200'
    case 'cancelled':
      return 'bg-muted text-muted-foreground line-through'
    case 'refunded':
      return 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function commissionStatusBadgeClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200'
    case 'paid':
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
    case 'void':
      return 'bg-muted text-muted-foreground line-through'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function StatusBadge({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        className ?? ''
      }`}
    >
      {children}
    </span>
  )
}

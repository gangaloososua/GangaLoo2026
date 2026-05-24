'use client'

// A tiny cart store backed by localStorage, with a window event so every
// component using it stays in sync (no React context/provider needed).
//
// The cart belongs to ONE warehouse store at a time — these are separate stores,
// so adding an item from a different warehouse starts that warehouse's cart fresh.

import { useCallback, useEffect, useState } from 'react'

export type CartItem = {
  id: string
  slug: string
  name: string
  imageUrl: string | null
  priceCents: number
  qty: number
}

type CartState = { warehouseSlug: string | null; items: CartItem[] }

const EMPTY: CartState = { warehouseSlug: null, items: [] }
const KEY = 'gangaloo:cart:v1'
const EVT = 'gl-cart-changed'

function read(): CartState {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.items)) return parsed as CartState
    return EMPTY
  } catch {
    return EMPTY
  }
}

function write(state: CartState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // storage may be unavailable (private mode) — ignore
  }
  window.dispatchEvent(new Event(EVT))
}

export function useCart(currentWarehouse?: string) {
  const [state, setState] = useState<CartState>(EMPTY)

  useEffect(() => {
    setState(read())
    const handler = () => setState(read())
    window.addEventListener(EVT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(EVT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])

  const belongsHere =
    currentWarehouse == null || state.warehouseSlug === currentWarehouse
  const items = belongsHere ? state.items : []
  const count = items.reduce((n, i) => n + i.qty, 0)
  const subtotalCents = items.reduce((s, i) => s + i.priceCents * i.qty, 0)

  const add = useCallback(
    (warehouseSlug: string, item: Omit<CartItem, 'qty'>, qty = 1) => {
      const cur = read()
      const next: CartState =
        cur.warehouseSlug && cur.warehouseSlug !== warehouseSlug
          ? { warehouseSlug, items: [] }
          : { warehouseSlug, items: [...cur.items] }
      const existing = next.items.find((i) => i.id === item.id)
      if (existing) existing.qty += qty
      else next.items.push({ ...item, qty })
      write(next)
    },
    [],
  )

  const setQty = useCallback((id: string, qty: number) => {
    const cur = read()
    const nextItems = cur.items
      .map((i) => (i.id === id ? { ...i, qty: Math.max(0, qty) } : i))
      .filter((i) => i.qty > 0)
    write({ ...cur, items: nextItems })
  }, [])

  const remove = useCallback((id: string) => {
    const cur = read()
    write({ ...cur, items: cur.items.filter((i) => i.id !== id) })
  }, [])

  const clear = useCallback(() => write(EMPTY), [])

  return {
    items,
    count,
    subtotalCents,
    warehouseSlug: state.warehouseSlug,
    add,
    setQty,
    remove,
    clear,
  }
}

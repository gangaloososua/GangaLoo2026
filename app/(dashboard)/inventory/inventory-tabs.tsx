'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

type Props = {
  // The tab the server decided to open with (e.g. 'history' when a filter or
  // product param is present, else 'dashboard').
  initialTab: string
  dashboard: ReactNode
  stock: ReactNode
  history: ReactNode
  adjust: ReactNode
}

// Any of these params in the URL means the user is looking at filtered/linked
// history, so the History tab should be active.
const HISTORY_PARAMS = ['warehouse', 'kind', 'category', 'product', 'from', 'to']

export function InventoryTabs({
  initialTab,
  dashboard,
  stock,
  history,
  adjust,
}: Props) {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState(initialTab)

  // When the URL params change via client navigation (e.g. clicking a product
  // link in the Stock-on-hand table, or applying a filter), Radix's
  // defaultValue won't react — so we drive the active tab from the URL here.
  // This makes a click behave identically to a fresh page load / refresh.
  useEffect(() => {
    const hasHistoryParam = HISTORY_PARAMS.some((p) => {
      const v = searchParams.get(p)
      return v !== null && v !== ''
    })
    if (hasHistoryParam) setTab('history')
  }, [searchParams])

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="stock">Stock on hand</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="adjust">Adjust stock</TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="pt-4">
        {dashboard}
      </TabsContent>
      <TabsContent value="stock" className="pt-4">
        {stock}
      </TabsContent>
      <TabsContent value="history" className="pt-4">
        {history}
      </TabsContent>
      <TabsContent value="adjust" className="pt-4">
        {adjust}
      </TabsContent>
    </Tabs>
  )
}

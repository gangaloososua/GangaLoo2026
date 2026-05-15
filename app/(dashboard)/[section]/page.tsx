import { navItems } from '@/lib/nav'
import { notFound } from 'next/navigation'

export default async function PlaceholderPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section } = await params

  const item = navItems.find(
    (n) => n.href === `/${section}` && n.href !== '/'
  )

  if (!item) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{item.label}</h1>
        <p className="text-sm text-muted-foreground">Coming soon.</p>
      </div>
    </div>
  )
}
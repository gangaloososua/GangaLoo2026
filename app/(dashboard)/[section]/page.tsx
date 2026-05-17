import { navItems } from '@/lib/nav'
import { notFound } from 'next/navigation'
import { requireAdminCaller } from '@/lib/auth/guard'

export default async function PlaceholderPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const caller = await requireAdminCaller()
  const { section } = await params
  const item = navItems.find(
    (n) => n.href === `/${section}` && n.href !== '/'
  )
  if (!item) {
    notFound()
  }
  if (!item.roles.includes(caller.role)) {
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

import { Suspense } from 'react'
import { Sidebar, MobileNav } from '@/components/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { requireAdminCaller } from '@/lib/auth/guard'
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const caller = await requireAdminCaller()
  return (
    <div className="flex h-screen overflow-hidden">
      <Suspense fallback={<aside className="hidden w-60 border-r bg-background md:block" />}>
        <Sidebar role={caller.role} />
      </Suspense>
      <main className="flex-1 overflow-y-auto">
        <div className="border-b bg-background">
          <div className="flex h-16 items-center gap-3 px-6">
            <Suspense fallback={null}>
              <MobileNav role={caller.role} />
            </Suspense>
            <span className="ml-auto text-sm text-muted-foreground">{caller.email}</span>
          </div>
        </div>
        <div className="p-6">{children}</div>
      </main>
      <Toaster />
    </div>
  )
}

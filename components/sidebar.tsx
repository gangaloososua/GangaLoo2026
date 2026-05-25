'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { navItems } from '@/lib/nav'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { logout } from '@/app/actions'
import { LogOut } from 'lucide-react'
import type { Role } from '@/lib/auth/roles'
import { localeForRole, t } from '@/lib/i18n/dictionary'
export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname()
  const sp = useSearchParams()
  const locale = localeForRole(role)
  const visibleItems = navItems.filter((item) => item.roles.includes(role))
  function isActive(href: string): boolean {
    const [hrefPath, hrefQuery] = href.split('?')
    if (hrefPath !== pathname) {
      if (hrefPath === '/' && pathname !== '/') return false
      if (hrefPath !== '/' && !pathname.startsWith(hrefPath)) return false
      if (hrefPath === '/') return pathname === '/'
    }
    const currentRelevant = new Map<string, string>()
    const hrefParams = new URLSearchParams(hrefQuery ?? '')
    for (const [k, v] of hrefParams) currentRelevant.set(k, v)
    if (!hrefQuery) {
      if (hrefPath === '/people') {
        return !sp.get('role') && sp.get('distributor') !== '1'
      }
      return true
    }
    for (const [k, v] of currentRelevant) {
      if (sp.get(k) !== v) return false
    }
    return true
  }
  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-background">
      <div className="flex h-16 items-center px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Gangaloo Control
        </Link>
      </div>
      <Separator />
      <nav className="flex-1 space-y-1 px-3 py-4">
        {visibleItems.map((item) => {
          const active = isActive(item.href)
          const Icon = item.icon
          // Round 37d: inline i18n label wins; otherwise use the shared dictionary.
          const label = item.i18n ? item.i18n[locale] : t(locale, 'nav.' + item.label)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>
      <Separator />
      <div className="p-3">
        <form>
          <Button
            formAction={logout}
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            {t(locale, 'common.signOut')}
          </Button>
        </form>
      </div>
    </aside>
  )
}

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Paths that do NOT require a logged-in user.
//   /login, /auth  → admin authentication
//   /tienda        → public customer storefront (browse, cart, checkout,
//                    and the customer account/login page at /tienda/.../cuenta)
const PUBLIC_PREFIXES = ['/login', '/auth', '/tienda']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: must run getUser() to refresh the session token.
  // This still runs for public paths so customer sessions stay fresh.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPublic = PUBLIC_PREFIXES.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  )

  // Redirect unauthenticated users away from protected (admin) pages only.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

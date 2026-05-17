import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Admin Supabase client — uses the service role key.
// Bypasses RLS. Can call auth.admin.* methods (createUser, deleteUser, etc).
// Server-only: importing this from a client component will throw at build time.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
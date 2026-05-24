'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  signUpCustomer,
  signInCustomer,
  signOutCustomer,
} from '@/lib/store/auth-actions'

const NAVY = '#0A2A66'
const RED = '#CE1126'
const INK = '#16181d'
const MUTED = '#6b7280'

type Locale = 'es' | 'en'

const T = {
  es: {
    back: 'Volver',
    account: 'Mi cuenta',
    login: 'Iniciar sesión',
    register: 'Crear cuenta',
    name: 'Nombre',
    email: 'Correo',
    password: 'Contraseña',
    phone: 'Teléfono (opcional)',
    haveAccount: '¿Ya tienes cuenta? Inicia sesión',
    noAccount: '¿Eres nuevo? Crea una cuenta',
    signOut: 'Cerrar sesión',
    welcome: 'Bienvenido(a)',
    keepShopping: 'Seguir comprando',
    working: 'Un momento…',
    err_NAME_REQUIRED: 'Escribe tu nombre.',
    err_EMAIL_INVALID: 'Escribe un correo válido.',
    err_PASSWORD_SHORT: 'La contraseña debe tener al menos 6 caracteres.',
    err_EMAIL_TAKEN: 'Ya existe una cuenta con ese correo. Inicia sesión.',
    err_PHONE_TAKEN: 'Ese teléfono ya está registrado. Déjalo en blanco o contáctanos.',
    err_CREDENTIALS_REQUIRED: 'Escribe tu correo y contraseña.',
    err_BAD_LOGIN: 'Correo o contraseña incorrectos.',
    err_GENERIC: 'Algo salió mal. Inténtalo de nuevo.',
  },
  en: {
    back: 'Back',
    account: 'My account',
    login: 'Log in',
    register: 'Create account',
    name: 'Name',
    email: 'Email',
    password: 'Password',
    phone: 'Phone (optional)',
    haveAccount: 'Already have an account? Log in',
    noAccount: 'New here? Create an account',
    signOut: 'Sign out',
    welcome: 'Welcome',
    keepShopping: 'Keep shopping',
    working: 'One moment…',
    err_NAME_REQUIRED: 'Please enter your name.',
    err_EMAIL_INVALID: 'Please enter a valid email.',
    err_PASSWORD_SHORT: 'Password must be at least 6 characters.',
    err_EMAIL_TAKEN: 'An account with that email already exists. Log in instead.',
    err_PHONE_TAKEN: 'That phone is already registered. Leave it blank or contact us.',
    err_CREDENTIALS_REQUIRED: 'Please enter your email and password.',
    err_BAD_LOGIN: 'Wrong email or password.',
    err_GENERIC: 'Something went wrong. Please try again.',
  },
} as const

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#fff',
  border: '1px solid #d7dde6',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 14,
  color: INK,
  outline: 'none',
}

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function AccountView({
  warehouseSlug,
  warehouseName,
  loggedIn,
  profile,
}: {
  warehouseSlug: string
  warehouseName: string
  loggedIn: boolean
  profile: {
    full_name?: string | null
    email?: string | null
    phone?: string | null
    role?: string | null
  } | null
}) {
  const router = useRouter()
  const [locale, setLocale] = useState<Locale>('es')
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const t = T[locale]
  const storeHref = `/tienda/${warehouseSlug}`

  function msg(code: string) {
    const key = `err_${code}` as keyof typeof t
    return (t[key] as string) || t.err_GENERIC
  }

  async function submit() {
    setError('')
    setBusy(true)
    const res =
      mode === 'register'
        ? await signUpCustomer({ name, email, password, phone })
        : await signInCustomer({ email, password })
    setBusy(false)
    if (res.ok) {
      router.refresh()
    } else {
      setError(msg(res.error))
    }
  }

  async function logout() {
    setBusy(true)
    await signOutCustomer()
    setBusy(false)
    router.refresh()
  }

  return (
    <div style={{ background: '#f7f8fa', color: INK, minHeight: '100vh', paddingBottom: 24 }}>
      <header className="sticky top-0 z-30" style={{ background: NAVY, color: '#fff' }}>
        <div className="mx-auto flex w-full max-w-[560px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href={storeHref} aria-label={t.back} className="opacity-90">
              <Icon d="M15 6l-6 6 6 6" />
            </Link>
            <span className="text-[19px] font-semibold tracking-wide">GangaLoo</span>
          </div>
          <div className="flex overflow-hidden rounded-full text-[11px]" style={{ border: '1px solid rgba(255,255,255,.5)' }}>
            <button onClick={() => setLocale('es')} className="px-2.5 py-1 transition" style={locale === 'es' ? { background: '#fff', color: NAVY } : { color: '#cdd8ee' }}>ES</button>
            <button onClick={() => setLocale('en')} className="px-2.5 py-1 transition" style={locale === 'en' ? { background: '#fff', color: NAVY } : { color: '#cdd8ee' }}>EN</button>
          </div>
        </div>
        <div className="flex h-1">
          <div className="flex-1" style={{ background: NAVY }} />
          <div className="flex-1 bg-white" />
          <div className="flex-1" style={{ background: RED }} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[560px] px-4 py-6">
        {loggedIn ? (
          <div className="rounded-2xl bg-white p-6" style={{ border: '1px solid #eceef2' }}>
            <h1 className="text-[20px] font-semibold" style={{ color: NAVY }}>{t.account}</h1>
            <p className="mt-1 text-[14px]" style={{ color: MUTED }}>
              {t.welcome}{profile?.full_name ? `, ${profile.full_name}` : ''}.
            </p>
            <div className="mt-4 rounded-xl p-3 text-[13px]" style={{ background: '#f7f8fa' }}>
              {profile?.email ? <p><span style={{ color: MUTED }}>{t.email}:</span> {profile.email}</p> : null}
              {profile?.phone ? <p><span style={{ color: MUTED }}>{t.phone.replace(' (opcional)', '').replace(' (optional)', '')}:</span> {profile.phone}</p> : null}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={storeHref} className="rounded-full px-5 py-2.5 text-[13px] font-semibold text-white" style={{ background: RED }}>{t.keepShopping}</Link>
              <button onClick={logout} disabled={busy} className="rounded-full px-5 py-2.5 text-[13px] font-semibold disabled:opacity-50" style={{ border: `1px solid ${NAVY}`, color: NAVY, background: '#fff' }}>
                {busy ? t.working : t.signOut}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-6" style={{ border: '1px solid #eceef2' }}>
            <div className="mb-4 flex gap-2">
              <button onClick={() => { setMode('register'); setError('') }} className="flex-1 rounded-full px-4 py-2 text-[13px] font-semibold transition" style={mode === 'register' ? { background: NAVY, color: '#fff' } : { background: '#f0f2f6', color: INK }}>{t.register}</button>
              <button onClick={() => { setMode('login'); setError('') }} className="flex-1 rounded-full px-4 py-2 text-[13px] font-semibold transition" style={mode === 'login' ? { background: NAVY, color: '#fff' } : { background: '#f0f2f6', color: INK }}>{t.login}</button>
            </div>

            <div className="flex flex-col gap-3">
              {mode === 'register' ? (
                <div>
                  <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{t.name} *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{t.email} *</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoCapitalize="none" style={inputStyle} />
              </div>
              <div>
                <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{t.password} *</label>
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" style={inputStyle} />
              </div>
              {mode === 'register' ? (
                <div>
                  <label className="mb-1 block text-[12px]" style={{ color: MUTED }}>{t.phone}</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" style={inputStyle} />
                </div>
              ) : null}
            </div>

            {error ? <p className="mt-3 text-[13px]" style={{ color: RED }}>{error}</p> : null}

            <button onClick={submit} disabled={busy} className="mt-4 w-full rounded-full px-6 py-3.5 text-[15px] font-semibold text-white transition active:scale-95 disabled:opacity-50" style={{ background: RED }}>
              {busy ? t.working : mode === 'register' ? t.register : t.login}
            </button>

            <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError('') }} className="mt-3 w-full text-center text-[13px]" style={{ color: NAVY }}>
              {mode === 'register' ? t.haveAccount : t.noAccount}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

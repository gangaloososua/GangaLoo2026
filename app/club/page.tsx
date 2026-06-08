'use client'

// GangaLoo — Club membership page  —  route: /club  (app/club/page.tsx)
//
// Marketing + the three plans + real benefits + a signup form with a LIVE
// membership card. On submit it calls the existing signUpCustomer() server
// action, which: creates the store login, creates a locked-down 'customer'
// profile, and WhatsApp-alerts the owner (now including the chosen plan).
//
// IMPORTANT: signup does NOT make anyone a Club member. The owner flips the
// "Club member" toggle in admin → People AFTER payment. This page only
// collects the request and creates the shopping account.
//
// Card save/print is dependency-free: it uses the browser's print dialog
// (which offers "Save as PDF", including on phones). No external library.

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import Link from 'next/link'
import { signUpCustomer } from '@/lib/store/auth-actions'

const WA_BUSINESS = '18292867868'

type PlanId = 'mensual' | 'trimestral' | 'semestral'

const PLANS: {
  id: PlanId
  nombre: string
  precio: string
  precioCents: number
  detalle: string
  badge?: string
}[] = [
  { id: 'mensual', nombre: '1 mes', precio: 'RD$1,499', precioCents: 149900, detalle: 'por mes', badge: 'Popular' },
  { id: 'trimestral', nombre: '3 meses', precio: 'RD$2,999', precioCents: 299900, detalle: 'RD$1,000/mes', badge: 'Mejor valor' },
  { id: 'semestral', nombre: '6 meses', precio: 'RD$4,999', precioCents: 499900, detalle: 'RD$833/mes' },
]

const PLAN_LABEL: Record<PlanId, string> = {
  mensual: 'Mensual — RD$1,499 / mes',
  trimestral: 'Trimestral — RD$2,999 / 3 meses',
  semestral: 'Semestral — RD$4,999 / 6 meses',
}

const BENEFITS: { icon: string; title: string; desc: string }[] = [
  {
    icon: '🏷️',
    title: 'Precios de Club',
    desc: 'Paga el precio especial de miembro en los productos marcados — en la tienda online y en persona.',
  },
  {
    icon: '🚚',
    title: 'Envío gratis y prioritario',
    desc: 'Tus pedidos viajan sin costo de envío y salen primero en empaque y despacho.',
  },
  {
    icon: '💳',
    title: 'Tarjeta de débito virtual GRATIS',
    desc: 'Tu propia tarjeta virtual GangaLoo para pagar en la tienda online. Aplican cargos de servicio por transacción.',
  },
  {
    icon: '⚡',
    title: 'Acceso anticipado a ofertas',
    desc: 'Sé el primero en ver liquidaciones, nuevas colecciones y ofertas especiales antes que nadie.',
  },
  {
    icon: '📞',
    title: 'Atención prioritaria por WhatsApp',
    desc: 'Línea directa para miembros: respuesta prioritaria y atención personalizada.',
  },
  {
    icon: '📦',
    title: 'Pedidos Temu, Shein y AliExpress con menos comisión',
    desc: 'Como miembro pagas una comisión más baja cuando te traemos tus pedidos de Temu, Shein o AliExpress.',
  },
]

const ERR_ES: Record<string, string> = {
  NAME_REQUIRED: 'Escribe tu nombre.',
  EMAIL_INVALID: 'Revisa tu correo electrónico.',
  PASSWORD_SHORT: 'La contraseña debe tener al menos 6 caracteres.',
  PHONE_REQUIRED: 'Escribe tu teléfono / WhatsApp.',
  EMAIL_TAKEN: 'Ese correo ya tiene una cuenta. Inicia sesión en su lugar.',
  PHONE_TAKEN: 'Ese teléfono ya está registrado con otra cuenta.',
  PASSWORD_MISMATCH: 'Las contraseñas no coinciden.',
}

export default function ClubPage() {
  useEffect(() => {
    document.title = 'Club GangaLoo — Únete y ahorra'
  }, [])

  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanId>('trimestral')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Real, sequential member number — assigned by the server at signup and shown
  // on the success card. Null (placeholder) until the form is submitted.
  const [assignedNo, setAssignedNo] = useState<string | null>(null)
  const cardNo = assignedNo ?? 'GL-——————'
  // "Vence" (expires) date for the card — changes with the chosen plan:
  // monthly +1 month, quarterly +3, semi-annual +6. Recomputed when the plan
  // changes. (At activation the owner sets the official dates; this is the
  // preview the customer keeps.)
  const vence = useMemo(() => {
    const months: Record<PlanId, number> = { mensual: 1, trimestral: 3, semestral: 6 }
    const d = new Date()
    d.setMonth(d.getMonth() + months[plan])
    return d.toLocaleDateString('es-DO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }, [plan])

  const fullName = `${nombre} ${apellido}`.trim()
  const selectedPlan = PLANS.find((p) => p.id === plan)!

  function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!nombre.trim() || !apellido.trim()) return setError(ERR_ES.NAME_REQUIRED)
    if (!telefono.trim()) return setError(ERR_ES.PHONE_REQUIRED)
    if (!email.includes('@')) return setError(ERR_ES.EMAIL_INVALID)
    if (password.length < 6) return setError(ERR_ES.PASSWORD_SHORT)
    if (password !== confirm) return setError(ERR_ES.PASSWORD_MISMATCH)

    setSubmitting(true)
    try {
      const res = await signUpCustomer({
        name: fullName,
        email: email.trim(),
        password,
        phone: telefono,
        city: ciudad,
        plan: PLAN_LABEL[plan],
      })
      if (!res.ok) {
        setError(ERR_ES[res.error] ?? 'No se pudo completar el registro. Intenta de nuevo.')
        setSubmitting(false)
        return
      }
      if (res.memberNo) setAssignedNo(res.memberNo)
      setDone(true)
      setSubmitting(false)
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch {
      setError('No se pudo completar el registro. Intenta de nuevo.')
      setSubmitting(false)
    }
  }

  const waPagar =
    `https://wa.me/${WA_BUSINESS}?text=` +
    encodeURIComponent(
      `Hola, quiero activar mi Club GangaLoo (${PLAN_LABEL[plan]}). Mi correo: ${email}`,
    )

  return (
    <div className="gl-club">
      <style>{styles}</style>

      {/* NAV */}
      <header className="gl-nav gl-no-print">
        <Link href="/" className="gl-brand">
          Ganga<span>Loo</span>
        </Link>
        <nav className="gl-nav-links">
          <Link href="/ayuda">Cómo funciona</Link>
          <Link href="/cotizador">Cotizador</Link>
          <Link href="/tienda" className="gl-nav-cta">
            Tienda
          </Link>
        </nav>
      </header>

      {done ? (
        /* ===================== SUCCESS ===================== */
        <section className="gl-section gl-success">
          <div className="gl-success-box gl-no-print">
            <div className="gl-success-check">✓</div>
            <h1 className="gl-h2" style={{ marginBottom: '.5rem' }}>
              ¡Solicitud recibida{nombre ? `, ${nombre}` : ''}!
            </h1>
            <p>
              Tu cuenta ya está creada — puedes iniciar sesión en la tienda con tu correo.
              Para activar tu Club ({selectedPlan.precio}), realiza el pago y te activamos
              enseguida.
            </p>
            <a className="gl-btn gl-btn-wa" href={waPagar} target="_blank" rel="noopener noreferrer">
              Pagar por WhatsApp para activar
            </a>
            <p className="gl-fine">
              Guarda tu tarjeta de miembro abajo. Tu número de miembro
              {assignedNo ? ` es ${assignedNo}` : ''} ya está reservado; tus
              beneficios se activan al confirmar el pago.
            </p>
          </div>

          <div className="gl-print-keep">
            <MemberCard
              fullName={fullName || 'Tu Nombre'}
              memberNo={cardNo}
              vence={vence}
              photo={photo}
              planNombre={selectedPlan.nombre}
            />
          </div>

          <div className="gl-card-actions gl-no-print">
            <button className="gl-btn gl-btn-ghost" onClick={() => window.print()}>
              Guardar / Imprimir tarjeta
            </button>
            <Link className="gl-btn gl-btn-primary" href="/tienda">
              Ir a la tienda
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* ===================== HERO ===================== */}
          <section className="gl-hero gl-no-print">
            <div className="gl-hero-bg" aria-hidden="true" />
            <div className="gl-hero-inner">
              <p className="gl-eyebrow">El club más exclusivo de compradores en RD</p>
              <h1 className="gl-title">
                Club <span>GangaLoo</span>
              </h1>
              <p className="gl-tagline">
                Precios de miembro, envío gratis y beneficios únicos cada mes. Únete y
                compra mejor.
              </p>
              <a className="gl-btn gl-btn-primary" href="#registro" style={{ marginTop: '2rem' }}>
                Unirme ahora →
              </a>
            </div>
          </section>

          {/* ===================== PLANS ===================== */}
          <section className="gl-section gl-no-print">
            <h2 className="gl-h2">Elige tu plan</h2>
            <div className="gl-plans">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`gl-plan ${plan === p.id ? 'gl-plan-on' : ''}`}
                  onClick={() => setPlan(p.id)}
                >
                  {p.badge && <span className="gl-plan-badge">{p.badge}</span>}
                  <span className="gl-plan-name">{p.nombre}</span>
                  <span className="gl-plan-price">{p.precio}</span>
                  <span className="gl-plan-detail">{p.detalle}</span>
                  <span className="gl-plan-pick">{plan === p.id ? '● Seleccionado' : 'Elegir'}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ===================== BENEFITS ===================== */}
          <section className="gl-section gl-no-print">
            <h2 className="gl-h2">Beneficios exclusivos</h2>
            <div className="gl-benefits">
              {BENEFITS.map((b) => (
                <div key={b.title} className="gl-benefit">
                  <span className="gl-benefit-icon">{b.icon}</span>
                  <div>
                    <h3>{b.title}</h3>
                    <p>{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ===================== REGISTRO ===================== */}
          <section id="registro" className="gl-section">
            <h2 className="gl-h2 gl-no-print">Crea tu tarjeta de membresía</h2>
            <div className="gl-registro">
              {/* FORM */}
              <form className="gl-form gl-no-print" onSubmit={onSubmit}>
                <div className="gl-row2">
                  <Field label="Nombre" value={nombre} onChange={setNombre} required />
                  <Field label="Apellido" value={apellido} onChange={setApellido} required />
                </div>
                <Field label="Teléfono / WhatsApp" value={telefono} onChange={setTelefono} required inputMode="tel" />
                <Field label="Correo electrónico" value={email} onChange={setEmail} required type="email" />
                <Field label="Ciudad" value={ciudad} onChange={setCiudad} />

                <p className="gl-lock">🔒 Crea una contraseña para entrar a tu cuenta en la tienda con este mismo correo.</p>
                <div className="gl-row2">
                  <Field label="Contraseña" value={password} onChange={setPassword} required type="password" />
                  <Field label="Confirmar contraseña" value={confirm} onChange={setConfirm} required type="password" />
                </div>

                <label className="gl-field">
                  <span className="gl-label">Foto de perfil (opcional) — aparece en tu tarjeta</span>
                  <input type="file" accept="image/*" onChange={onPhoto} className="gl-file" />
                </label>

                <div className="gl-plan-mini">
                  <span className="gl-label">Plan elegido</span>
                  <div className="gl-plan-mini-row">
                    {PLANS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`gl-chip ${plan === p.id ? 'gl-chip-on' : ''}`}
                        onClick={() => setPlan(p.id)}
                      >
                        {p.nombre} · {p.precio}
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p className="gl-error">{error}</p>}

                <button className="gl-btn gl-btn-primary gl-submit" type="submit" disabled={submitting}>
                  {submitting ? 'Enviando…' : '👑 Solicitar membresía'}
                </button>
                <p className="gl-fine">
                  Al enviar, creamos tu cuenta de tienda. Tu Club se activa después de
                  confirmar el pago.
                </p>
              </form>

              {/* LIVE CARD */}
              <div className="gl-card-col">
                <p className="gl-card-hint gl-no-print">Tu tarjeta se actualiza mientras escribes. Tu número de miembro se asigna al enviar:</p>
                <div className="gl-print-keep">
                  <MemberCard
                    fullName={fullName || 'Tu Nombre'}
                    memberNo={cardNo}
                    vence={vence}
                    photo={photo}
                    planNombre={selectedPlan.nombre}
                  />
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* FOOTER */}
      <footer className="gl-footer gl-no-print">
        <p>
          ¿Preguntas?{' '}
          <a href={`https://wa.me/${WA_BUSINESS}`} target="_blank" rel="noopener noreferrer">
            Escríbenos por WhatsApp
          </a>
        </p>
        <p style={{ opacity: 0.5 }}>© {new Date().getFullYear()} GangaLoo</p>
      </footer>
    </div>
  )
}

/* ---------- small field component ---------- */
function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
  inputMode?: 'tel' | 'text' | 'email'
}) {
  return (
    <label className="gl-field">
      <span className="gl-label">
        {props.label}
        {props.required && <i> *</i>}
      </span>
      <input
        className="gl-input"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        type={props.type ?? 'text'}
        inputMode={props.inputMode}
        required={props.required}
      />
    </label>
  )
}

/* ---------- membership card ---------- */
function MemberCard(props: {
  fullName: string
  memberNo: string
  vence: string
  photo: string | null
  planNombre: string
}) {
  return (
    <div className="gl-memcard">
      <div className="gl-memcard-top">
        <span className="gl-memcard-brand">
          Ganga<span>Loo</span>
        </span>
        <span className="gl-memcard-chip" aria-hidden="true" />
      </div>
      <p className="gl-memcard-kicker">Tarjeta de Membresía · CLUB</p>
      <div className="gl-memcard-body">
        <div className="gl-memcard-photo">
          {props.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.photo} alt="" />
          ) : (
            <span>👤</span>
          )}
        </div>
        <div className="gl-memcard-info">
          <p className="gl-memcard-name">{props.fullName}</p>
          <p className="gl-memcard-plan">Plan {props.planNombre}</p>
        </div>
      </div>
      <div className="gl-memcard-foot">
        <span>No. {props.memberNo}</span>
        <span>Vence {props.vence}</span>
      </div>
    </div>
  )
}

const styles = `
.gl-club{
  --gl-navy:#002D62; --gl-navy2:#1a4a8a; --gl-ink:#06101a;
  --gl-red:#CF142B; --gl-gold:#c8a84b; --gl-gold2:#e5c96a;
  --gl-cream:#f0f4ff; --gl-line:rgba(200,168,75,.25);
  background:var(--gl-ink); color:var(--gl-cream);
  min-height:100vh; width:100%;
}
.gl-club a{ text-decoration:none; color:inherit; }
.gl-club h1,.gl-club h2,.gl-club h3{ line-height:1.08; letter-spacing:-.01em; }

/* NAV */
.gl-nav{ position:sticky; top:0; z-index:50; display:flex; align-items:center; justify-content:space-between; padding:0 5vw; height:64px; background:rgba(6,16,26,.85); backdrop-filter:blur(12px); border-bottom:1px solid var(--gl-line); }
.gl-brand{ font-size:1.5rem; font-weight:800; letter-spacing:1px; color:var(--gl-gold); }
.gl-brand span{ color:var(--gl-cream); }
.gl-nav-links{ display:flex; align-items:center; gap:1.5rem; }
.gl-nav-links a{ font-size:.85rem; font-weight:600; text-transform:uppercase; letter-spacing:.5px; opacity:.85; transition:opacity .15s,color .15s; }
.gl-nav-links a:hover{ opacity:1; color:var(--gl-gold2); }
.gl-nav-cta{ background:var(--gl-red); color:#fff !important; padding:9px 18px; border-radius:3px; opacity:1 !important; }
.gl-nav-cta:hover{ background:#a50f22; }
@media (max-width:560px){ .gl-nav-links a:not(.gl-nav-cta){ display:none; } }

/* HERO */
.gl-hero{ position:relative; overflow:hidden; background:var(--gl-navy); padding:clamp(64px,14vh,130px) 5vw clamp(48px,9vh,90px); text-align:center; }
.gl-hero-bg{ position:absolute; inset:0; background:radial-gradient(ellipse 70% 60% at 60% 30%, rgba(26,74,138,.55) 0%, transparent 70%), radial-gradient(ellipse 50% 50% at 10% 100%, rgba(207,20,43,.25) 0%, transparent 60%), radial-gradient(ellipse 45% 45% at 95% 0%, rgba(200,168,75,.2) 0%, transparent 60%); }
.gl-hero-inner{ position:relative; max-width:720px; margin:0 auto; }
.gl-eyebrow{ font-size:.78rem; font-weight:600; letter-spacing:2.5px; text-transform:uppercase; color:var(--gl-gold2); margin-bottom:1rem; }
.gl-title{ font-size:clamp(2.4rem,9vw,5rem); font-weight:800; color:var(--gl-gold); margin:0; }
.gl-title span{ color:var(--gl-cream); }
.gl-tagline{ font-size:clamp(1rem,2.4vw,1.25rem); max-width:520px; margin:1.25rem auto 0; opacity:.85; line-height:1.5; }

/* BUTTONS */
.gl-btn{ display:inline-flex; align-items:center; justify-content:center; gap:.5rem; padding:14px 28px; border-radius:4px; font-size:.95rem; font-weight:700; letter-spacing:.3px; transition:transform .15s,background .15s,box-shadow .15s; cursor:pointer; border:none; }
.gl-btn:hover{ transform:translateY(-2px); }
.gl-btn:disabled{ opacity:.6; cursor:default; transform:none; }
.gl-btn-primary{ background:var(--gl-red); color:#fff; box-shadow:0 8px 24px rgba(207,20,43,.35); }
.gl-btn-primary:hover{ background:#a50f22; }
.gl-btn-ghost{ background:transparent; color:var(--gl-cream); border:1px solid var(--gl-line); }
.gl-btn-ghost:hover{ border-color:var(--gl-gold); color:var(--gl-gold2); }
.gl-btn-wa{ background:#25D366; color:#fff; box-shadow:0 8px 24px rgba(37,211,102,.3); }
.gl-btn-wa:hover{ background:#1da855; }

/* SECTIONS */
.gl-section{ max-width:1080px; margin:0 auto; padding:clamp(44px,7vh,72px) 5vw 0; }
.gl-h2{ font-size:clamp(1.4rem,4vw,2rem); font-weight:700; color:var(--gl-cream); margin-bottom:1.5rem; position:relative; padding-bottom:.6rem; }
.gl-h2::after{ content:""; position:absolute; left:0; bottom:0; width:48px; height:3px; background:var(--gl-red); border-radius:2px; }

/* PLANS */
.gl-plans{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:1rem; }
.gl-plan{ position:relative; display:flex; flex-direction:column; gap:.3rem; padding:1.5rem 1.25rem; border-radius:14px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.1); cursor:pointer; text-align:left; transition:transform .15s,border-color .15s,background .15s; color:inherit; }
.gl-plan:hover{ transform:translateY(-3px); border-color:var(--gl-gold); }
.gl-plan-on{ border-color:var(--gl-red); background:linear-gradient(150deg,rgba(207,20,43,.16),rgba(0,45,98,.22)); }
.gl-plan-badge{ position:absolute; top:-10px; right:14px; background:var(--gl-gold); color:#1a1205; font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.5px; padding:3px 9px; border-radius:20px; }
.gl-plan-name{ font-size:.9rem; opacity:.8; }
.gl-plan-price{ font-size:1.7rem; font-weight:800; color:var(--gl-gold2); }
.gl-plan-detail{ font-size:.8rem; opacity:.6; }
.gl-plan-pick{ margin-top:.6rem; font-size:.8rem; font-weight:700; color:var(--gl-gold2); }

/* BENEFITS */
.gl-benefits{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:1rem; }
.gl-benefit{ display:flex; gap:.9rem; padding:1.25rem; border-radius:12px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); }
.gl-benefit-icon{ font-size:1.5rem; line-height:1; }
.gl-benefit h3{ font-size:1.02rem; font-weight:700; color:var(--gl-cream); margin-bottom:.25rem; }
.gl-benefit p{ font-size:.86rem; opacity:.72; line-height:1.5; }

/* REGISTRO */
.gl-registro{ display:grid; grid-template-columns:1.1fr .9fr; gap:2rem; align-items:start; }
@media (max-width:780px){ .gl-registro{ grid-template-columns:1fr; } }
.gl-form{ display:flex; flex-direction:column; gap:.9rem; }
.gl-row2{ display:grid; grid-template-columns:1fr 1fr; gap:.9rem; }
@media (max-width:480px){ .gl-row2{ grid-template-columns:1fr; } }
.gl-field{ display:flex; flex-direction:column; gap:.35rem; }
.gl-label{ font-size:.8rem; font-weight:600; opacity:.8; }
.gl-label i{ color:var(--gl-red); font-style:normal; }
.gl-input{ background:rgba(255,255,255,.05); border:1px solid var(--gl-line); border-radius:8px; padding:11px 13px; color:var(--gl-cream); font-size:.95rem; outline:none; transition:border-color .15s; }
.gl-input:focus{ border-color:var(--gl-gold); }
.gl-file{ font-size:.85rem; color:var(--gl-cream); }
.gl-lock{ font-size:.82rem; opacity:.7; margin-top:.25rem; }
.gl-plan-mini{ display:flex; flex-direction:column; gap:.45rem; }
.gl-plan-mini-row{ display:flex; flex-wrap:wrap; gap:.5rem; }
.gl-chip{ background:rgba(255,255,255,.05); border:1px solid var(--gl-line); color:var(--gl-cream); border-radius:20px; padding:7px 13px; font-size:.82rem; font-weight:600; cursor:pointer; transition:all .15s; }
.gl-chip-on{ background:var(--gl-red); border-color:var(--gl-red); color:#fff; }
.gl-error{ background:rgba(207,20,43,.14); border:1px solid rgba(207,20,43,.5); color:#ffd7dd; padding:10px 13px; border-radius:8px; font-size:.88rem; }
.gl-submit{ margin-top:.4rem; }
.gl-fine{ font-size:.78rem; opacity:.6; line-height:1.5; }

/* CARD COLUMN */
.gl-card-col{ position:sticky; top:84px; }
@media (max-width:780px){ .gl-card-col{ position:static; } }
.gl-card-hint{ font-size:.8rem; opacity:.7; margin-bottom:.75rem; }

/* MEMBERSHIP CARD */
.gl-memcard{ width:100%; max-width:360px; aspect-ratio:1.586/1; margin:0 auto; border-radius:16px; padding:18px 20px; color:#fff; display:flex; flex-direction:column; justify-content:space-between; background:linear-gradient(135deg,#002D62 0%,#06101a 100%); border:1px solid rgba(200,168,75,.5); box-shadow:0 16px 40px rgba(0,0,0,.45); position:relative; overflow:hidden; }
.gl-memcard::after{ content:""; position:absolute; right:-40px; top:-40px; width:160px; height:160px; border-radius:50%; background:radial-gradient(circle,rgba(200,168,75,.22),transparent 70%); }
.gl-memcard-top{ display:flex; align-items:center; justify-content:space-between; }
.gl-memcard-brand{ font-size:1.15rem; font-weight:800; letter-spacing:1px; color:var(--gl-gold2); }
.gl-memcard-brand span{ color:#fff; }
.gl-memcard-chip{ width:34px; height:24px; border-radius:5px; background:linear-gradient(135deg,#e5c96a,#c8a84b); }
.gl-memcard-kicker{ font-size:.68rem; letter-spacing:1.5px; text-transform:uppercase; color:rgba(229,201,106,.9); }
.gl-memcard-body{ display:flex; align-items:center; gap:14px; }
.gl-memcard-photo{ width:56px; height:56px; border-radius:50%; flex-shrink:0; background:rgba(255,255,255,.1); border:2px solid var(--gl-gold); display:flex; align-items:center; justify-content:center; font-size:1.6rem; overflow:hidden; }
.gl-memcard-photo img{ width:100%; height:100%; object-fit:cover; }
.gl-memcard-name{ font-size:1.1rem; font-weight:800; line-height:1.15; }
.gl-memcard-plan{ font-size:.78rem; opacity:.8; margin-top:.15rem; }
.gl-memcard-foot{ display:flex; align-items:center; justify-content:space-between; font-size:.72rem; letter-spacing:.5px; opacity:.85; border-top:1px solid rgba(200,168,75,.3); padding-top:8px; }

/* SUCCESS */
.gl-success{ text-align:center; max-width:560px; }
.gl-success-box p{ opacity:.8; line-height:1.55; margin:.75rem 0 1.5rem; }
.gl-success-check{ width:60px; height:60px; margin:0 auto 1rem; border-radius:50%; background:rgba(37,211,102,.16); border:2px solid #25D366; color:#25D366; font-size:1.8rem; display:flex; align-items:center; justify-content:center; }
.gl-success .gl-print-keep{ margin:1.75rem auto 0; }
.gl-card-actions{ display:flex; gap:1rem; justify-content:center; flex-wrap:wrap; margin-top:1.75rem; }

/* FOOTER */
.gl-footer{ margin-top:clamp(48px,8vh,80px); padding:2.25rem 5vw; border-top:1px solid var(--gl-line); text-align:center; }
.gl-footer p{ font-size:.85rem; opacity:.75; margin:.2rem 0; }
.gl-footer a{ color:var(--gl-gold2); font-weight:600; }

/* PRINT: show only the membership card */
@media print{
  .gl-club{ background:#fff; }
  .gl-no-print{ display:none !important; }
  .gl-print-keep{ position:fixed; inset:0; margin:auto; display:flex; align-items:center; justify-content:center; }
  .gl-memcard{ box-shadow:none; }
}
`

'use client'

// GangaLoo — Partners page  —  route: /partners  (app/partners/page.tsx)
//
// Two tabs:
//   Mayoreo (wholesale)  — marketing for wholesale pricing. Wholesale is NOT
//                          automatic: partners contact us for a personalized
//                          quote via WhatsApp. No automatic cart discount.
//   Vendedores (sellers) — marketing + a seller APPLICATION form. On submit it
//                          calls submitSellerApplication(), which WhatsApps the
//                          full application to the owner. It does NOT create an
//                          account — the owner vets and sets sellers up by hand.

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { submitSellerApplication } from './actions'

const WA_BUSINESS = '18292867868'

const MAYOREO_STEPS = [
  { n: 1, t: 'Escríbenos', d: 'Contáctanos por WhatsApp y dinos qué productos te interesan.' },
  { n: 2, t: 'Cuéntanos cantidades', d: 'Indícanos las cantidades aproximadas que necesitas para tu negocio.' },
  { n: 3, t: 'Te cotizamos', d: 'Te enviamos un precio de mayoreo personalizado según el producto y el volumen.' },
  { n: 4, t: 'Haz tu pedido', d: 'Coordinamos el pago y la entrega o recogida. ¡Así de fácil!' },
]

const SELLER_BENEFITS = [
  { icon: '💰', t: 'Comisiones por cada venta' },
  { icon: '📦', t: 'Acceso al inventario completo' },
  { icon: '📊', t: 'Panel de vendedor' },
  { icon: '🤝', t: 'Soporte dedicado' },
]

const SELLER_STEPS = [
  { n: 1, t: 'Compras al precio regular', d: 'Como vendedor, adquieres los productos GangaLoo al precio normal de venta al público.' },
  { n: 2, t: 'Ganas comisión por cada venta', d: 'Cada mes recibes una comisión sobre todas las ventas registradas a tu nombre.' },
  { n: 3, t: 'Requisito de calificación', d: 'Durante los primeros 3 meses, califica vendiendo un mínimo de 2 productos por mes.' },
]

const ERR_ES: Record<string, string> = {
  NAME_REQUIRED: 'Escribe tu nombre y apellido.',
  EMAIL_INVALID: 'Revisa tu correo electrónico.',
  PHONE_REQUIRED: 'Escribe tu teléfono / WhatsApp.',
  CITY_REQUIRED: 'Escribe tu ciudad / provincia.',
  CHANNEL_REQUIRED: 'Indica cómo planeas vender.',
  SEND_FAILED: 'No se pudo enviar. Intenta de nuevo o escríbenos por WhatsApp.',
}

type Tab = 'mayoreo' | 'vendedores'

export default function PartnersPage() {
  useEffect(() => {
    document.title = 'GangaLoo — Mayoreo y Vendedores'
  }, [])

  const [tab, setTab] = useState<Tab>('mayoreo')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [cedula, setCedula] = useState('')
  const [city, setCity] = useState('')
  const [experience, setExperience] = useState<'si' | 'no' | ''>('')
  const [expDetail, setExpDetail] = useState('')
  const [channel, setChannel] = useState<'presencial' | 'rrss' | 'ambos' | ''>('')
  const [message, setMessage] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!firstName.trim() || !lastName.trim()) return setError(ERR_ES.NAME_REQUIRED)
    if (!email.includes('@')) return setError(ERR_ES.EMAIL_INVALID)
    if (!phone.trim()) return setError(ERR_ES.PHONE_REQUIRED)
    if (!city.trim()) return setError(ERR_ES.CITY_REQUIRED)
    if (!channel) return setError(ERR_ES.CHANNEL_REQUIRED)

    setSubmitting(true)
    try {
      const res = await submitSellerApplication({
        firstName, lastName, email, phone, city,
        cedula,
        experience: experience || undefined,
        expDetail: experience === 'si' ? expDetail : undefined,
        channel,
        message,
      })
      if (!res.ok) {
        setError(ERR_ES[res.error] ?? ERR_ES.SEND_FAILED)
        setSubmitting(false)
        return
      }
      setDone(true)
      setSubmitting(false)
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setError(ERR_ES.SEND_FAILED)
      setSubmitting(false)
    }
  }

  const waPregunta =
    `https://wa.me/${WA_BUSINESS}?text=` +
    encodeURIComponent('Hola, tengo una pregunta sobre ser Vendedor GangaLoo.')

  const waMayoreo =
    `https://wa.me/${WA_BUSINESS}?text=` +
    encodeURIComponent('Hola, me interesa comprar al por mayor en GangaLoo. ¿Me podrían dar información sobre precios?')

  return (
    <div className="gl-partners">
      <style>{styles}</style>

      <header className="gl-nav">
        <Link href="/" className="gl-brand">Ganga<span>Loo</span></Link>
        <nav className="gl-nav-links">
          <Link href="/ayuda">Cómo funciona</Link>
          <Link href="/club">Club</Link>
          <Link href="/tienda" className="gl-nav-cta">Tienda</Link>
        </nav>
      </header>

      {/* TABS */}
      <div className="gl-tabs">
        <button className={`gl-tab ${tab === 'mayoreo' ? 'on' : ''}`} onClick={() => setTab('mayoreo')}>🏷️ Mayoreo</button>
        <button className={`gl-tab ${tab === 'vendedores' ? 'on' : ''}`} onClick={() => setTab('vendedores')}>🤝 Vendedores</button>
      </div>

      {tab === 'mayoreo' ? (
        /* ===================== MAYOREO ===================== */
        <>
          <section className="gl-hero">
            <div className="gl-hero-bg" aria-hidden="true" />
            <div className="gl-hero-inner">
              <p className="gl-eyebrow">Programa Mayorista</p>
              <h1 className="gl-title">Compra al<br /><span>por mayor</span></h1>
              <p className="gl-tagline">
                ¿Compras en cantidad para tu negocio? Contáctanos y te damos
                precios especiales de mayoreo según el producto y la cantidad.
              </p>
              <div className="gl-pills">
                <span className="gl-pill">✓ Precios por volumen</span>
                <span className="gl-pill">✓ Atención personalizada</span>
                <span className="gl-pill">✓ Respuesta rápida</span>
              </div>
              <a
                className="gl-btn gl-btn-wa"
                href={waMayoreo}
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginTop: '2rem' }}
              >
                Solicitar precios por WhatsApp
              </a>
            </div>
          </section>

          <section className="gl-section">
            <h2 className="gl-h2">Cómo funciona</h2>
            <div className="gl-steps">
              {MAYOREO_STEPS.map((s) => (
                <div key={s.n} className="gl-step">
                  <span className="gl-step-n">{s.n}</span>
                  <div>
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="gl-tip">
              💡 Los precios de mayoreo se acuerdan caso por caso, según el
              producto y la cantidad que necesites. Escríbenos por WhatsApp y con
              gusto te asesoramos.
            </p>
            <div
              style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginTop: '1.5rem',
              }}
            >
              <a className="gl-btn gl-btn-wa" href={waMayoreo} target="_blank" rel="noopener noreferrer">
                Escríbenos por WhatsApp
              </a>
              <Link className="gl-btn gl-btn-ghost" href="/tienda">Ver productos</Link>
            </div>
          </section>
        </>
      ) : done ? (
        /* ===================== SELLER SUCCESS ===================== */
        <section className="gl-section gl-success">
          <div className="gl-success-check">✓</div>
          <h1 className="gl-h2" style={{ marginBottom: '.5rem' }}>¡Solicitud enviada!</h1>
          <p>
            Recibimos tu solicitud para ser Vendedor GangaLoo. Te contactaremos pronto por
            WhatsApp o correo para los siguientes pasos.
          </p>
          <div className="gl-success-actions">
            <a className="gl-btn gl-btn-wa" href={waPregunta} target="_blank" rel="noopener noreferrer">
              Escríbenos por WhatsApp
            </a>
            <Link className="gl-btn gl-btn-ghost" href="/tienda">Ir a la tienda</Link>
          </div>
        </section>
      ) : (
        /* ===================== VENDEDORES ===================== */
        <>
          <section className="gl-hero">
            <div className="gl-hero-bg" aria-hidden="true" />
            <div className="gl-hero-inner">
              <p className="gl-eyebrow">Ser Vendedor</p>
              <h1 className="gl-title">Vende y <span>gana</span></h1>
              <p className="gl-tagline">
                Únete a nuestra red y gana comisiones vendiendo los mejores productos de
                extensiones y pelucas de cabello.
              </p>
            </div>
          </section>

          <section className="gl-section">
            <div className="gl-benefits">
              {SELLER_BENEFITS.map((b) => (
                <div key={b.t} className="gl-benefit"><span>{b.icon}</span><p>{b.t}</p></div>
              ))}
            </div>

            <h2 className="gl-h2" style={{ marginTop: '2.5rem' }}>¿Cómo funciona?</h2>
            <div className="gl-steps">
              {SELLER_STEPS.map((s) => (
                <div key={s.n} className="gl-step">
                  <span className="gl-step-n">{s.n}</span>
                  <div>
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="gl-tip">
              📞 ¿Tienes preguntas? <a href={waPregunta} target="_blank" rel="noopener noreferrer">Escríbenos por WhatsApp</a> antes de aplicar y con gusto te explicamos todo.
            </p>
          </section>

          <section className="gl-section">
            <h2 className="gl-h2">📋 Solicitud de Vendedor</h2>
            <form className="gl-form" onSubmit={onSubmit}>
              <div className="gl-row2">
                <Field label="Nombre" value={firstName} onChange={setFirstName} required />
                <Field label="Apellido" value={lastName} onChange={setLastName} required />
              </div>
              <Field label="Correo electrónico" value={email} onChange={setEmail} required type="email" />
              <div className="gl-row2">
                <Field label="Teléfono / WhatsApp" value={phone} onChange={setPhone} required inputMode="tel" />
                <Field label="Cédula / Pasaporte (opcional)" value={cedula} onChange={setCedula} />
              </div>
              <Field label="Ciudad / Provincia" value={city} onChange={setCity} required />

              <div className="gl-field">
                <span className="gl-label">¿Tienes experiencia vendiendo extensiones?</span>
                <div className="gl-radios">
                  <button type="button" className={`gl-radio ${experience === 'si' ? 'on' : ''}`} onClick={() => setExperience('si')}>Sí, tengo experiencia</button>
                  <button type="button" className={`gl-radio ${experience === 'no' ? 'on' : ''}`} onClick={() => setExperience('no')}>No, soy nuevo</button>
                </div>
              </div>
              {experience === 'si' && (
                <label className="gl-field">
                  <span className="gl-label">Describe tu experiencia</span>
                  <textarea className="gl-input" rows={3} value={expDetail} onChange={(e) => setExpDetail(e.target.value)} placeholder="Dónde vendiste, cuánto tiempo, qué productos…" />
                </label>
              )}

              <div className="gl-field">
                <span className="gl-label">¿Cómo planeas vender? <i>*</i></span>
                <div className="gl-radios">
                  <button type="button" className={`gl-radio ${channel === 'presencial' ? 'on' : ''}`} onClick={() => setChannel('presencial')}>Presencial</button>
                  <button type="button" className={`gl-radio ${channel === 'rrss' ? 'on' : ''}`} onClick={() => setChannel('rrss')}>Redes sociales</button>
                  <button type="button" className={`gl-radio ${channel === 'ambos' ? 'on' : ''}`} onClick={() => setChannel('ambos')}>Ambos</button>
                </div>
              </div>

              <label className="gl-field">
                <span className="gl-label">Mensaje adicional (opcional)</span>
                <textarea className="gl-input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="¿Algo más que quieras contarnos?" />
              </label>

              {error && <p className="gl-error">{error}</p>}

              <button className="gl-btn gl-btn-primary gl-submit" type="submit" disabled={submitting}>
                {submitting ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </form>
          </section>
        </>
      )}

      <footer className="gl-footer">
        <p>¿Preguntas? <a href={`https://wa.me/${WA_BUSINESS}`} target="_blank" rel="noopener noreferrer">Escríbenos por WhatsApp</a></p>
        <p style={{ opacity: 0.5 }}>© {new Date().getFullYear()} GangaLoo</p>
      </footer>
    </div>
  )
}

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
      <span className="gl-label">{props.label}{props.required && <i> *</i>}</span>
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

const styles = `
.gl-partners{
  --gl-navy:#002D62; --gl-navy2:#1a4a8a; --gl-ink:#06101a;
  --gl-red:#CF142B; --gl-gold:#c8a84b; --gl-gold2:#e5c96a;
  --gl-cream:#f0f4ff; --gl-line:rgba(200,168,75,.25);
  background:var(--gl-ink); color:var(--gl-cream); min-height:100vh; width:100%;
}
.gl-partners a{ text-decoration:none; color:inherit; }
.gl-partners h1,.gl-partners h2,.gl-partners h3{ line-height:1.08; letter-spacing:-.01em; }

.gl-nav{ position:sticky; top:0; z-index:50; display:flex; align-items:center; justify-content:space-between; padding:0 5vw; height:64px; background:rgba(6,16,26,.85); backdrop-filter:blur(12px); border-bottom:1px solid var(--gl-line); }
.gl-brand{ font-size:1.5rem; font-weight:800; letter-spacing:1px; color:var(--gl-gold); }
.gl-brand span{ color:var(--gl-cream); }
.gl-nav-links{ display:flex; align-items:center; gap:1.5rem; }
.gl-nav-links a{ font-size:.85rem; font-weight:600; text-transform:uppercase; letter-spacing:.5px; opacity:.85; transition:opacity .15s,color .15s; }
.gl-nav-links a:hover{ opacity:1; color:var(--gl-gold2); }
.gl-nav-cta{ background:var(--gl-red); color:#fff !important; padding:9px 18px; border-radius:3px; opacity:1 !important; }
.gl-nav-cta:hover{ background:#a50f22; }
@media (max-width:560px){ .gl-nav-links a:not(.gl-nav-cta){ display:none; } }

.gl-tabs{ display:flex; gap:.5rem; justify-content:center; padding:1.25rem 5vw 0; flex-wrap:wrap; }
.gl-tab{ background:rgba(255,255,255,.04); border:1px solid var(--gl-line); color:var(--gl-cream); border-radius:99px; padding:10px 22px; font-size:.92rem; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
.gl-tab:hover{ border-color:var(--gl-gold); }
.gl-tab.on{ background:var(--gl-red); border-color:var(--gl-red); color:#fff; }

.gl-hero{ position:relative; overflow:hidden; background:var(--gl-navy); padding:clamp(48px,11vh,100px) 5vw clamp(40px,8vh,80px); text-align:center; margin-top:1.25rem; }
.gl-hero-bg{ position:absolute; inset:0; background:radial-gradient(ellipse 70% 60% at 60% 30%, rgba(26,74,138,.55) 0%, transparent 70%), radial-gradient(ellipse 50% 50% at 10% 100%, rgba(207,20,43,.25) 0%, transparent 60%), radial-gradient(ellipse 45% 45% at 95% 0%, rgba(200,168,75,.2) 0%, transparent 60%); }
.gl-hero-inner{ position:relative; max-width:720px; margin:0 auto; }
.gl-eyebrow{ font-size:.78rem; font-weight:600; letter-spacing:2.5px; text-transform:uppercase; color:var(--gl-gold2); margin-bottom:1rem; }
.gl-title{ font-size:clamp(2.2rem,8vw,4.2rem); font-weight:800; color:var(--gl-gold); margin:0; }
.gl-title span{ color:var(--gl-cream); }
.gl-tagline{ font-size:clamp(1rem,2.4vw,1.2rem); max-width:540px; margin:1.25rem auto 0; opacity:.85; line-height:1.5; }
.gl-pills{ display:flex; gap:.6rem; justify-content:center; flex-wrap:wrap; margin-top:1.5rem; }
.gl-pill{ font-size:.8rem; font-weight:600; background:rgba(255,255,255,.06); border:1px solid var(--gl-line); padding:7px 14px; border-radius:99px; }

.gl-btn{ display:inline-flex; align-items:center; justify-content:center; gap:.5rem; padding:14px 28px; border-radius:4px; font-size:.95rem; font-weight:700; cursor:pointer; border:none; transition:transform .15s,background .15s; }
.gl-btn:hover{ transform:translateY(-2px); }
.gl-btn:disabled{ opacity:.6; cursor:default; transform:none; }
.gl-btn-primary{ background:var(--gl-red); color:#fff; box-shadow:0 8px 24px rgba(207,20,43,.35); }
.gl-btn-primary:hover{ background:#a50f22; }
.gl-btn-ghost{ background:transparent; color:var(--gl-cream); border:1px solid var(--gl-line); }
.gl-btn-ghost:hover{ border-color:var(--gl-gold); color:var(--gl-gold2); }
.gl-btn-wa{ background:#25D366; color:#fff; box-shadow:0 8px 24px rgba(37,211,102,.3); }
.gl-btn-wa:hover{ background:#1da855; }

.gl-section{ max-width:880px; margin:0 auto; padding:clamp(40px,7vh,68px) 5vw 0; }
.gl-h2{ font-size:clamp(1.4rem,4vw,2rem); font-weight:700; color:var(--gl-cream); margin-bottom:1.5rem; position:relative; padding-bottom:.6rem; }
.gl-h2::after{ content:""; position:absolute; left:0; bottom:0; width:48px; height:3px; background:var(--gl-red); border-radius:2px; }

.gl-steps{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:1rem; }
.gl-step{ display:flex; gap:.9rem; padding:1.25rem; border-radius:12px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); }
.gl-step-n{ flex-shrink:0; width:30px; height:30px; border-radius:50%; background:var(--gl-red); color:#fff; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:.9rem; }
.gl-step h3{ font-size:1rem; font-weight:700; color:var(--gl-cream); margin-bottom:.25rem; }
.gl-step p{ font-size:.86rem; opacity:.72; line-height:1.5; }
.gl-tip{ margin-top:1.5rem; font-size:.88rem; line-height:1.55; opacity:.85; background:rgba(200,168,75,.08); border:1px solid var(--gl-line); border-radius:10px; padding:1rem 1.1rem; }
.gl-tip a{ color:var(--gl-gold2); font-weight:600; }

.gl-benefits{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1rem; }
.gl-benefit{ display:flex; align-items:center; gap:.7rem; padding:1rem 1.1rem; border-radius:12px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); }
.gl-benefit span{ font-size:1.4rem; }
.gl-benefit p{ font-size:.9rem; font-weight:600; }

.gl-form{ display:flex; flex-direction:column; gap:.9rem; max-width:560px; }
.gl-row2{ display:grid; grid-template-columns:1fr 1fr; gap:.9rem; }
@media (max-width:480px){ .gl-row2{ grid-template-columns:1fr; } }
.gl-field{ display:flex; flex-direction:column; gap:.35rem; }
.gl-label{ font-size:.8rem; font-weight:600; opacity:.8; }
.gl-label i{ color:var(--gl-red); font-style:normal; }
.gl-input{ background:rgba(255,255,255,.05); border:1px solid var(--gl-line); border-radius:8px; padding:11px 13px; color:var(--gl-cream); font-size:.95rem; outline:none; font-family:inherit; transition:border-color .15s; }
.gl-input:focus{ border-color:var(--gl-gold); }
.gl-radios{ display:flex; flex-wrap:wrap; gap:.5rem; }
.gl-radio{ background:rgba(255,255,255,.05); border:1px solid var(--gl-line); color:var(--gl-cream); border-radius:99px; padding:9px 16px; font-size:.85rem; font-weight:600; cursor:pointer; font-family:inherit; transition:all .15s; }
.gl-radio.on{ background:var(--gl-red); border-color:var(--gl-red); color:#fff; }
.gl-error{ background:rgba(207,20,43,.14); border:1px solid rgba(207,20,43,.5); color:#ffd7dd; padding:10px 13px; border-radius:8px; font-size:.88rem; }
.gl-submit{ margin-top:.4rem; align-self:flex-start; }

.gl-success{ text-align:center; max-width:540px; }
.gl-success p{ opacity:.8; line-height:1.55; margin:.5rem 0 1.5rem; }
.gl-success-check{ width:60px; height:60px; margin:0 auto 1rem; border-radius:50%; background:rgba(37,211,102,.16); border:2px solid #25D366; color:#25D366; font-size:1.8rem; display:flex; align-items:center; justify-content:center; }
.gl-success-actions{ display:flex; gap:1rem; justify-content:center; flex-wrap:wrap; }

.gl-footer{ margin-top:clamp(48px,8vh,80px); padding:2.25rem 5vw; border-top:1px solid var(--gl-line); text-align:center; }
.gl-footer p{ font-size:.85rem; opacity:.75; margin:.2rem 0; }
.gl-footer a{ color:var(--gl-gold2); font-weight:600; }
`

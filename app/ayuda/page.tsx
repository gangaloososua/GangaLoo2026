// GangaLoo "¿Cómo funciona?" / help center  —  route: /ayuda  (app/ayuda/page.tsx)
// Server component, no client JS. FAQ uses native <details>. Mobile-first.
//
// LINKS:
//  - store        -> /tienda  (new store)
//  - seller/mayoreo forms -> OLD site (those stay on the old setup for now)
//  - AliExpress page was NOT migrated -> points to old site (flagged to owner)
//
// Content carried over from the old ayuda.html. A few specifics (two-part 20%
// financing, Club perks, RD$200 delivery fee) are copied as-was — verify they
// still match the new store before relying on them.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "¿Cómo funciona GangaLoo? — Guía completa",
  description:
    "Guía paso a paso de GangaLoo: cómo crear tu cuenta, comprar, pagar, dar seguimiento a pedidos, ser vendedora, mayoreo y el Club GangaLoo.",
};

// Old site base — seller/mayoreo forms + AliExpress page still live here for now.
const WA = (text: string) =>
  `https://wa.me/18292867868?text=${encodeURIComponent(text)}`;

export default function AyudaPage() {
  return (
    <div className="gl-ayuda">
      <style>{styles}</style>

      {/* NAV */}
      <nav className="ay-nav">
        <Link href="/" className="ay-logo">
          Ganga<span>Loo</span>
        </Link>
        <div className="ay-nav-links">
          <Link href="/">Inicio</Link>
          <Link href="/tienda" className="ay-nav-cta">
            🛍 Tienda
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <header className="ay-hero">
        <div className="ay-hero-inner">
          <p className="ay-hero-tag">Centro de Ayuda</p>
          <h1>
            ¿Cómo funciona <em>GangaLoo</em>?
          </h1>
          <p className="ay-hero-sub">
            Aquí te explicamos todo paso a paso, de forma sencilla. Si tienes
            dudas, escríbenos por WhatsApp.
          </p>
          <a
            className="ay-hero-wa"
            href={WA("Hola, tengo una pregunta sobre GangaLoo")}
            target="_blank"
            rel="noopener noreferrer"
          >
            💬 Escríbenos por WhatsApp
          </a>
        </div>
      </header>

      {/* QUICK NAV (swipeable on mobile) */}
      <div className="ay-quicknav">
        <a href="#registro">📝 Registro</a>
        <a href="#comprar">🛒 Comprar</a>
        <a href="#pago">💳 Pago</a>
        <a href="#pedidos">📦 Pedidos</a>
        <a href="#vendedor">🤝 Vendedor</a>
        <a href="#mayoreo">🏷️ Mayoreo</a>
        <a href="#club">🏆 Club</a>
        <a href="#faq">❓ Preguntas</a>
      </div>

      {/* 1 · REGISTRO */}
      <section id="registro" className="ay-section">
        <SectionHdr n={1} title="Cómo crear tu cuenta" />
        <div className="ay-steps">
          <Step n={1} title="Entra a nuestra tienda">
            Ve a la tienda desde tu celular o computadora.
          </Step>
          <Step n={2} title='Haz clic en "Iniciar Sesión"'>
            Verás el botón en la parte de arriba de la página. Si no tienes
            cuenta aún, selecciona <strong>"Crear Cuenta"</strong>.
          </Step>
          <Step
            n={3}
            title="Llena el formulario"
            tip="Usa un correo que revises seguido — te enviaremos confirmaciones de pedido ahí."
          >
            Ingresa tu <strong>nombre completo</strong>, tu{" "}
            <strong>número de WhatsApp</strong> y tu{" "}
            <strong>correo electrónico</strong>. Crea una contraseña de al menos
            6 caracteres.
          </Step>
          <Step n={4} title="¡Listo! Ya tienes tu cuenta">
            Con tu cuenta puedes ver los precios completos, hacer pedidos y
            llevar el control de tus compras.
          </Step>
        </div>
        <InfoBox tone="blue" title="🔑 ¿Olvidaste tu contraseña?">
          En la pantalla de inicio de sesión haz clic en{" "}
          <strong>"¿Olvidaste tu contraseña?"</strong>, ingresa tu correo y te
          enviamos un enlace para crear una nueva contraseña.
        </InfoBox>
      </section>

      <hr className="ay-divider" />

      {/* 2 · COMPRAR */}
      <section id="comprar" className="ay-section">
        <SectionHdr n={2} title="Cómo comprar en la tienda" />
        <div className="ay-steps">
          <Step n={1} title="Explora los productos">
            Navega por las categorías. Puedes filtrar por sucursal (Sosúa o
            Montellano) o buscar por nombre.
          </Step>
          <Step
            n={2}
            title="Agrega al carrito"
            tip="El ícono del carrito 🛒 en la parte de arriba te muestra cuántos productos tienes."
          >
            Haz clic en el botón <strong>"+"</strong> en el producto que
            quieres. Puedes agregar varios productos al mismo tiempo.
          </Step>
          <Step n={3} title="Revisa tu carrito">
            Haz clic en el carrito para ver todo lo que seleccionaste. Puedes
            cambiar cantidades o eliminar productos.
          </Step>
          <Step n={4} title="Haz tu pedido">
            Cuando estés lista, haz clic en <strong>"Hacer Pedido"</strong>.
            Elige cómo quieres pagar y confirma.
          </Step>
        </div>
        <InfoBox tone="blue" title="📦 ¿Cómo recibo mis productos?">
          <ul>
            <li>Recogida en tienda en Sosúa o Montellano.</li>
            <li>Entrega a domicilio disponible (costo adicional).</li>
            <li>Te avisamos por WhatsApp cuando tu pedido está listo.</li>
          </ul>
        </InfoBox>
      </section>

      <hr className="ay-divider" />

      {/* 3 · PAGO */}
      <section id="pago" className="ay-section">
        <SectionHdr n={3} title="Cómo pagar tu pedido" />
        <InfoBox tone="green" title="✅ Opciones de pago disponibles">
          <ul>
            <li>
              <strong>Efectivo</strong> — en tienda al recoger tu pedido.
            </li>
            <li>
              <strong>Transferencia bancaria</strong> — te damos los datos por
              WhatsApp.
            </li>
            <li>
              <strong>Tarjeta de crédito/débito</strong> — disponible en línea.
            </li>
            <li>
              <strong>PayPal</strong> — disponible en línea.
            </li>
          </ul>
        </InfoBox>
        <InfoBox tone="gold" title="💰 Pago en dos partes (opcional)">
          Si no puedes pagar todo de una vez, puedes pagar una parte por
          adelantado para confirmar tu pedido y el resto cuando recoges. Pregunta
          por los detalles al hacer tu pedido.
        </InfoBox>
      </section>

      <hr className="ay-divider" />

      {/* 4 · PEDIDOS */}
      <section id="pedidos" className="ay-section">
        <SectionHdr n={4} title="Seguimiento de pedidos" />
        <div className="ay-steps">
          <Step n={1} title="⏳ Pendiente">
            Tu pedido fue recibido y estamos preparándolo. Te contactamos pronto
            para coordinar.
          </Step>
          <Step n={2} title="✅ Listo para recoger">
            Tu pedido está listo. Te avisamos por WhatsApp con los detalles de
            dónde y cuándo recoger.
          </Step>
          <Step n={3} title="📦 Entregado">
            Recibiste tu pedido. ¡Gracias por tu compra!
          </Step>
        </div>
        <InfoBox tone="blue" title="👤 Ver mis pedidos">
          Inicia sesión en la tienda → toca tu nombre en la parte superior →
          selecciona <strong>"Mis Pedidos"</strong> para ver el estado de todas
          tus compras.
        </InfoBox>
      </section>

      <hr className="ay-divider" />

      {/* 5 · VENDEDOR */}
      <section id="vendedor" className="ay-section">
        <SectionHdr n={5} title="Cómo ser Vendedora GangaLoo" />
        <InfoBox tone="gold" title="💡 ¿Qué es ser vendedora GangaLoo?">
          Como vendedora, compras los productos al precio normal y los vendes a
          tus clientas. Al final de cada mes recibes una comisión sobre todas las
          ventas registradas a tu nombre. ¡Ganas dinero sin tener que comprar
          inventario por adelantado!
        </InfoBox>
        <div className="ay-steps">
          <Step n={1} title="Llena la solicitud">
            Ve a{" "}
            <a href="/partners">
              la solicitud de vendedores
            </a>{" "}
            y llena el formulario con tus datos.
          </Step>
          <Step n={2} title="Esperamos tu aprobación">
            Revisamos tu solicitud y te contactamos por WhatsApp en máximo 48
            horas.
          </Step>
          <Step
            n={3}
            title="Crea tu cuenta"
            tip="Usa el mismo correo que pusiste en la solicitud."
          >
            Si eres aprobada, recibirás un correo para confirmar tu cuenta.
            Luego usa <strong>"¿Olvidaste tu contraseña?"</strong> en la tienda
            para crear tu contraseña de acceso.
          </Step>
          <Step n={4} title="Empieza a vender">
            Una vez dentro, tienes acceso a tu panel de vendedora donde puedes
            ver tus ventas, tu inventario disponible y tus comisiones acumuladas.
          </Step>
        </div>
        <InfoBox tone="red" title="📋 Requisito de los primeros 3 meses">
          Durante los primeros 3 meses debes comprar un mínimo de 2 productos por
          mes para mantenerte activa como vendedora. Después de los 3 meses no
          hay mínimo obligatorio.
        </InfoBox>
      </section>

      <hr className="ay-divider" />

      {/* 6 · MAYOREO */}
      <section id="mayoreo" className="ay-section">
        <SectionHdr n={6} title="Compras al por mayor (Mayoreo)" />
        <InfoBox tone="gold" title="🏷️ ¿Qué es el mayoreo?">
          Si compras varios productos a la vez, obtienes un descuento. Ideal para
          revendedoras o salones de belleza.
        </InfoBox>
        <div className="ay-steps">
          <Step n={1} title="Agrega varios productos al carrito">
            El descuento se aplica cuando tu carrito alcanza la cantidad mínima
            requerida.
          </Step>
          <Step n={2} title="Ve el descuento aplicado">
            En el carrito verás el descuento de mayoreo con el porcentaje de
            ahorro.
          </Step>
          <Step n={3} title="O aplica como mayorista">
            Para precios de mayoreo permanentes y condiciones especiales, ve a{" "}
            <a href="/partners">
              la solicitud de mayorista
            </a>
            .
          </Step>
        </div>
      </section>

      <hr className="ay-divider" />

      {/* 7 · CLUB */}
      <section id="club" className="ay-section">
        <SectionHdr n={7} title="Club GangaLoo 🏆" />
        <InfoBox tone="gold" title="👑 ¿Qué es el Club GangaLoo?">
          El Club GangaLoo es nuestro programa de membresía premium para clientas
          frecuentes. Con tu membresía obtienes beneficios exclusivos que no
          están disponibles para clientas regulares.
        </InfoBox>
        <InfoBox tone="green" title="✨ Beneficios de ser miembro Club">
          <ul>
            <li>
              <strong>Envío gratis</strong> en todas tus órdenes.
            </li>
            <li>
              <strong>Descuento adicional</strong> en todos los productos.
            </li>
            <li>
              <strong>Tarjeta de débito gratis</strong> — aplican cargos por
              transacción.
            </li>
            <li>Acceso a ofertas exclusivas antes que nadie.</li>
            <li>Atención prioritaria por WhatsApp.</li>
          </ul>
        </InfoBox>
        <div className="ay-club-cta">
          <a
            className="ay-hero-wa"
            href={WA("Hola, quiero información sobre el Club GangaLoo")}
            target="_blank"
            rel="noopener noreferrer"
          >
            💬 Preguntar sobre el Club por WhatsApp
          </a>
        </div>
      </section>

      <hr className="ay-divider" />

      {/* 8 · FAQ */}
      <section id="faq" className="ay-section">
        <SectionHdr n={8} title="Preguntas frecuentes" />
        <div className="ay-faq">
          <Faq q="¿Tienen tienda física? ¿Dónde están ubicados?">
            Sí, tenemos dos ubicaciones: <strong>Sosúa</strong> y{" "}
            <strong>Montellano</strong>, Puerto Plata. Puedes pasar a recoger tu
            pedido en cualquiera de las dos. Escríbenos por WhatsApp para
            confirmar el horario.
          </Faq>
          <Faq q="¿Puedo pedir sin crear una cuenta?">
            Puedes ver los productos sin cuenta, pero para ver los precios
            completos y hacer pedidos necesitas crear una cuenta gratuita. Solo
            toma un minuto.
          </Faq>
          <Faq q="¿Cuánto tiempo tarda en llegar mi pedido?">
            Los productos en stock están disponibles inmediatamente para recoger
            en tienda. Si el producto viene de pedido especial, te avisamos el
            tiempo de espera por WhatsApp.
          </Faq>
          <Faq q="¿Puedo devolver un producto?">
            Si el producto tiene un defecto de fábrica, lo cambiamos sin problema.
            Contáctanos lo antes posible después de recibirlo. Para cambios por
            otro motivo, evaluamos caso por caso. Escríbenos por WhatsApp.
          </Faq>
          <Faq q="¿Cómo sé si un producto está en stock?">
            En la tienda online puedes ver la disponibilidad de cada producto. Si
            dice "Disponible" está en stock; si dice "Agotado" no hay unidades en
            ese momento.
          </Faq>
          <Faq q="¿Puedo pagar a plazos?">
            Sí. Puedes pagar una parte ahora para reservar tu pedido y el resto
            cuando lo recoges. Pregúntanos los detalles al hacer tu pedido.
          </Faq>
          <Faq q="¿Cómo me convierto en vendedora?">
            Llena el formulario de vendedores y te contactamos en máximo 48 horas
            para revisar tu solicitud. Ver más detalles arriba ↑
          </Faq>
          <Faq q="¿Tienen WhatsApp para dudas?">
            ¡Sí! Escríbenos al <strong>+1 (829) 286-7868</strong> y con gusto te
            ayudamos. También puedes usar el botón verde flotante 💬.
          </Faq>
        </div>
      </section>

      {/* CTA CARDS */}
      <section className="ay-section">
        <div className="ay-cta-head">
          <h2>¿Lista para empezar? 🌟</h2>
          <p>
            Explora nuestra tienda, crea tu cuenta y empieza a disfrutar de los
            mejores productos de extensiones en República Dominicana.
          </p>
        </div>
        <div className="ay-cta-grid">
          <Link href="/tienda" className="ay-cta-card">
            <span className="ico">🛍️</span>
            <h3>Ir a la Tienda</h3>
            <p>Explora todos nuestros productos disponibles</p>
            <span className="btn">Ver productos →</span>
          </Link>
          <a href="/partners" className="ay-cta-card">
            <span className="ico">🤝</span>
            <h3>Ser Vendedora</h3>
            <p>Aplica para unirte a nuestro equipo de vendedoras</p>
            <span className="btn">Aplicar ahora →</span>
          </a>
          <Link href="/cotizador" className="ay-cta-card">
            <span className="ico">🧮</span>
            <h3>Cotizador</h3>
            <p>Calcula el precio de tu pedido al instante</p>
            <span className="btn">Calcular →</span>
          </Link>
          <a href={WA("Hola, tengo una duda")} target="_blank" rel="noopener noreferrer" className="ay-cta-card">
            <span className="ico">💬</span>
            <h3>WhatsApp</h3>
            <p>¿Tienes dudas? Escríbenos directamente</p>
            <span className="btn">Escribir →</span>
          </a>
        </div>
      </section>

      {/* FLOATING WA */}
      <a
        className="ay-wa-float"
        href={WA("Hola, tengo una pregunta")}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Escríbenos por WhatsApp"
      >
        💬
      </a>

      <footer className="ay-footer">
        <p className="ay-footer-links">
          <Link href="/returns">Política de Devoluciones</Link>
        </p>
        <p>© {new Date().getFullYear()} GangaLoo · Sosúa, Puerto Plata, Rep. Dom.</p>
      </footer>
    </div>
  );
}

/* ---------- small presentational helpers ---------- */

function SectionHdr({ n, title }: { n: number; title: string }) {
  return (
    <div className="ay-sec-hdr">
      <span className="ay-sec-num">{n}</span>
      <h2>{title}</h2>
    </div>
  );
}

function Step({
  n,
  title,
  tip,
  children,
}: {
  n: number;
  title: string;
  tip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ay-step">
      <span className="ay-step-num">{n}</span>
      <div className="ay-step-body">
        <h3>{title}</h3>
        <p>{children}</p>
        {tip && <div className="ay-tip">💡 {tip}</div>}
      </div>
    </div>
  );
}

function InfoBox({
  tone,
  title,
  children,
}: {
  tone: "blue" | "green" | "red" | "gold";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`ay-info ${tone}`}>
      <h3>{title}</h3>
      <div className="ay-info-body">{children}</div>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="ay-faq-item">
      <summary>
        <span>{q}</span>
        <span className="ay-faq-arrow">▼</span>
      </summary>
      <div className="ay-faq-a">{children}</div>
    </details>
  );
}

const styles = `
.gl-ayuda{
  --brand:#002D62; --red:#CF142B; --gold:#c8a84b; --cream:#faf8f5;
  --text:#002D62; --muted:#6b7280; --border:#e5e7eb; --white:#fff;
  background:var(--cream); color:var(--text); min-height:100vh;
  font-feature-settings:"liga" 1;
}
.gl-ayuda *{ box-sizing:border-box; }
.gl-ayuda a{ color:inherit; }
.gl-ayuda h1,.gl-ayuda h2,.gl-ayuda h3{ line-height:1.2; }

/* NAV */
.ay-nav{ position:sticky; top:0; z-index:100; background:var(--brand); color:#fff;
  height:56px; padding:0 5vw; display:flex; align-items:center; justify-content:space-between;
  box-shadow:0 2px 12px rgba(0,0,0,.2); }
.ay-logo{ font-size:1.3rem; font-weight:800; letter-spacing:.5px; text-decoration:none; color:#fff; }
.ay-logo span{ color:var(--gold); }
.ay-nav-links{ display:flex; align-items:center; gap:14px; font-size:.85rem; }
.ay-nav-links a{ color:rgba(255,255,255,.85); text-decoration:none; transition:color .15s; }
.ay-nav-links a:hover{ color:#fff; }
.ay-nav-cta{ background:var(--red); padding:7px 14px; border-radius:20px; color:#fff !important; font-weight:700; }

/* HERO */
.ay-hero{ background:linear-gradient(135deg,var(--brand) 0%,#1a4a8a 100%); color:#fff;
  padding:clamp(44px,8vw,64px) 5vw clamp(36px,6vw,52px); text-align:center; }
.ay-hero-inner{ max-width:560px; margin:0 auto; }
.ay-hero-tag{ font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.15em; opacity:.7; margin-bottom:12px; }
.ay-hero h1{ font-size:clamp(2rem,7vw,3rem); font-weight:800; margin-bottom:14px; }
.ay-hero h1 em{ color:var(--gold); font-style:normal; }
.ay-hero-sub{ opacity:.85; font-size:.98rem; line-height:1.7; margin-bottom:26px; }
.ay-hero-wa{ display:inline-flex; align-items:center; gap:8px; background:#25D366; color:#fff;
  padding:12px 24px; border-radius:30px; font-weight:700; font-size:.9rem; text-decoration:none;
  transition:transform .15s,box-shadow .15s; }
.ay-hero-wa:hover{ transform:translateY(-2px); box-shadow:0 8px 24px rgba(37,211,102,.4); }

/* QUICK NAV — swipeable on mobile */
.ay-quicknav{ position:sticky; top:56px; z-index:90; background:var(--white);
  border-bottom:1px solid var(--border); padding:0 5vw; overflow-x:auto; white-space:nowrap;
  -webkit-overflow-scrolling:touch; scrollbar-width:none; }
.ay-quicknav::-webkit-scrollbar{ display:none; }
.ay-quicknav a{ display:inline-block; padding:14px 14px; font-size:.82rem; font-weight:600;
  color:var(--muted); text-decoration:none; border-bottom:2px solid transparent; transition:color .15s,border-color .15s; }
.ay-quicknav a:hover{ color:var(--brand); border-bottom-color:var(--red); }

/* SECTIONS */
.ay-section{ padding:clamp(36px,6vw,50px) 5vw; max-width:820px; margin:0 auto; scroll-margin-top:108px; }
.ay-sec-hdr{ display:flex; align-items:center; gap:12px; margin-bottom:24px; }
.ay-sec-num{ width:36px; height:36px; border-radius:50%; background:var(--red); color:#fff;
  font-weight:800; font-size:.9rem; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
.ay-sec-hdr h2{ font-size:clamp(1.5rem,5vw,1.9rem); font-weight:700; }

/* STEPS */
.ay-steps{ display:flex; flex-direction:column; gap:14px; }
.ay-step{ display:flex; gap:14px; align-items:flex-start; background:var(--white);
  border:1px solid var(--border); border-radius:14px; padding:16px 18px; transition:box-shadow .15s; }
.ay-step:hover{ box-shadow:0 4px 16px rgba(0,45,98,.08); }
.ay-step-num{ width:32px; height:32px; border-radius:50%;
  background:linear-gradient(135deg,var(--brand),#1a4a8a); color:#fff; font-weight:800; font-size:.85rem;
  display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.ay-step-body h3{ font-size:.96rem; font-weight:700; margin-bottom:4px; color:var(--brand); }
.ay-step-body p{ font-size:.9rem; color:#374151; line-height:1.65; }
.ay-step-body a{ color:var(--red); font-weight:600; text-decoration:underline; }
.ay-tip{ margin-top:8px; background:#f0f4ff; border-left:3px solid var(--brand);
  padding:8px 12px; border-radius:0 8px 8px 0; font-size:.82rem; color:var(--brand); }

/* INFO BOXES */
.ay-info{ border-radius:14px; padding:18px 22px; margin-top:16px; }
.ay-info h3{ font-size:.96rem; font-weight:700; margin-bottom:8px; }
.ay-info-body, .ay-info-body p, .ay-info-body li{ font-size:.9rem; color:#374151; line-height:1.7; }
.ay-info-body ul{ padding-left:18px; margin:0; }
.ay-info-body li{ margin-bottom:4px; }
.ay-info-body a{ color:var(--red); font-weight:600; text-decoration:underline; }
.ay-info.blue{ background:linear-gradient(135deg,#f0f4ff,#e8eeff); border:1px solid #c7d2fe; }
.ay-info.green{ background:linear-gradient(135deg,#f0fdf4,#dcfce7); border:1px solid #86efac; }
.ay-info.red{ background:linear-gradient(135deg,#fff5f5,#fee2e2); border:1px solid #fca5a5; }
.ay-info.gold{ background:linear-gradient(135deg,#fffbeb,#fef3c7); border:1px solid #fde68a; }

/* CLUB CTA */
.ay-club-cta{ margin-top:18px; text-align:center; }

/* FAQ — native details/summary */
.ay-faq{ display:flex; flex-direction:column; gap:10px; }
.ay-faq-item{ background:var(--white); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
.ay-faq-item summary{ list-style:none; cursor:pointer; padding:15px 18px; font-size:.92rem;
  font-weight:600; color:var(--text); display:flex; justify-content:space-between; align-items:center; gap:12px; }
.ay-faq-item summary::-webkit-details-marker{ display:none; }
.ay-faq-item summary:hover{ background:#fafaf9; }
.ay-faq-arrow{ font-size:.9rem; transition:transform .2s; flex-shrink:0; color:var(--muted); }
.ay-faq-item[open] .ay-faq-arrow{ transform:rotate(180deg); }
.ay-faq-a{ padding:0 18px 16px; font-size:.88rem; color:var(--muted); line-height:1.7; }
.ay-faq-a a{ color:var(--red); }

/* DIVIDER */
.ay-divider{ border:none; border-top:1px solid var(--border); margin:0; max-width:820px; margin-inline:auto; }

/* CTA CARDS */
.ay-cta-head{ text-align:center; margin-bottom:24px; }
.ay-cta-head h2{ font-size:clamp(1.5rem,5vw,1.9rem); font-weight:700; margin-bottom:8px; }
.ay-cta-head p{ font-size:.92rem; color:var(--muted); line-height:1.6; max-width:520px; margin:0 auto; }
.ay-cta-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; }
.ay-cta-card{ background:var(--white); border:1.5px solid var(--border); border-radius:14px; padding:22px;
  text-align:center; text-decoration:none; color:var(--text); display:flex; flex-direction:column;
  align-items:center; gap:8px; transition:transform .15s,box-shadow .15s,border-color .15s; }
.ay-cta-card:hover{ border-color:var(--brand); box-shadow:0 6px 20px rgba(0,45,98,.1); transform:translateY(-2px); }
.ay-cta-card .ico{ font-size:2rem; }
.ay-cta-card h3{ font-size:.95rem; font-weight:700; }
.ay-cta-card p{ font-size:.8rem; color:var(--muted); line-height:1.5; flex:1; }
.ay-cta-card .btn{ margin-top:6px; background:var(--brand); color:#fff; padding:8px 18px;
  border-radius:20px; font-size:.8rem; font-weight:700; }

/* FLOATING WHATSAPP */
.ay-wa-float{ position:fixed; bottom:18px; right:18px; background:#25D366; color:#fff;
  width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  font-size:1.5rem; box-shadow:0 4px 16px rgba(37,211,102,.4); z-index:200; text-decoration:none;
  transition:transform .15s; }
.ay-wa-float:hover{ transform:scale(1.1); }

/* FOOTER */
.ay-footer{ text-align:center; padding:28px 5vw; font-size:.82rem; color:var(--muted);
  border-top:1px solid var(--border); }
.ay-footer-links{ margin-bottom:6px; }
.ay-footer-links a{ color:var(--gold); font-weight:600; }
.ay-footer-links a:hover{ text-decoration:underline; }
`;

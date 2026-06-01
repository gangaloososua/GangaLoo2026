// app/api/chat/route.ts
//
// Public chat-assistant backend for the new app.
//
// Replaces the old Netlify function (chat-proxy.js). It builds a Spanish system
// prompt from (a) static store knowledge with NEW app links and (b) the REAL
// live catalog for the requested store — fetched with the SAME fetchStoreCatalog
// the storefront uses, so the assistant quotes the exact prices this visitor
// would see (guest markup, or member/club price). The Anthropic key stays
// server-side (ANTHROPIC_API_KEY). Same-origin, so no CORS headers needed.

import { NextResponse } from 'next/server'
import {
  resolveStoreWarehouse,
  fetchStoreCatalog,
  type StoreProduct,
} from '@/lib/store/catalog'

const SITE = 'https://gangalooshop.netlify.app'
const DEFAULT_WAREHOUSE = 'maranatha'
const MODEL = 'claude-haiku-4-5-20251001'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

// Static store facts that don't live in the product DB (hours, socials, how-tos,
// money-making programs). All links point at the NEW app routes.
const STORE_KNOWLEDGE = `
=== TIENDAS FISICAS ===

GANGALOO MONTELLANO
  Direccion: Pancho Mateo, Montellano, Republica Dominicana
  Horario: Lunes - Domingo, 9:00 AM - 7:00 PM
  WhatsApp: https://wa.me/18298417980 (+1 829-841-7980)

GANGALOO MARANATHA (Sosua, Puerto Plata)
  Direccion: Calle Bella Vista, Maranatha
  Horario: L-V 10AM-2PM y 4PM-7PM - Sab 2PM-6PM - Dom CERRADO
  WhatsApp: https://wa.me/18292867868 (+1 829-286-7868)

=== REDES SOCIALES ===
  Facebook: https://www.facebook.com/GangaLoo.Tienda
  Instagram: https://www.instagram.com/cellphonesella
  TikTok: https://www.tiktok.com/@gangaloo6

=== TIENDA ONLINE ===
  ${SITE}/tienda/maranatha  (Maranatha / Sosua)
  ${SITE}/tienda/montellano (Montellano)
  - Mejores precios garantizados + ofertas online
  - Envios a toda Republica Dominicana
  - Pago: efectivo, transferencia, tarjeta
  Para mostrar un producto al cliente, envialo a la tienda online de su sucursal.

=== COTIZADOR (Temu, Shein, Amazon, eBay, AliExpress) ===
  ${SITE}/cotizador
  Pasos: 1) Arma carrito -> 2) Anota total USD -> 3) Calcula en el cotizador -> 4) Envia por WhatsApp
  Comisiones: $0-30=15% - $30-50=12.5% - $50-100=10% - $100+=8%
  Temu/Shein: flete RD$100 incluido - Amazon: min RD$150 para <$35USD
  eBay: +3% bancario - AliExpress: +3% bancario +7% impuestos
  Opcion adelanto: paga solo 50% ahora, resto al recibir

=== GANAR DINERO CON GANGALOO ===
  1) Cashback 15% - compra y acumula automatico
  2) Mayorista - descuentos por volumen sin registro -> ${SITE}/partners
  3) Vendedor Oficial - 5-15% comision por ventas -> ${SITE}/partners
  4) Distribuidor - zona exclusiva (proximamente)
  5) Club GangaLoo - ver abajo

=== CLUB GANGALOO ===
  ${SITE}/club
  Tarjeta de socio - precio de socio en cada producto - envio gratis - puntos dobles
  Precios: RD$1,499/mes - RD$2,999/trimestral - RD$4,999/semestral

=== AYUDA / DEVOLUCIONES ===
  Como funciona: ${SITE}/ayuda
  Devoluciones (7 dias): ${SITE}/returns
`

// RD$ from integer cents (the new DB stores prices in cents).
function pesos(cents: number): string {
  return 'RD$ ' + Math.round(cents / 100).toLocaleString('es-DO')
}

// Compact catalog text grouped by category, using the visitor's effective price.
function buildCatalogText(products: StoreProduct[], storeUrl: string): string {
  if (!products.length) return ''
  const byCat = new Map<string, string[]>()
  for (const p of products) {
    const cat = p.category?.name || 'General'
    const line =
      `  - ${p.name}${p.sku ? ' (SKU:' + p.sku + ')' : ''}: ${pesos(p.priceCents)}` +
      (p.isOffer
        ? ` (OFERTA -${p.offerPercent}%, antes ${pesos(p.basePriceCents)})`
        : '') +
      (p.stock > 0 ? ` - ${p.stock} disponibles` : ' - agotado') +
      ` | Link: ${storeUrl}/${p.slug}`
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat)!.push(line)
  }
  return [...byCat.entries()]
    .map(([cat, items]) => cat + ':\n' + items.join('\n'))
    .join('\n\n')
}

function buildSystemPrompt(catalogText: string, storeUrl: string): string {
  const bar = '='.repeat(50)
  const catalogSection = catalogText
    ? `\n\n${bar}
CATALOGO REAL - LEE ESTO ANTES DE RESPONDER
${bar}
Este es el inventario ACTUAL de GangaLoo para esta sucursal. Cuando alguien
pregunte por productos, DEBES buscar aqui y citar productos EXACTOS con nombre y
precio. PROHIBIDO decir "visitanos" o "escribenos" si el producto aparece aqui.
Cada producto trae su enlace directo (campo "Link:"). Cuando menciones un
producto, comparte SU enlace directo (no solo el de la tienda) para que el
cliente lo abra de una vez. Copia el Link tal cual aparece; no lo inventes.

${catalogText}
${bar}`
    : `\n\n(Catalogo no disponible ahora - habla de categorias generales y de la tienda online)`

  return `Eres la asistente virtual de GangaLoo, tienda de pelucas y extensiones en Republica Dominicana.
${STORE_KNOWLEDGE}${catalogSection}

=== COMO HABLAR DE CABELLOS/EXTENSIONES ===

Cuando alguien pregunte "tienen cabellos?" o "tienen extensiones?":
-> Responde que SI y haz DOS preguntas:
   1. Que largo buscas? (en pulgadas: 16, 18, 20, 22, 24, 26, 28, 30...)
   2. Que estilo? (Lacio, Ondulado, Rizado, Body Wave...)

Cuando digan el largo (ej: "28" o "28 pulgadas"):
-> Busca en el catalogo TODOS los productos que tengan "28" en el nombre y listalos
   con nombre exacto, precio y su enlace directo (Link:). Si no hay exactamente
   28", muestra los mas cercanos.
-> Da el enlace directo (Link:) de cada producto que menciones, para que el
   cliente lo abra de una vez.

Cuando pregunten por estilo (ondulado, lacio, rizado) o calidad (9a, 12a, humano,
sintetico): busca en el catalogo y muestra las opciones disponibles con precios.
   - 9a = cabello humano de alta calidad, muy natural
   - 12a = la mejor calidad, mas duradero y brillante
   - Sintetico = mas economico, menos duracion

REGLAS ABSOLUTAS:
1. Si el producto ESTA en el catalogo -> muestralo con nombre, precio EXACTO y su
   enlace directo (el "Link:" que aparece en su linea).
2. Si NO esta en el catalogo -> di "no lo veo disponible online ahora, pero puedes
   preguntar por WhatsApp: https://wa.me/18292867868".
3. NUNCA digas "visita la tienda" sin dar el link de la tienda online o un WhatsApp.
4. NUNCA digas "no tenemos informacion" si el catalogo tiene productos.
5. Al recomendar un producto especifico, usa SIEMPRE su enlace directo (Link:). Usa
   el enlace general ${storeUrl} solo cuando no hablas de un producto puntual.
6. Siempre termina con un link (de producto o de tienda) o un WhatsApp.
7. STOCK: NO recomiendes ni listes productos marcados "agotado". Cuando sugieras
   opciones, ofrece solo los que tienen unidades ("X disponibles"). Si el cliente
   pregunta por un producto puntual que esta agotado, di con honestidad que ese
   esta agotado ahora y ofrece una alternativa disponible o el WhatsApp.

PERSONALIDAD:
- Amable, como vendedora dominicana experta en cabello.
- Espanol natural, emojis moderados.
- Respuestas concretas: nombres reales, precios reales, links reales.
- Maximo 6 oraciones por respuesta.`
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  let messages: ChatMessage[]
  let warehouseSlug: string
  try {
    const body = (await req.json()) as {
      messages?: ChatMessage[]
      warehouse?: string
    }
    messages = Array.isArray(body?.messages) ? body.messages : []
    warehouseSlug =
      typeof body?.warehouse === 'string' && body.warehouse
        ? body.warehouse
        : DEFAULT_WAREHOUSE
    if (messages.length === 0) throw new Error('no messages')
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Live catalog for this store, priced exactly as THIS visitor would see it on
  // the storefront (same fetchStoreCatalog). Non-fatal if it fails.
  let catalogText = ''
  let storeUrl = `${SITE}/tienda/${DEFAULT_WAREHOUSE}`
  try {
    const wh = await resolveStoreWarehouse(warehouseSlug)
    if (wh) {
      storeUrl = `${SITE}/tienda/${wh.slug}`
      const catalog = await fetchStoreCatalog(wh)
      catalogText = buildCatalogText(catalog.products, storeUrl)
    }
  } catch (e) {
    console.error('[chat] catalog load failed:', e)
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system: buildSystemPrompt(catalogText, storeUrl),
        messages,
      }),
    })

    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>
    }

    if (!res.ok) {
      console.error('[chat] anthropic error:', JSON.stringify(data))
      return NextResponse.json({ error: 'Upstream error' }, { status: 502 })
    }

    const first = data?.content?.[0]
    const reply =
      first && first.type === 'text' && typeof first.text === 'string'
        ? first.text
        : ''

    return NextResponse.json({ reply })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    console.error('[chat] request failed:', message)
    return NextResponse.json({ error: 'Upstream error' }, { status: 502 })
  }
}

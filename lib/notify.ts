// lib/notify.ts — server-side WhatsApp alerts via CallMeBot. Never throws,
// so a WhatsApp failure can never block an order from being saved.

type WaTarget = { phone: string; apikey: string };

const OWNER: WaTarget | null =
  process.env.CALLMEBOT_OWNER_PHONE && process.env.CALLMEBOT_OWNER_KEY
    ? { phone: process.env.CALLMEBOT_OWNER_PHONE, apikey: process.env.CALLMEBOT_OWNER_KEY }
    : null;

async function sendWhatsApp(t: WaTarget | null, text: string): Promise<void> {
  if (!t?.phone || !t?.apikey) return; // not configured -> skip quietly
  try {
    await fetch(
      `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(t.phone)}` +
        `&apikey=${encodeURIComponent(t.apikey)}&text=${encodeURIComponent(text)}`,
      { method: "GET", cache: "no-store" }
    );
  } catch (e) {
    console.error("[notify] WhatsApp send failed", e); // swallow on purpose
  }
}

export async function notifyNewOrder(a: {
  orderCode: string;
  warehouseName: string;
  customerName: string;
  totalLabel: string;
  fulfilment: "delivery" | "pickup";
  deliveryAt?: string | null;
  distributor?: WaTarget | null;
}): Promise<void> {
  const lines = [
    `🛒 Nuevo pedido ${a.orderCode}`,
    `Sucursal: ${a.warehouseName}`,
    `Cliente: ${a.customerName}`,
    `Total: ${a.totalLabel}`,
    a.fulfilment === "delivery" ? "🚚 Envío a domicilio" : "🏪 Recoger en tienda",
  ];
  if (a.deliveryAt) lines.push(`Entrega: ${a.deliveryAt}`);
  const text = lines.join("\n");

  await Promise.all([
    sendWhatsApp(OWNER, text), // owner always gets it
    a.distributor ? sendWhatsApp(a.distributor, text) : Promise.resolve(), // distributor if it is their warehouse
  ]);
}

// Owner alert when a new customer registers. When `plan` is present, the
// message is framed as a CLUB membership request (the customer's account is
// created but their Club toggle stays OFF until the owner activates it after
// payment). `plan` and `city` are optional, so existing callers (the regular
// storefront signup) are unaffected.
export async function notifyNewSignup(a: {
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  plan?: string;
  memberNo?: string;
}): Promise<void> {
  const isClub = !!a.plan;
  const text = [
    isClub ? "🎉 Nueva solicitud de Club" : "🙋 Nuevo cliente registrado",
    `Nombre: ${a.name}`,
    a.memberNo ? `Nº miembro: ${a.memberNo}` : null,
    a.phone ? `Tel: ${a.phone}` : null,
    a.email ? `Email: ${a.email}` : null,
    a.city ? `Ciudad: ${a.city}` : null,
    a.plan ? `Plan: ${a.plan}` : null,
    isClub ? "👉 Activa el Club (toggle en People) tras confirmar el pago." : null,
  ]
    .filter(Boolean)
    .join("\n");
  await sendWhatsApp(OWNER, text);
}

// Owner alert for a new SELLER application (from the /partners page). Sellers are
// a privileged role the owner sets up by hand, so this is just a lead: it sends
// the full application to the owner's WhatsApp. Never throws.
export async function notifySellerApplication(a: {
  name: string;
  email: string;
  phone: string;
  city?: string;
  cedula?: string;
  experience?: string;
  expDetail?: string;
  channel?: string;
  message?: string;
}): Promise<void> {
  const text = [
    "🤝 Nueva solicitud de Vendedor",
    `Nombre: ${a.name}`,
    `Email: ${a.email}`,
    `Tel: ${a.phone}`,
    a.city ? `Ciudad: ${a.city}` : null,
    a.cedula ? `Cédula: ${a.cedula}` : null,
    a.experience ? `Experiencia: ${a.experience}` : null,
    a.expDetail ? `Detalle: ${a.expDetail}` : null,
    a.channel ? `Cómo vende: ${a.channel}` : null,
    a.message ? `Mensaje: ${a.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  await sendWhatsApp(OWNER, text);
}

// Owner alert when a customer responds to a SERVICE ORDER (encargo) link,
// choosing pickup or delivery. Sent to the owner's WhatsApp. Never throws.
export async function notifyServiceOrderResponse(a: {
  clientName: string;
  platform: string;
  fulfilment: "pickup" | "delivery";
  balanceLabel: string;
  date?: string | null;
  address?: string | null;
}): Promise<void> {
  const isDel = a.fulfilment === "delivery";
  const text = [
    isDel ? "🚚 Encargo: cliente quiere ENTREGA" : "🏪 Encargo: cliente quiere RECOGER",
    `Cliente: ${a.clientName}`,
    a.platform ? `Tienda: ${a.platform}` : null,
    isDel && a.date ? `📅 Fecha: ${a.date}` : null,
    isDel && a.address ? `📍 Dirección: ${a.address}` : null,
    `💳 Por cobrar: ${a.balanceLabel}`,
    "👉 Revisa el panel de Encargos para confirmar.",
  ]
    .filter(Boolean)
    .join("\n");
  await sendWhatsApp(OWNER, text);
}

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
}): Promise<void> {
  const isClub = !!a.plan;
  const text = [
    isClub ? "🎉 Nueva solicitud de Club" : "🙋 Nuevo cliente registrado",
    `Nombre: ${a.name}`,
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

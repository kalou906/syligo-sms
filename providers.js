// ============================================================
//  providers.js — Les passerelles SMS de SyliGo
//  Chaque passerelle expose : send({ to, message }) -> { ok, id }
//  On choisit la bonne avec la variable d'environnement SMS_PROVIDER.
// ============================================================

// Met un numéro guinéen au format international sans "+"  (ex: 224622112233)
export function toIntl(num) {
  let d = String(num || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);      // enlève le préfixe 00
  if (d.startsWith("224")) return d;           // déjà international
  d = d.replace(/^0+/, "");                     // enlève les zéros de tête
  return "224" + d;
}
// Avec le "+" devant (ex: +224622112233)
export const toPlus = (num) => "+" + toIntl(num);

const b64 = (s) => Buffer.from(s).toString("base64");

// ---------- 1) CONSOLE : pour tester sans rien dépenser ----------
async function sendConsole({ to, message }) {
  console.log("\n----- SMS (mode console, non envoyé) -----");
  console.log("À :", toPlus(to));
  console.log(message);
  console.log("------------------------------------------\n");
  return { ok: true, id: "console-" + Date.now() };
}

// ---------- 2) NIMBA SMS (Guinée) ----------
// Doc : tableau de bord Nimba > API. Si l'authentification diffère,
// c'est ICI (en-tête Authorization) qu'il faut ajuster — une seule ligne.
async function sendNimba({ to, message }) {
  const base = process.env.NIMBA_BASE_URL || "https://api.nimbasms.com/v1";
  const auth = b64(`${process.env.NIMBA_SERVICE_ID}:${process.env.NIMBA_SECRET_TOKEN}`);
  const res = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      to: [toIntl(to)],
      message,
      sender_name: process.env.SMS_SENDER || "SYLIGO",
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Nimba ${res.status} : ${raw}`);
  let data = {}; try { data = JSON.parse(raw); } catch (_) {}
  return { ok: true, id: data.messageid || data.id || "nimba", raw: data };
}

// ---------- 3) API ORANGE SMS ----------
async function getOrangeToken() {
  const auth = b64(`${process.env.ORANGE_CLIENT_ID}:${process.env.ORANGE_CLIENT_SECRET}`);
  const res = await fetch("https://api.orange.com/oauth/v3/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Orange token ${res.status} : ${JSON.stringify(data)}`);
  return data.access_token;
}
async function sendOrange({ to, message }) {
  const token = await getOrangeToken();
  const sender = process.env.ORANGE_SENDER_ADDRESS; // ex: tel:+224XXXXXXXX
  const url =
    "https://api.orange.com/smsmessaging/v1/outbound/" +
    encodeURIComponent(sender) +
    "/requests";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      outboundSMSMessageRequest: {
        address: "tel:" + toPlus(to),
        senderAddress: sender,
        outboundSMSTextMessage: { message },
      },
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Orange ${res.status} : ${raw}`);
  return { ok: true, id: "orange", raw };
}

// ---------- 4) TWILIO ----------
async function sendTwilio({ to, message }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = b64(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`);
  const body = new URLSearchParams({
    To: toPlus(to),
    From: process.env.TWILIO_FROM,
    Body: message,
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Twilio ${res.status} : ${JSON.stringify(data)}`);
  return { ok: true, id: data.sid, raw: data };
}

// ---------- 5) WHATSAPP CLOUD API (Meta) ----------
// Astuce Guinée : WhatsApp coûte souvent moins cher que le SMS (data).
// NB : l'envoi de texte libre ne marche que dans les 24h après un message
// du destinataire ; sinon il faut un "template" validé par Meta.
async function sendWhatsApp({ to, message }) {
  const ver = process.env.WHATSAPP_API_VERSION || "v21.0";
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const res = await fetch(`https://graph.facebook.com/${ver}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toIntl(to),
      type: "text",
      text: { body: message },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`WhatsApp ${res.status} : ${JSON.stringify(data)}`);
  return { ok: true, id: (data.messages && data.messages[0] && data.messages[0].id) || "whatsapp", raw: data };
}

const PROVIDERS = {
  console: sendConsole,
  nimba: sendNimba,
  orange: sendOrange,
  twilio: sendTwilio,
  whatsapp: sendWhatsApp,
};

// Envoi avec 1 tentative de secours en cas d'échec réseau passager.
export async function sendSMS({ to, message }) {
  const name = (process.env.SMS_PROVIDER || "console").toLowerCase();
  const fn = PROVIDERS[name];
  if (!fn) throw new Error(`Passerelle inconnue : ${name}`);
  try {
    return await fn({ to, message });
  } catch (e) {
    console.warn("1er essai échoué, nouvelle tentative…", e.message);
    await new Promise((r) => setTimeout(r, 1200));
    return await fn({ to, message });
  }
}

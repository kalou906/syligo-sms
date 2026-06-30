// ============================================================
//  server.js — Serveur d'envoi SMS automatique de SyliGo
//  Lance avec :  npm install  puis  npm start
// ============================================================
import "dotenv/config";
import express from "express";
import cors from "cors";
import { sendSMS } from "./providers.js";

const app = express();
app.use(cors());            // autorise l'app SyliGo à appeler ce serveur
app.use(express.json());
app.use(express.static("public")); // sert la console d'admin sur "/" si le dossier public existe

// Console de test embarquée (s'affiche sur "/" même sans dossier public)
const CONSOLE_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SyliGo — Console SMS</title>
<style>
body{margin:0;background:#131210;color:#f3efe4;font-family:system-ui,sans-serif;font-size:15px}
.wrap{max-width:520px;margin:0 auto;padding:26px 18px 60px}
.logo{font-weight:800;font-size:26px}.logo .s{color:#f6c324}.logo .g{color:#16b06f}
.sub{color:#97907f;font-size:13px;margin:4px 0 18px}
.tri{display:flex;height:6px;border-radius:3px;overflow:hidden;margin:0 0 20px}.tri i{flex:1}
.card{background:#1b1a17;border:1px solid #322f26;border-radius:14px;padding:18px}
label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#97907f;margin:12px 0 5px}
input,textarea{width:100%;box-sizing:border-box;background:#232118;border:1px solid #322f26;color:#f3efe4;border-radius:9px;padding:11px;font-size:15px;font-family:inherit}
textarea{min-height:84px}
button{width:100%;border:none;border-radius:10px;padding:14px;font-weight:700;font-size:16px;cursor:pointer;margin-top:16px;background:#16b06f;color:#05281a}
.out{margin-top:14px;padding:12px;border-radius:10px;font-size:13px;white-space:pre-wrap;border:1px solid #322f26;background:#232118;display:none}
.ok{border-color:#16b06f;color:#16b06f}.err{border-color:#e23145;color:#e23145}
.pill{display:inline-block;font-size:12px;color:#97907f}
</style></head><body><div class="wrap">
<div class="logo"><span class="s">Syli</span><span class="g">Go</span> — Console SMS</div>
<div class="sub">Envoie un SMS de test a un taximan, depuis ce navigateur.</div>
<div class="tri"><i style="background:#e23145"></i><i style="background:#f6c324"></i><i style="background:#16b06f"></i></div>
<div class="card">
<div class="pill" id="prov">Passerelle : …</div>
<label>Cle API (ta valeur API_KEY)</label><input id="key" placeholder="ta-cle-secrete" autocomplete="off">
<label>Numero du destinataire</label><input id="to" placeholder="622 14 25 36">
<label>Message</label><textarea id="msg">Test SyliGo : ceci est un message de demonstration.</textarea>
<button id="send">Envoyer le SMS de test</button>
<div class="out" id="out"></div>
</div>
<div class="sub">En mode console, aucun vrai SMS n'est envoye : le message s'affiche dans les logs Render. Avec une vraie passerelle, le SMS part pour de vrai.</div>
</div>
<script>
fetch("/health").then(function(r){return r.json()}).then(function(j){document.getElementById("prov").textContent="Passerelle : "+(j.provider||"?")}).catch(function(){});
document.getElementById("send").onclick=function(){
  var out=document.getElementById("out");out.style.display="block";out.className="out";out.textContent="Envoi…";
  var key=document.getElementById("key").value.trim();
  var to=document.getElementById("to").value.trim();
  var message=document.getElementById("msg").value;
  fetch("/api/sms",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key},body:JSON.stringify({to:to,message:message})})
  .then(function(r){return r.json().then(function(j){return {s:r.status,j:j}})})
  .then(function(o){if(o.j&&o.j.ok){out.className="out ok";out.textContent="Envoye avec succes (id: "+(o.j.id||"-")+"). En mode console, regarde les logs Render pour voir le message.";}else{out.className="out err";out.textContent="Erreur "+o.s+" : "+((o.j&&o.j.error)||"inconnue");}})
  .catch(function(e){out.className="out err";out.textContent="Serveur injoignable : "+e.message;});
};
</script></body></html>`;

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY || "";

// --- Anti-abus : limite le nombre d'envois par minute (protège ton crédit) ---
const RATE_MAX = Number(process.env.RATE_MAX || 60);   // envois max / minute
const _hits = new Map();
function rateLimit(req, res, next) {
  const key = req.get("x-api-key") || req.ip;
  const now = Date.now();
  const w = _hits.get(key) || { n: 0, t: now };
  if (now - w.t > 60000) { w.n = 0; w.t = now; }
  w.n++; _hits.set(key, w);
  if (w.n > RATE_MAX) return res.status(429).json({ ok: false, error: "Trop d'envois, réessaie dans 1 minute" });
  next();
}

// --- File des réponses entrantes des taximen (OUI / NON) ---
const _replies = [];   // { from, text, at }  — réponses OUI/NON des taximen
const _orders = [];    // { id, from, text, at, handled } — commandes de course des clients
let _oid = 1;

// Modèle de message taximan par défaut (mêmes variables que dans l'app SyliGo)
const TEMPLATE_DEFAUT =
  "SyliGo - Nouvelle course\n" +
  "Client: {client} ({contact})\n" +
  "Depart: {depart}\n" +
  "Arrivee: {arrivee}\n" +
  "Type: {type}\n" +
  "Prix: {prix}\n" +
  "Votre part: {net}\n" +
  "Navigation: {lien}\n" +
  "{note}";

// Modèle de message client (rassurant)
const TEMPLATE_CLIENT =
  "SyliGo - Votre taxi arrive\n" +
  "Taximan: {taximan} ({taximanTel})\n" +
  "Vehicule: {vehicule}\n" +
  "De {depart} vers {arrivee}\n" +
  "Prix: {prix}\n" +
  "Merci d'avoir choisi SyliGo.";

function rendre(tpl, data, fallback) {
  return String(tpl || fallback || TEMPLATE_DEFAUT)
    .replaceAll("{client}", data.client || "")
    .replaceAll("{contact}", data.contact || "")
    .replaceAll("{depart}", data.depart || "")
    .replaceAll("{arrivee}", data.arrivee || "")
    .replaceAll("{type}", data.type || "")
    .replaceAll("{prix}", data.prix || "")
    .replaceAll("{net}", data.net || "")
    .replaceAll("{taximan}", data.taximan || "")
    .replaceAll("{taximanTel}", data.taximanTel || "")
    .replaceAll("{vehicule}", data.vehicule || "")
    .replaceAll("{lien}", data.lien || "")
    .replaceAll("{note}", data.note ? "Note: " + data.note : "")
    .trim();
}

// Sécurité : exige la bonne clé dans l'en-tête x-api-key (si API_KEY est défini)
function protege(req, res, next) {
  if (!API_KEY) return next();
  if (req.get("x-api-key") === API_KEY) return next();
  return res.status(401).json({ ok: false, error: "Clé API invalide" });
}

// Vérifier que le serveur tourne
app.get("/health", (_req, res) =>
  res.json({ ok: true, provider: process.env.SMS_PROVIDER || "console" })
);

// Page d'accueil = console de test (fonctionne même sans dossier public)
app.get("/", (_req, res) => res.type("html").send(CONSOLE_HTML));

// Envoi brut : { to, message }
app.post("/api/sms", protege, rateLimit, async (req, res) => {
  const { to, message } = req.body || {};
  if (!to || !message)
    return res.status(400).json({ ok: false, error: "Champs 'to' et 'message' requis" });
  try {
    const r = await sendSMS({ to, message });
    res.json({ ok: true, id: r.id });
  } catch (e) {
    console.error("Échec envoi:", e.message);
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Envoi au taximan : construit le message depuis le modèle puis envoie.
app.post("/api/notify-course", protege, rateLimit, async (req, res) => {
  const d = req.body || {};
  if (!d.to) return res.status(400).json({ ok: false, error: "Numéro 'to' du taximan requis" });
  const message = rendre(d.template, d, TEMPLATE_DEFAUT);
  try {
    const r = await sendSMS({ to: d.to, message });
    console.log(`✅ Taximan notifié : ${d.taximan || d.to}`);
    res.json({ ok: true, id: r.id, message });
  } catch (e) {
    console.error("Échec envoi course:", e.message);
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Envoi au CLIENT : message rassurant (taximan, véhicule, prix).
app.post("/api/notify-client", protege, rateLimit, async (req, res) => {
  const d = req.body || {};
  if (!d.to) return res.status(400).json({ ok: false, error: "Numéro 'to' du client requis" });
  const message = rendre(d.template, d, TEMPLATE_CLIENT);
  try {
    const r = await sendSMS({ to: d.to, message });
    console.log(`✅ Client notifié : ${d.to}`);
    res.json({ ok: true, id: r.id, message });
  } catch (e) {
    console.error("Échec envoi client:", e.message);
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Webhook entrant : la passerelle envoie ici les réponses des taximen (OUI/NON).
// Configure cette URL (…/api/inbound) dans le tableau de bord de ta passerelle.
app.post("/api/inbound", (req, res) => {
  const b = req.body || {};
  // on accepte plusieurs noms de champs selon les passerelles
  const from = b.from || b.sender || b.msisdn || b.From || "";
  const text = b.text || b.message || b.content || b.Body || "";
  if (from) {
    const t = String(text).trim().toUpperCase();
    const estReponse = ["OUI", "NON", "O", "N", "YES", "NO", "1", "2"].includes(t)
      || /^(FINI|FIN|FINIE|TERMINE|TERMINÉ|TERMINEE|TERMINÉE|ARRIVE|ARRIVÉ)\b/.test(t);
    if (estReponse) {
      _replies.push({ from, text, at: Date.now() });
      if (_replies.length > 500) _replies.shift();
    } else {
      // tout autre SMS = une commande de course d'un client
      _orders.push({ id: _oid++, from, text, at: Date.now(), handled: false });
      if (_orders.length > 500) _orders.shift();
    }
  }
  res.json({ ok: true });
});

// L'app SyliGo lit (et vide) les réponses en attente.
app.get("/api/replies", protege, (_req, res) => {
  const replies = _replies.splice(0, _replies.length);
  res.json({ ok: true, replies });
});

// Commandes de course reçues par SMS (non traitées). Ne sont pas effacées à la lecture.
app.get("/api/orders", protege, (_req, res) => {
  res.json({ ok: true, orders: _orders.filter((o) => !o.handled) });
});
// Marquer une commande comme traitée (course créée ou ignorée)
app.post("/api/orders/done", protege, (req, res) => {
  const id = (req.body && req.body.id) || null;
  const o = _orders.find((x) => x.id === id);
  if (o) o.handled = true;
  res.json({ ok: true });
});

/* ---- Base de données partagée (Supabase) ---- */
const SB_URL = process.env.SUPABASE_URL || "";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

// Lire l'état partagé
app.get("/api/state", protege, async (_req, res) => {
  if (!SB_URL || !SB_KEY) return res.status(503).json({ ok: false, error: "Base non configurée" });
  try {
    const r = await fetch(`${SB_URL}/rest/v1/syligo_state?id=eq.main&select=data,updated_at`, { headers: sbHeaders });
    if (!r.ok) return res.status(502).json({ ok: false, error: "Lecture impossible" });
    const rows = await r.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    res.json({ ok: true, data: row ? row.data : null, updated_at: row ? row.updated_at : null });
  } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
});

// Écrire l'état partagé (upsert sur id='main')
app.post("/api/state", protege, async (req, res) => {
  if (!SB_URL || !SB_KEY) return res.status(503).json({ ok: false, error: "Base non configurée" });
  const data = req.body && req.body.data;
  if (data == null) return res.status(400).json({ ok: false, error: "data manquant" });
  try {
    const r = await fetch(`${SB_URL}/rest/v1/syligo_state`, {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ id: "main", data, updated_at: new Date().toISOString() }]),
    });
    if (!r.ok) { const t = await r.text(); return res.status(502).json({ ok: false, error: t }); }
    res.json({ ok: true, updated_at: new Date().toISOString() });
  } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.listen(PORT, () => {
  console.log(`SyliGo SMS — serveur prêt sur le port ${PORT}`);
  console.log(`Passerelle : ${process.env.SMS_PROVIDER || "console"}`);
});

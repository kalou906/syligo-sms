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
app.use(express.static("public")); // sert la console d'admin sur "/"

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
const _replies = [];   // { from, text, at }

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
  if (from) { _replies.push({ from, text, at: Date.now() }); if (_replies.length > 500) _replies.shift(); }
  res.json({ ok: true });
});

// L'app SyliGo lit (et vide) les réponses en attente.
app.get("/api/replies", protege, (_req, res) => {
  const replies = _replies.splice(0, _replies.length);
  res.json({ ok: true, replies });
});

app.listen(PORT, () => {
  console.log(`SyliGo SMS — serveur prêt sur le port ${PORT}`);
  console.log(`Passerelle : ${process.env.SMS_PROVIDER || "console"}`);
});

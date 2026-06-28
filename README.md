# SyliGo — Serveur d'envoi SMS automatique

Petit serveur qui envoie un **SMS au taximan** dès qu'une course lui est affectée, avec **nom du client, lieu et prix**. Marche avec **Nimba SMS** (Guinée), l'**API Orange SMS** ou **Twilio**. Un mode **console** permet de tout tester gratuitement avant de payer une passerelle.

## 1. Installer

Il faut **Node.js 18+** sur ton ordinateur ou ton serveur.

```bash
cd syligo-sms-server
npm install
cp .env.example .env
```

Ouvre le fichier `.env` et remplis tes valeurs.

## 2. Tester tout de suite (gratuit)

Dans `.env`, laisse `SMS_PROVIDER=console`, puis :

```bash
npm start
```

Dans un autre terminal, teste :

```bash
curl -X POST http://localhost:8080/api/notify-course \
  -H "Content-Type: application/json" \
  -H "x-api-key: change-moi-par-une-longue-cle-secrete" \
  -d '{"to":"622112233","taximan":"Keita Sekou","client":"M. Diallo","contact":"622142536","depart":"Cosa (Ratoma)","arrivee":"Almamya (Kaloum)","type":"Taxi-voiture","prix":"48 000 GNF","net":"44 160 GNF"}'
```

Le message complet s'affiche dans le terminal du serveur. Quand ça te convient, passe à une vraie passerelle.

## 3. Choisir une passerelle

Dans `.env`, change `SMS_PROVIDER` et remplis le bloc correspondant.

- **Nimba SMS (Guinée)** — `SMS_PROVIDER=nimba`. Crée un compte sur nimbasms.com, achète des crédits, récupère `SERVICE_ID` et `SECRET_TOKEN` dans la section API. *Note : si l'authentification de ton compte diffère, c'est l'en-tête `Authorization` dans `providers.js` (fonction `sendNimba`) qu'il faut ajuster — une seule ligne.*
- **Orange SMS** — `SMS_PROVIDER=orange`. Inscris-toi sur developer.orange.com, crée une application SMS, récupère `CLIENT_ID`, `CLIENT_SECRET` et ton numéro expéditeur.
- **Twilio** — `SMS_PROVIDER=twilio`. Récupère `ACCOUNT_SID`, `AUTH_TOKEN` et un numéro `FROM`.

Relance `npm start`. C'est tout.

## 4. Mettre le serveur en ligne

Pour qu'il tourne 24h/24, héberge-le (gratuit ou pas cher) :

- **Render.com** ou **Railway.app** : connecte le dossier, mets les variables de `.env` dans leur interface, déploie.
- Ou un petit **VPS** : `npm install` puis `npm start` (avec `pm2` pour le garder allumé).

Tu obtiens une adresse du type `https://ton-serveur-syligo.onrender.com`.

## 5. Brancher l'app SyliGo

Ouvre `client-snippet.js`, mets ton adresse de serveur et ta clé API, colle la fonction dans l'app, et appelle `notifierTaximan(course, driver)` juste après l'affectation d'un taximan. À partir de là, **chaque course affectée part toute seule** en SMS — plus besoin de cliquer.

## Endpoints

| Méthode | Adresse | Rôle |
|--------|---------|------|
| GET | `/health` | Vérifier que le serveur tourne |
| POST | `/api/sms` | Envoi brut `{ to, message }` |
| POST | `/api/notify-course` | Envoi d'une course (construit le message) |

Tous les envois exigent l'en-tête `x-api-key` (la clé de ton `.env`).

## Sécurité

- Garde ta `API_KEY` secrète et ne la mets jamais dans une page publique.
- Ne publie jamais ton fichier `.env` (clés des passerelles).

---

## Fonctions avancées (nouvelles)

**SMS au client.** Endpoint `POST /api/notify-client` : prévient le client avec le nom du taximan, le véhicule et le prix. Activable dans l'app (onglet Notif. taximen).

**Lien de navigation.** Le SMS du taximan peut contenir `{lien}` : un lien Google Maps vers le point de départ (utile pour les moto-taxis).

**WhatsApp.** Mets `SMS_PROVIDER=whatsapp` et remplis `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID`. Souvent moins cher que le SMS. Note : l'envoi de texte libre n'est possible que dans les 24h après un message du client ; sinon Meta impose un « template » validé.

**Acceptation OUI / NON (réaffectation auto).** Le taximan peut répondre OUI ou NON par SMS. Pour que l'app le sache :
1. Dans le tableau de bord de ta passerelle (Nimba/Twilio), configure l'**URL de réception des SMS entrants** vers `https://ton-serveur/api/inbound`.
2. Dans l'app, active **Acceptation taximan** et règle le délai. Si le taximan ne répond pas à temps, la course est **réaffectée automatiquement** au suivant.

**Anti-abus.** Le serveur limite les envois (variable `RATE_MAX`, défaut 60/min) pour protéger ton crédit en cas de bug ou d'attaque.

## Tous les endpoints

| Méthode | Adresse | Rôle |
|--------|---------|------|
| GET | `/health` | Vérifier que le serveur tourne |
| GET | `/` | Console d'admin (navigateur) |
| POST | `/api/sms` | Envoi brut `{ to, message }` |
| POST | `/api/notify-course` | SMS au taximan |
| POST | `/api/notify-client` | SMS au client |
| POST | `/api/inbound` | Réception des réponses (à configurer chez la passerelle) |
| GET | `/api/replies` | L'app lit les réponses OUI/NON |

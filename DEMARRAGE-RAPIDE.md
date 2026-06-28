# SyliGo — Mettre le serveur SMS en ligne (pas à pas)

But : avoir une adresse internet (ex. `https://syligo-sms.onrender.com`) que l'app SyliGo
utilisera pour **prévenir automatiquement les taximen et les clients par SMS**.

On commence en mode **console** (gratuit, n'envoie pas de vrais SMS, sert à tout vérifier),
puis on bascule sur **Nimba SMS** (passerelle guinéenne) pour les vrais envois.

---

## Étape 1 — Mettre le dossier sur GitHub
1. Crée un compte sur https://github.com (gratuit).
2. Nouveau dépôt → nom `syligo-sms` → **Create**.
3. Téléverse tout le contenu du dossier `syligo-sms-server/` dans ce dépôt
   (bouton **Add file → Upload files**, glisse tous les fichiers, **Commit**).

## Étape 2 — Déployer sur Render (gratuit)
1. Crée un compte sur https://render.com et connecte ton GitHub.
2. **New → Blueprint** → choisis le dépôt `syligo-sms`.
3. Render lit le fichier `render.yaml` et configure tout seul. Clique **Apply**.
4. Attends ~2 minutes. Quand c'est vert, tu obtiens une **adresse** :
   `https://syligo-sms-xxxx.onrender.com`  ← **note-la**.

> Render génère automatiquement une **clé secrète** `API_KEY`.
> Tu la trouves dans : ton service → **Environment** → variable `API_KEY` → copie sa valeur.

## Étape 3 — Connecter l'app SyliGo
1. Ouvre SyliGo → menu **« Prévenir les taximen »**.
2. Colle l'**adresse du serveur** (Étape 2) et la **clé API** (Étape 2).
3. Clique **Enregistrer**, puis **Tester la connexion** → tu dois voir **« Serveur joignable ✓ »**.
4. Active l'envoi automatique. Crée une course → le serveur reçoit la demande.

En mode console, aucun vrai SMS n'est envoyé : tu vois les messages dans
Render → ton service → **Logs**. Parfait pour tout valider sans dépenser.

## Étape 4 — Activer les vrais SMS (Nimba SMS, Guinée)
1. Crée un compte sur https://nimbasms.com et achète un petit crédit de test.
2. Dans ton tableau de bord Nimba → **API**, récupère :
   `SERVICE_ID` et `SECRET_TOKEN`.
3. Sur Render → ton service → **Environment**, modifie / ajoute :
   - `SMS_PROVIDER` = `nimba`
   - `NIMBA_SERVICE_ID` = *(ta valeur)*
   - `NIMBA_SECRET_TOKEN` = *(ta valeur)*
   - `SMS_SENDER` = `SYLIGO` (ou l'expéditeur validé par Nimba)
4. **Save** → Render redéploie tout seul. Désormais les SMS partent pour de vrai.

> Tu peux aussi choisir `orange`, `twilio` ou `whatsapp` à la place de `nimba`
> (voir `.env.example` pour les variables de chaque passerelle).

## Étape 5 — Recevoir les réponses OUI/NON (facultatif)
Le serveur a une adresse `/api/inbound` pour recevoir les réponses des taximen
(« OUI » j'accepte / « NON »). Dans le tableau de bord de ta passerelle,
règle le **webhook des SMS entrants** sur :
`https://TON-ADRESSE.onrender.com/api/inbound`
L'app lit ces réponses et avance la file automatiquement.

---

## Vérifier que tout marche
- `https://TON-ADRESSE.onrender.com/health` doit afficher `{"ok":true,...}`.
- Bouton **Tester la connexion** dans l'app → « Serveur joignable ✓ ».
- Une course créée apparaît dans les **Logs** Render (mode console) ou arrive en SMS (mode nimba).

## Bon à savoir
- **Coût** : le plan Render gratuit suffit pour démarrer. Les SMS sont facturés par ta
  passerelle (Nimba/Orange/…), pas par Render. Le réglage `RATE_MAX` limite les envois
  par minute pour protéger ton crédit.
- **Sécurité** : ne partage jamais ta `API_KEY` ni tes jetons de passerelle. Ils restent
  uniquement dans les **variables d'environnement** de Render.
- **Mise en veille** : sur le plan gratuit, le serveur s'endort après inactivité et se
  réveille en quelques secondes au premier appel. Pour un service permanent, passe au plan payant.

# SyliGo — Mettre le serveur SMS en ligne (guide simple)

J'ai préparé **tout le serveur** pour toi : le code, la page d'admin, le fichier de déploiement automatique, la sécurité. Il reste **3 petites choses que toi seul peux faire** (parce qu'elles demandent ton email, ton téléphone et ton paiement, à ton nom). Suis les étapes dans l'ordre.

---

## Ce qui est déjà fait pour toi
- Serveur d'envoi complet (Nimba / Orange / Twilio + mode test).
- **Console d'admin dans le navigateur** : tu ouvres l'adresse du serveur et tu envoies un SMS de test sans rien taper.
- Déploiement automatique (`render.yaml`) : la plateforme se configure seule.
- Sécurité : clé secrète, fichiers sensibles protégés.

---

## Étape 1 — Mettre le code sur GitHub (5 min)
1. Crée un compte gratuit sur **github.com**.
2. Clique **New repository**, nomme-le `syligo-sms-server`, laisse en **Private**, crée.
3. Sur la page du dépôt, clique **uploading an existing file** et glisse **tout le contenu du dossier `syligo-sms-server`** (server.js, providers.js, package.json, le dossier `public`, render.yaml, etc.). **Ne mets jamais** de fichier `.env`.
4. Clique **Commit changes**.

## Étape 2 — Déployer sur Render (5 min)
1. Crée un compte gratuit sur **render.com** (tu peux te connecter avec GitHub).
2. Clique **New +** > **Blueprint**.
3. Choisis ton dépôt `syligo-sms-server`. Render lit `render.yaml` et prépare tout.
4. Clique **Apply**. Attends 1–2 minutes : tu obtiens une adresse du type
   `https://syligo-sms.onrender.com`.
5. Va dans l'onglet **Environment** du service : note la valeur de **API_KEY** (Render l'a générée pour toi). Garde-la secrète.

✅ À ce stade le serveur tourne déjà en **mode test (console)**. Ouvre ton adresse Render dans le navigateur : la **console d'admin SyliGo** s'affiche.

## Étape 3 — Brancher une vraie passerelle SMS (10 min)
Pour envoyer de vrais SMS, choisis **une** passerelle. Le plus simple en Guinée : **Nimba SMS**.

**Avec Nimba SMS :**
1. Crée un compte sur **nimbasms.com** et achète un peu de crédit.
2. Dans leur tableau de bord, section **API**, récupère ton **SERVICE_ID** et ton **SECRET_TOKEN**.
3. Sur Render > ton service > **Environment**, mets :
   - `SMS_PROVIDER` = `nimba`
   - `NIMBA_SERVICE_ID` = ta valeur
   - `NIMBA_SECRET_TOKEN` = ta valeur
4. Clique **Save, rebuild and deploy**.

*(Pour Orange ou Twilio, c'est le même principe : remplis le bloc correspondant des variables.)*

## Étape 4 — Tester un vrai envoi (2 min)
1. Ouvre l'adresse de ton serveur dans le navigateur.
2. Entre ta **clé API** (celle de l'étape 2).
3. Clique **Vérifier que le serveur tourne** → tu dois voir « Serveur OK ».
4. Mets **ton propre numéro**, un nom, un prix, clique **Envoyer le SMS**.
5. Tu dois recevoir le SMS sur ton téléphone. 🎉

## Étape 5 — Connecter l'app SyliGo (1 min)
Dans l'app SyliGo → onglet **Notif. taximen** → carte **Connexion au serveur** :
- **Adresse du serveur** : ton adresse Render.
- **Clé API** : la même qu'au-dessus.
- Clique **Enregistrer**, puis **Tester la connexion**, puis active **Envoi auto**.

À partir de là, chaque course affectée envoie le SMS au taximan **toute seule**.

---

## Important
- Sur le plan gratuit de Render, le serveur peut « s'endormir » après inactivité et mettre quelques secondes à répondre au premier appel. Pour un usage intensif, passe au petit plan payant.
- Ne partage jamais ta `API_KEY` ni tes identifiants de passerelle.
- Si l'authentification Nimba diffère de ce qui est codé, c'est **une seule ligne** à ajuster dans `providers.js` (fonction `sendNimba`).

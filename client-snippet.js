// ============================================================
//  À coller dans l'app SyliGo pour l'envoi AUTOMATIQUE.
//  Remplace l'adresse par celle de ton serveur en ligne.
// ============================================================

const SMS_SERVER = "https://ton-serveur-syligo.onrender.com"; // ← ton adresse
const SMS_API_KEY = "la-meme-cle-que-dans-le-.env";           // ← la clé API

// Envoie la course au serveur, qui envoie le vrai SMS au taximan.
export async function notifierTaximan(course, driver) {
  if (!driver || !driver.contact) return;
  const dep = course.departLabel || course.departCode;
  const arr = course.arriveeLabel || course.arriveeCode;
  try {
    await fetch(`${SMS_SERVER}/api/notify-course`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": SMS_API_KEY },
      body: JSON.stringify({
        to: driver.contact,
        taximan: driver.nom,
        client: course.clientNom,
        contact: course.contact,
        depart: dep,
        arrivee: arr,
        type: course.type,
        prix: course.montant,
        net: course.netTaximan,
        note: course.note,
      }),
    });
  } catch (e) {
    console.warn("Notification taximan échouée :", e);
  }
}

// Où l'appeler ? Juste après qu'une course reçoit un chauffeur.
// Par exemple dans runAutoDispatch, après "ch.statut = 'En course'", ajoute :
//     notifierTaximan(c, ch);
// (en passant des libellés lisibles : depart/arrivee = nom du quartier)

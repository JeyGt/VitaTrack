# VitaTrack — version nettoyée

Cette archive contient uniquement l’application, les API serveur et les migrations Supabase nécessaires au déploiement.

## Frontend / PWA
- `index.html`
- `app.js`, `nutrition.js`, `cloud-sync.js`, `data.js`
- modules `sport-*.js`
- `service-worker.js`, `manifest.json`
- icônes PWA

## Backend
- `api/cloud.js`
- `api/withings.js`

## Base de données
- `supabase/cloud_sync.sql`
- `supabase/withings_multi_user.sql`

Les anciens fichiers de notes et les scripts de test de développement ont été retirés de cette archive afin de garder un paquet de déploiement lisible. Ils n’étaient pas chargés par l’application.

## Structure Sport simplifiée
Les anciens modules Sport ont été regroupés sans modifier leur logique :
- `sport-data.js` : catalogue des exercices + séances prêtes à l'emploi.
- `sport-engine.js` : programmes, progression, historique et statistiques.
- `sport-ui.js` : bibliothèques d'exercices/séances et exécution des entraînements.

## Profil centralisé (v12)
- Accès Profil depuis l’icône en haut à droite.
- Modification du profil et de l’objectif dans un même panneau.
- Préférences de notifications persistées localement.
- Apparence : clair, sombre ou selon le système.
- Connexion Withings accessible depuis Profil, en réutilisant le connecteur existant.
- Zone prête pour de futurs connecteurs (Apple Santé, Health Connect, Garmin, etc.).


## Compte VitaTrack et synchronisation multi-appareils

Le frontend et l’API de synchronisation sont déjà inclus (`cloud-sync.js` et `api/cloud.js`). Le compte utilise un e-mail comme identifiant et un mot de passe d’au moins 8 caractères.

Pour activer la fonction sur le déploiement :

1. Créer/configurer un projet Supabase.
2. Exécuter `supabase/cloud_sync.sql` dans l’éditeur SQL Supabase.
3. Configurer les variables d’environnement du serveur :
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CLOUD_SESSION_SECRET` (secret long et aléatoire)
4. Redéployer VitaTrack.

Fonctionnement : les données restent local-first. Après connexion, chaque sauvegarde locale marque l’état comme modifié et déclenche une synchronisation cloud différée. Sur un autre appareil, la connexion au même compte permet de récupérer l’état cloud. Les réponses de `/api/` ne sont jamais mises en cache par le service worker.

## Sport — Prescription V3 (phase 2)

Cette version ajoute `prescription-model.js` et sépare désormais :

- **Exercise V3** : définition canonique de l'exercice ;
- **Prescription V3** : séries, cible (reps / charge+reps / temps / distance) et repos ;
- **Performance** : ce qui a réellement été réalisé dans `performanceSets`.

Les programmes en attente sont migrés automatiquement vers Prescription V3. Les séances déjà commencées ou terminées gardent leurs objectifs historiques. Les défis utilisent leurs vraies séries restantes et les adaptations rapides (15 min / plus facile) respectent désormais le type de métrique.

## Technique & Variantes V3 — phase 4
- Ajout de `exercise-content.js` : contenu technique structuré séparé du catalogue historique.
- Le runner conserve un écran d'effort léger ; `Technique & variantes` reste replié par défaut.
- Le panneau peut afficher placement, exécution, respiration, erreurs fréquentes, muscles secondaires et variantes.
- 44 exercices prioritaires disposent désormais d'une technique structurée ; 47 ont au moins une consigne technique exploitable.
- 38 exercices disposent maintenant d'une chaîne de progression/régression/alternative exploitable par Coach V3.
- Les variantes affichées dans le runner et celles choisies par Coach V3 utilisent la même source de données.
- Le nouveau fichier est inclus dans le cache hors-ligne (`v71-technique-variants-v3`).

## Sport — Catalogue Quality V4
- Couche `exercise-quality.js` : métadonnées curatées sans dupliquer les 172 objets historiques.
- Exercise Model V4 : famille, rôle programme, difficulté 1–5, métrique, matériel, zones, muscles et objectifs normalisés.
- Le générateur Sport lit désormais `window.EXERCISES` (catalogue normalisé) au lieu du catalogue brut historique.
- Les accessoires et figures techniques restent lançables mais ne remplacent plus automatiquement un mouvement principal.
- Filtres matériel dynamiques : aucun filtre vide (ex. TRX) n'est affiché si le catalogue ne contient pas d'exercice correspondant.


## V7.1 — Remplacement visible
- Bouton `↻ Remplacer` affiché en toutes lettres dans la préparation de séance.
- Une séance héritée marquée `in_progress` reste modifiable tant qu'aucune performance réelle n'a été enregistrée.
- Le verrouillage intervient après l'enregistrement d'une performance.


## V8 — Runner plus lisible pendant la séance
- Barre de progression globale visible pendant l'effort, la récupération, le countdown et le ressenti de fin d'exercice.
- L'objectif reste central ; `Dernière fois` et `Record` passent dans une zone compacte séparée.
- Nouveau bloc `Ensuite` pendant l'effort : prochaine série, prochain exercice ou fin de séance.
- La récupération distingue clairement `Prochaine série` et `Prochain exercice`, avec la cible à venir.
- Le countdown rappelle la position dans la séance et la cible avant le départ.
- Le swipe reste le geste principal ; le bouton secondaire devient `Valider sans glisser`.
- Nouveau cache hors-ligne `v80-runner-clarity-progress-next`.

## Phase 9 — Bilan & Progression V9
- Bilan de fin de séance exercice par exercice.
- Comparaison avec la réalisation précédente (reps, volume chargé, temps ou distance).
- Affichage du ressenti et des nouveaux records.
- Résumé des tendances de la séance et accès direct à la page Progression.
- Page Progression revue avec tendances et prochaines cibles du Coach V3.
- Cache PWA versionné v90.


## Navigation Sport V10
- Remplace le carrousel glissé Défis / Entraînements / Exercices par trois entrées fixes et visibles en permanence.
- Supprime les points de pagination et la logique de boucle du carrousel.
- Ordre : Entraînements, Exercices, Défis.
- Le Coach Sport reste un accès séparé juste dessous.

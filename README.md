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

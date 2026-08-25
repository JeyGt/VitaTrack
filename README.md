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

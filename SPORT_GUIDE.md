# VitaTrack — Module de Coaching Sportif Adaptatif

## 🎯 Vue d'ensemble

Le module Sport de VitaTrack implémente un système de coaching personnel qui **évolue avec les performances de l'utilisateur**. Ce n'est pas un programme fixe : c'est un coach qui apprend et s'adapte.

---

## 📋 Architecture

### Fichiers ajoutés :

1. **sport-data.js** (Bibliothèque d'exercices)
   - 50+ exercices structurés
   - Mouvements fondamentaux (poussée, tirage, squat, hinge, gainage, etc.)
   - Variantes de progression pour chaque exercice
   - Informations : difficulté, niveau, équipement, muscles travaillés

2. **sport-engine.js** (Moteur de coaching)
   - Génération de programmes adaptatifs
   - Analyse des performances
   - Décisions d'adaptation automatiques
   - Gestion des défis mensuels
   - Tracking de progression
   - Coach conversationnel

3. **Modifications app.js**
   - Fonction `renderSport()` : affichage principal
   - `openSession()` : exécution de séance
   - `recordExerciseFeedback()` : enregistrement des performances
   - `finishSession()` : analyse et adaptation

4. **Modifications index.html**
   - Overlay d'onboarding sport
   - Nouvelle UI pour écran Sport
   - CSS pour les cartes de séance

---

## 🚀 Flux utilisateur

### Étape 1 : Onboarding (2-3 minutes)
1. L'utilisateur clique sur "Commencer" dans Sport
2. Renseigne : niveau, sessions/semaine, durée, matériel, jours préférés, objectif
3. Le système génère un programme hebdomadaire adapté

### Étape 2 : Écran Accueil Sport
- Affiche la récupération estimée
- Montre la prochaine séance
- Agenda de la semaine
- Progression des exercices
- Défi du mois

### Étape 3 : Exécution d'une séance
1. L'utilisateur clique "Commencer"
2. Pour chaque exercice : enregistre les répétitions, la difficulté (1-10), le ressenti
3. Termine la séance
4. **Le coach analyse immédiatement et adapte**

### Étape 4 : Adaptation automatique
- Difficulté ≥ 8/10 → Réduction ou variante plus facile
- Difficulté ≤ 3/10 + dépassement → Progression vers variante plus difficile
- Feedback utilisateur → Ajustements du volume/charge

---

## 🧠 Moteur de décision (Cœur du système)

### Règles d'adaptation (dans `adaptSession()`)

```javascript
IF difficulté ≥ 8/10 THEN
  ACTION = 'reduce'
  SUGGESTION = variante_plus_facile
ENDIF

IF difficulté ≤ 3/10 AND répétitions ≥ reps_prévues * 1.1 THEN
  ACTION = 'progress'
  SUGGESTION = variante_plus_difficile
ENDIF

IF feedback = 'adapted' THEN
  ACTION = 'maintain'
ENDIF
```

### Pas de IA générative pour les règles
Le système utilise des règles **explicites** et **tracées**, pas des décisions aléatoires d'une IA. Chaque adaptation est justifiée par une raison enregistrée.

---

## 📊 Structure des données

### User Profile (Sport)
```javascript
{
  level: 'debutant'|'intermediaire'|'avance',
  sessionsPerWeek: number,
  sessionDuration: number (minutes),
  equipment: ['aucun','halteres','elastiques',...],
  preferredDays: ['lun','mer','ven',...],
  objectives: {
    primary: 'force'|'musculation'|'endurance'|'perte_poids'|'condition_physique',
    secondary: []
  }
}
```

### Session Objet
```javascript
{
  id: string,
  dayOfWeek: string,
  name: string,
  targetDuration: number,
  exercises: [
    {
      exerciseId: string,
      exerciseName: string,
      plannedReps: [10, 10, 10],
      plannedSets: number,
      repsCompleted: [10, 10, 9],     // enregistré après
      difficulty: 6,                   // enregistré après
      feedback: 'adapted'|'too_easy'|'too_difficult'
    }
  ],
  status: 'pending'|'in_progress'|'completed',
  completedDate: string
}
```

### Coach Decision
```javascript
{
  sessionId: string,
  date: string,
  avgDifficulty: number,
  adaptations: [
    {
      exerciseId: string,
      action: 'maintain'|'reduce'|'progress',
      reason: "Difficulté 7/10 → maintien",
      recommendation: 'easier_variant'|'harder_variant',
      suggestedId: string
    }
  ]
}
```

---

## 🎯 Objectifs et Structure de Programme

### Par Objectif Principal

**Force (4 jours)**
- Jour 1 : Haut du corps - Force (poussée/tirage horizontaux)
- Jour 2 : Jambes - Force (squat/hinge/fente)
- Jour 3 : Haut accessoires
- Jour 4 : Jambes + cardio

**Musculation (4 jours)**
- Jour 1 : Poitrine/Triceps
- Jour 2 : Dos/Biceps
- Jour 3 : Jambes
- Jour 4 : Accessoires

**Perte de poids (3 jours)**
- Jour 1 : Cardio + poids du corps
- Jour 2 : Full body circuit
- Jour 3 : HIIT + force

---

## 💪 Bibliothèque d'Exercices (50+ exercices)

### Poussée horizontale
- Pompe murale → Pompe inclinée → Pompe classique → Pompe pieds surélevés → Pompe diamant → Pompe archer
- Développé couché haltères

### Tirage horizontal
- Rowing élastique → Superman row → Rowing haltère → Rowing buste penché

### Poussée verticale
- Pike pushup → Dips banc → Développé épaules haltères → Développé militaire

### Tirage vertical
- Suspension active → Tractions élastique assistées → Tractions complètes

### Jambes
- Squat : chaise → poids du corps → gobelet → bulgare → sauté
- Fente : avant → arrière → marchée → bulgare

### Hinge
- Hip thrust → Hip thrust lesté → Soulevé de terre roumain → SDT unijambiste

### Gainage/Core
- Planche genoux → Planche → Planche latérale → Planche lestée
- Bird dog → Pallof press

### Cardio/HIIT
- Marche rapide → Montée de genoux → Jumping jacks → Jogging sur place → Mountain climbers → Corde à sauter → Burpees

### Mobilité/Récupération
- Chat-vache → Étirements → Rotations thoraciques → Respiration diaphragmatique

---

## 🏆 Défi Mensuel

Chaque mois, un défi personnalisé est généré selon l'objectif :

**Force** : 200 pompes classiques dans le mois
**Musculation** : 250 pompes
**Endurance** : 60 min de jogging sur place
**Perte de poids** : 500 mountain climbers

Les répétitions réalisées pendant les séances comptent automatiquement. Le coach adapte la difficulté si nécessaire.

---

## 📈 Progression Tracking

Pour chaque exercice :
- **bestReps** : record personnel
- **attempts** : historique de toutes les tentatives
- **trend** : 📈 progression / 📉 régression / ➡️ stable

---

## 🤖 Coach Conversationnel

Le coach comprend :
- "Je suis fatigué" → Proposer une séance plus légère
- "Je n'ai que 20 minutes" → Adapter la durée
- "Trop facile" → Proposer une progression
- "Pourquoi cette réduction ?" → Expliquer la décision

*Conversation intégrée à l'écran Sport.*

---

## ⚙️ Estimation de la Récupération

Basée sur les 7 dernières séances :
- **Bonne** : Difficulté moyenne ≤ 6 → "Peut progresser"
- **Moyenne** : 6-8 → "Attention à la progression"
- **Faible** : ≥ 8 → "Envisage une séance plus légère"

---

## 🔄 Cycle d'Adaptation (Exemple)

```
Semaine 1 (Adaptation) :
- Session 1 : Pompes 3×10 → Difficulté 5/10 ✅
- Session 2 : Squat 3×12 → Difficulté 6/10 ✅
- Session 3 : Rowing 3×8 → Difficulté 4/10 → Trop facile 📈

Coach analyse → Décision :
- Pompes : maintien (5/10)
- Squat : maintien (6/10)
- Rowing : **progression proposée** (variante plus difficile)

Semaine 2 (Nouvelle séance générée) :
- Rowing : Passe à rowing haltères (variante plus difficile)
- Autres : maintien
```

---

## 🚀 Prochaines itérations possibles

**MVP fait :**
- ✅ Onboarding sport
- ✅ Génération automatique de programme
- ✅ Séance interactive
- ✅ Feedback et adaptation
- ✅ Progression tracking
- ✅ Défi mensuel

**À ajouter plus tard :**
- Cycles d'entraînement multi-semaines
- Évaluation initiale (test de performance)
- Video/images des exercices
- Intégration nutrition ← musculaire
- Social/partage de progression
- Musique pendant la séance
- Intégration wearables

---

## 🎮 Tester le prototype

1. **Ouvrir l'app** dans un navigateur
2. **Onglet Sport** → "Commencer"
3. **Remplir** l'onboarding
4. **Voir** le programme généré
5. **Cliquer** sur une séance
6. **Enregistrer** feedback (reps, difficulté, ressenti)
7. **Terminer** → Coach analyse et adapte

---

## 📝 Notes Techniques

- **Stockage** : localStorage (DATA synchronisé)
- **Pas de serveur** : tout fonctionne offline-first
- **Pas d'IA générative** : moteur de règles explicite
- **Tracabilité** : chaque décision enregistrée avec justification
- **Extensible** : facile d'ajouter des exercices/règles

---

## 🛠️ Code Structure

```
index.html        ← UI + overlay onboarding
app.js            ← Fonctions UI sport (renderSport, openSession, etc.)
sport-data.js     ← Bibliothèque d'exercices (50+)
sport-engine.js   ← Moteur coaching (adaptations, défis, progression)
data.js           ← Structure DATA.sport
```

**Entrées :**
- `saveSportSetup()` → initialise DATA.sport.profile et crée le programme
- `openSession(id)` → affiche la séance
- `recordExerciseFeedback()` → enregistre feedback exercice
- `finishSession(id)` → lance l'adaptation

**Sorties :**
- DATA.sport.currentProgram : le programme en cours
- DATA.sport.sessionHistory : historique complet
- DATA.sport.exerciseProgress : progression par exercice
- DATA.sport.coachDecisions : toutes les adaptations

---

Bon entraînement ! 🏋️

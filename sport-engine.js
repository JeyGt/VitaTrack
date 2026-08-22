/* VitaTrack - Moteur de coaching sportif adaptatif
   Cœur du système : analyse des performances, adaptation du programme
   Moteur de règles + historique + progression */

/* Additionne les répétitions, que la valeur soit un tableau (ex: [15,14,13]) ou un nombre simple. */
function sumReps(reps) {
  if (Array.isArray(reps)) return reps.reduce((a, b) => a + (Number(b) || 0), 0);
  return Number(reps) || 0;
}

/* ===== DÉCISIONS DU COACH ADAPTATIVES ===== */

function adaptSession(sessionId) {
  const session = DATA.sport.currentProgram?.sessions.find(s => s.id === sessionId);
  if (!session || session.status !== 'completed') return null;

  const exerciseFeedbacks = session.exercises || [];
  const avgDifficulty = exerciseFeedbacks.length > 0
    ? exerciseFeedbacks.reduce((sum, e) => sum + (e.difficulty || 5), 0) / exerciseFeedbacks.length
    : 5;

  const decision = {
    sessionId,
    date: new Date().toISOString().split('T')[0],
    avgDifficulty,
    adaptations: []
  };

  exerciseFeedbacks.forEach(fb => {
    const ex = exerciseById(fb.exerciseId);
    if (!ex) return;

    const adaptation = { exerciseId: fb.exerciseId, name: ex.name, action: 'maintain', reason: '' };

    // Logique d'adaptation basée sur le feedback
    if (fb.difficulty >= 8) {
      adaptation.action = 'reduce';
      adaptation.reason = `Difficulté ${fb.difficulty}/10 → réduction du volume ou substitution`;
      if (ex.variants.easier && ex.variants.easier.length > 0) {
        adaptation.recommendation = 'easier_variant';
        adaptation.suggestedId = ex.variants.easier[0];
      }
    } else if (fb.difficulty <= 3 && sumReps(fb.repsCompleted) >= (sumReps(fb.plannedReps) * 1.1)) {
      adaptation.action = 'progress';
      adaptation.reason = `Difficulté ${fb.difficulty}/10 et dépassement des répétitions → progression possible`;
      if (ex.variants.harder && ex.variants.harder.length > 0) {
        adaptation.recommendation = 'harder_variant';
        adaptation.suggestedId = ex.variants.harder[0];
      }
    } else if (fb.feedback === 'adapted') {
      adaptation.action = 'maintain';
      adaptation.reason = 'Exercice bien dosé, maintien';
    } else if (fb.feedback === 'too_easy') {
      adaptation.action = 'progress';
      adaptation.reason = 'Utilisateur rapporte trop facile → progression prochainement';
    }

    decision.adaptations.push(adaptation);
  });

  // Enregistrer la décision
  DATA.sport.coachDecisions.push(decision);
  saveState();
  return decision;
}

/* ===== GÉNÉRATION INITIALE DE PROGRAMME ===== */

/* Retourne la structure de séances (jour, nom, mouvements ciblés) pour un objectif
   et un nombre de séances/semaine donnés. Réutilisée par generateInitialProgram()
   et advanceWeek() pour que la structure de la semaine reste stable d'une semaine
   à l'autre (seuls les exercices/charges évoluent). */
function weekStructure(objectivePrimary, sessionsPerWeek) {
  if (objectivePrimary === 'force') {
    if (sessionsPerWeek >= 4) {
      return [
        { id: 'jour_1', name: 'Haut du corps - Force', movements: 'push_h, pull_h, push_v' },
        { id: 'jour_2', name: 'Jambes - Force', movements: 'squat, hinge, lunge' },
        { id: 'jour_3', name: 'Haut du corps accessoires', movements: 'pull_h, push_h' },
        { id: 'jour_4', name: 'Jambes + cardio', movements: 'squat, lunge, loco' }
      ];
    } else if (sessionsPerWeek === 3) {
      return [
        { id: 'jour_1', name: 'Full body A', movements: 'push_h, squat, pull_h, core' },
        { id: 'jour_2', name: 'Jambes', movements: 'squat, hinge, lunge, loco' },
        { id: 'jour_3', name: 'Full body B', movements: 'pull_h, push_v, hinge, core' }
      ];
    }
  } else if (objectivePrimary === 'musculation') {
    if (sessionsPerWeek >= 4) {
      return [
        { id: 'jour_1', name: 'Poitrine / Triceps', movements: 'push_h, push_v, core' },
        { id: 'jour_2', name: 'Dos / Biceps', movements: 'pull_h, pull_v, anti_rot' },
        { id: 'jour_3', name: 'Jambes', movements: 'squat, lunge, hinge' },
        { id: 'jour_4', name: 'Accessoires', movements: 'push_h, pull_h, core' }
      ];
    }
    return [
      { id: 'jour_1', name: 'Full body A', movements: 'push_h, squat, pull_h' },
      { id: 'jour_2', name: 'Full body B', movements: 'push_v, hinge, pull_v' },
      { id: 'jour_3', name: 'Full body C', movements: 'lunge, push_h, pull_h' }
    ];
  } else if (objectivePrimary === 'endurance' || objectivePrimary === 'perte_poids') {
    if (sessionsPerWeek >= 3) {
      return [
        { id: 'jour_1', name: 'Cardio + poids du corps', movements: 'loco, squat, push_h' },
        { id: 'jour_2', name: 'Full body circuit', movements: 'squat, push_h, pull_h, loco' },
        { id: 'jour_3', name: 'HIIT + force', movements: 'mountain_climbers, burpees, fente_avant' }
      ];
    }
  }
  // Condition physique générale (fallback)
  return [
    { id: 'jour_1', name: 'Mobilité + force légère', movements: 'push_h, squat, mobility' },
    { id: 'jour_2', name: 'Cardio modéré', movements: 'jogging_sur_place, lunge, pull_h' },
    { id: 'jour_3', name: 'Full body récupération', movements: 'planche, hip_thrust_sol, pull_h' }
  ];
}

function generateInitialProgram() {
  const profile = DATA.sport.profile;
  const objectives = DATA.sport.objectives;

  const program = {
    id: 'program_' + Date.now(),
    createdDate: new Date().toISOString().split('T')[0],
    cycle: 1,
    week: 1,
    isDeload: false,
    sessions: []
  };

  const sessionsPerWeek = profile.sessionsPerWeek || 3;
  const availableDays = profile.preferredDays || ['lun', 'mer', 'ven'];
  const structure = weekStructure(objectives.primary, sessionsPerWeek);

  program.sessions = structure.map((s, i) =>
    createSession(s.id, s.name, s.movements, availableDays[i] || 'sam')
  );

  DATA.sport.currentProgram = program;
  DATA.sport.programHistory = DATA.sport.programHistory || [];
  saveState();
  return program;
}

/* intensityFactor : 1 = volume normal, <1 = séance allégée (deload).
   forcedExerciseIds : map { movementSlot: exerciseId } pour imposer un exercice précis
   (utilisé par advanceWeek() afin d'appliquer les variantes proposées par le coach). */
function createSession(dayId, sessionName, movementsFocusStr, dayOfWeek, intensityFactor = 1, forcedExerciseIds = {}) {
  const durationBase = DATA.sport.profile.sessionDuration || 35;
  const exercises = selectExercisesForSession(movementsFocusStr, DATA.sport.profile.level, DATA.sport.profile.equipment, durationBase, forcedExerciseIds);

  return {
    id: 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    dayOfWeek,
    name: sessionName + (intensityFactor < 1 ? ' (allégée)' : ''),
    targetDuration: Math.round(durationBase * intensityFactor),
    isDeload: intensityFactor < 1,
    exercises: exercises.map(ex => {
      const baseReps = ex.plannedReps || [10, 10, 10];
      const scaledReps = intensityFactor < 1
        ? baseReps.map(r => Math.max(4, Math.round(r * intensityFactor)))
        : baseReps;
      return {
        id: Math.random().toString(36).slice(2, 7),
        exerciseId: ex.id,
        exerciseName: ex.name,
        plannedReps: scaledReps,
        plannedSets: scaledReps.length,
        plannedRestSeconds: 60,
        repsCompleted: null,
        difficulty: null,
        feedback: null,
        notes: ''
      };
    }),
    status: 'pending', // pending, in_progress, completed, skipped
    startTime: null,
    endTime: null,
    completedDate: null
  };
}

function selectExercisesForSession(movementsFocus, level, equipment, durationTarget, forcedExerciseIds = {}) {
  // Sélectionne des exercices adaptés aux critères, en respectant approximativement la durée
  const focusedMovements = movementsFocus.split(',').map(m => m.trim());
  const candidates = EXERCISES.filter(ex => {
    const hasMovement = focusedMovements.some(m => ex.move === m);
    const isAppropriateLevel = 
      (level === 'debutant' && ['debutant', 'intermediaire'].includes(ex.level)) ||
      (level === 'intermediaire' && ['debutant', 'intermediaire', 'avance'].includes(ex.level)) ||
      (level === 'avance');
    const hasEquipment = ex.equip.some(e => equipment.includes(e));
    return hasMovement && isAppropriateLevel && hasEquipment;
  });

  // Prioriser : 1 exo principal, 2-3 accessoires
  const selected = [];
  const perDuration = durationTarget / 35; // ratio par rapport à 35 min
  const targetCount = Math.round(3 * perDuration);
  const forcedIds = Object.values(forcedExerciseIds).filter(Boolean);

  for (let i = 0; i < targetCount && candidates.length > 0; i++) {
    // Priorité aux exercices imposés par le coach (variante suggérée la semaine passée),
    // s'ils correspondent au mouvement recherché ici.
    let idx = -1;
    if (forcedIds.length > 0) {
      idx = candidates.findIndex(c => forcedIds.includes(c.id));
    }
    if (idx === -1) idx = Math.floor(Math.random() * candidates.length);
    const ex = candidates[idx];
    selected.push({ ...ex, plannedReps: [10, 10, 10].slice(0, i === 0 ? 3 : 2) });
    candidates.splice(idx, 1);
  }

  return selected;
}

/* ===== PROGRESSION DE SEMAINE (cycles multi-semaines + application des adaptations) ===== */

/* Vrai une semaine sur 4 (semaines 4, 8, 12...) : volume réduit pour permettre la récupération. */
function isDeloadWeek(weekNumber) {
  return weekNumber > 0 && weekNumber % 4 === 0;
}

/* Regarde les dernières décisions du coach pour la semaine qui vient de se terminer et
   construit, pour chaque exerciseId d'origine ayant reçu une décision 'progress' ou 'reduce',
   l'id de la variante à utiliser à la place la semaine prochaine. */
function pendingVariantSwaps() {
  const decisions = DATA.sport.coachDecisions || [];
  const swaps = {};
  decisions.forEach(d => {
    (d.adaptations || []).forEach(a => {
      if (a.suggestedId && (a.action === 'progress' || a.action === 'reduce')) {
        swaps[a.exerciseId] = a.suggestedId;
      }
    });
  });
  return swaps;
}

/* Fait passer le programme à la semaine suivante :
   - régénère les séances de la structure hebdomadaire (même split, exercices renouvelés)
   - applique les variantes suggérées par le coach sur les exercices concernés
   - déclenche une semaine allégée (deload) toutes les 4 semaines
   - archive la semaine précédente dans DATA.sport.programHistory */
function advanceWeek() {
  const program = DATA.sport.currentProgram;
  if (!program) return null;

  DATA.sport.programHistory = DATA.sport.programHistory || [];
  DATA.sport.programHistory.push({
    cycle: program.cycle,
    week: program.week,
    isDeload: !!program.isDeload,
    sessions: program.sessions
  });

  const profile = DATA.sport.profile;
  const objectives = DATA.sport.objectives;
  const sessionsPerWeek = profile.sessionsPerWeek || 3;
  const availableDays = profile.preferredDays || ['lun', 'mer', 'ven'];
  const structure = weekStructure(objectives.primary, sessionsPerWeek);

  const nextWeek = program.week + 1;
  const deload = isDeloadWeek(nextWeek);
  const intensityFactor = deload ? 0.6 : 1;
  const swaps = pendingVariantSwaps();

  const newSessions = structure.map((s, i) => {
    // Ne force que les mouvements concernés par cette séance : on ne propage un swap
    // que si l'exercice remplacé faisait partie des mouvements ciblés par cette séance.
    const focusedMovements = s.movements.split(',').map(m => m.trim());
    const forced = {};
    Object.entries(swaps).forEach(([oldId, newId]) => {
      const newEx = EXERCISES.find(e => e.id === newId);
      if (newEx && focusedMovements.includes(newEx.move)) forced[oldId] = newId;
    });
    return createSession(s.id, s.name, s.movements, availableDays[i] || 'sam', intensityFactor, forced);
  });

  program.week = nextWeek;
  program.isDeload = deload;
  program.sessions = newSessions;
  if (nextWeek > 1 && (nextWeek - 1) % 4 === 0) {
    // Nouveau cycle après chaque semaine de deload
    program.cycle += 1;
  }

  saveState();
  return program;
}

/* Vrai si toutes les séances de la semaine en cours sont terminées ou passées (skipped/completed). */
function weekIsComplete(program) {
  if (!program || !program.sessions?.length) return false;
  return program.sessions.every(s => s.status === 'completed' || s.status === 'skipped');
}



function recordSessionFeedback(sessionId, exerciseId, repsCompleted, difficulty, feedbackType, notes = '') {
  const program = DATA.sport.currentProgram;
  const sessionObj = program?.sessions?.find(s => s.id === sessionId);
  if (!sessionObj) return;

  const exObj = sessionObj.exercises.find(e => e.exerciseId === exerciseId);
  if (!exObj) return;

  exObj.repsCompleted = repsCompleted;
  exObj.difficulty = difficulty; // 1-10
  exObj.feedback = feedbackType; // 'too_easy', 'adapted', 'too_difficult'
  exObj.notes = notes;

  saveState();
}

function completeSession(sessionId) {
  const program = DATA.sport.currentProgram;
  const session = program?.sessions?.find(s => s.id === sessionId);
  if (!session) return;

  session.status = 'completed';
  session.endTime = new Date().toISOString();
  session.completedDate = new Date().toISOString().split('T')[0];

  // Trigger adaptation
  const adaptation = adaptSession(sessionId);

  // Enregistrer via la source unique d'historique Sport.
  const historyEntry = { ...session, adaptationDecision: adaptation, type: 'workout', source: 'coach' };
  if (typeof window.recordSportActivity !== 'function') {
    console.error('VitaTrack Sport: source unique d’enregistrement indisponible.');
    return { ...adaptation, weekAdvanced:false, recordingError:true };
  }
  window.recordSportActivity(historyEntry);

  // Si toutes les séances de la semaine sont faites, on passe automatiquement
  // à la semaine suivante (nouveau split, variantes du coach appliquées, deload si besoin).
  let weekAdvanced = false;
  if (weekIsComplete(program)) {
    advanceWeek();
    weekAdvanced = true;
  }

  saveState();
  return { ...adaptation, weekAdvanced };
}

/* ===== ESTIMATION DE LA RÉCUPÉRATION ===== */

function estimateRecovery() {
  const lastSessions = (DATA.sport.sessionHistory || []).slice(-7);
  if (lastSessions.length === 0) return { status: 'bonne', label: '✅ Bonne' };

  const avgDifficulty = lastSessions.reduce((sum, s) => {
    const sessExercises = s.exercises || [];
    const avgDiff = sessExercises.length > 0
      ? sessExercises.reduce((s2, e) => s2 + (e.difficulty || 5), 0) / sessExercises.length
      : 5;
    return sum + avgDiff;
  }, 0) / lastSessions.length;

  if (avgDifficulty >= 8) return { status: 'faible', label: '⚠️ Faible - envisage une séance plus légère' };
  if (avgDifficulty >= 6.5) return { status: 'moyenne', label: '📊 Moyenne - attention à la progression' };
  return { status: 'bonne', label: '✅ Bonne - peux progresser légèrement' };
}

/* ===== DÉFI MENSUEL ===== */

function generateMonthlyChallenge() {
  const objectives = DATA.sport.objectives;
  const profile = DATA.sport.profile;

  const challenges = {
    force: [
      { exerciseId: 'pompe_classique', target: 200, unit: 'total_reps', label: '200 pompes classiques' },
      { exerciseId: 'squat_poids_corps', target: 300, unit: 'total_reps', label: '300 squats' }
    ],
    musculation: [
      { exerciseId: 'pompe_classique', target: 250, unit: 'total_reps', label: '250 pompes' },
      { exerciseId: 'hip_thrust_sol', target: 200, unit: 'total_reps', label: '200 hip thrust' }
    ],
    endurance: [
      { exerciseId: 'jogging_sur_place', target: 60, unit: 'total_minutes', label: '60 min de jogging sur place' },
      { exerciseId: 'corde_a_sauter', target: 1500, unit: 'total_reps', label: '1500 sauts à la corde' }
    ],
    perte_poids: [
      { exerciseId: 'mountain_climbers', target: 500, unit: 'total_reps', label: '500 mountain climbers' },
      { exerciseId: 'burpees', target: 100, unit: 'total_reps', label: '100 burpees' }
    ]
  };

  const categoryKey = objectives.primary || 'condition_physique';
  const options = challenges[categoryKey] || [{ exerciseId: 'pompe_classique', target: 150, unit: 'total_reps', label: '150 pompes' }];
  const challenge = options[Math.floor(Math.random() * options.length)];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  return {
    id: 'challenge_' + monthStart,
    monthStart,
    monthEnd,
    exerciseId: challenge.exerciseId,
    label: challenge.label,
    target: challenge.target,
    unit: challenge.unit,
    progress: 0,
    completed: false
  };
}

function updateChallengeProgress(exerciseId, reps) {
  const challenge = DATA.sport.monthlyChallenge;
  if (!challenge || challenge.exerciseId !== exerciseId) return;

  if (challenge.unit === 'total_reps') {
    challenge.progress += reps;
  } else if (challenge.unit === 'total_minutes') {
    challenge.progress += 1; // simplified: 1 per session
  }

  if (challenge.progress >= challenge.target) {
    challenge.completed = true;
  }

  saveState();
}

/* ===== PROGRESSION TRACKING ===== */

function trackProgress(exerciseId, reps, difficulty) {
  if (!DATA.sport.exerciseProgress) DATA.sport.exerciseProgress = {};
  if (!DATA.sport.exerciseProgress[exerciseId]) {
    DATA.sport.exerciseProgress[exerciseId] = {
      exerciseId,
      bestReps: reps,
      bestDifficulty: difficulty,
      attempts: [],
      trend: 'stable'
    };
  }

  const progress = DATA.sport.exerciseProgress[exerciseId];
  progress.attempts.push({
    date: new Date().toISOString().split('T')[0],
    reps,
    difficulty
  });

  if (reps > progress.bestReps) {
    progress.bestReps = reps;
    progress.trend = 'progression';
  } else if (reps < progress.bestReps * 0.8) {
    progress.trend = 'regression';
  } else {
    progress.trend = 'stable';
  }

  saveState();
}

/* ===== TEST DE PERFORMANCE INITIAL ===== */

/* Barèmes indicatifs (nombre de répétitions en 30 secondes) pour calibrer le niveau
   de départ, plutôt que de se fier uniquement à une auto-évaluation déclarative.
   Volontairement prudents : mieux vaut sous-estimer un niveau que sur-estimer et
   proposer un exercice trop difficile en première séance. */
const PERFORMANCE_TEST_THRESHOLDS = {
  pompes: { debutant: 0, intermediaire: 8, avance: 18 },
  squats: { debutant: 0, intermediaire: 15, avance: 30 }
};

/* results = { pompes: number, squats: number } — reps réalisées en 30s pour chaque test.
   Retourne { level, detail } où detail explique le calcul (traçabilité, comme le reste
   du moteur). Le niveau retenu est le plus prudent des deux tests (le minimum). */
function evaluatePerformanceTest(results) {
  const levelRank = { debutant: 0, intermediaire: 1, avance: 2 };
  const rankLevel = ['debutant', 'intermediaire', 'avance'];

  function levelFor(testKey, reps) {
    const t = PERFORMANCE_TEST_THRESHOLDS[testKey];
    if (reps >= t.avance) return 'avance';
    if (reps >= t.intermediaire) return 'intermediaire';
    return 'debutant';
  }

  const pompesLevel = levelFor('pompes', Number(results.pompes) || 0);
  const squatsLevel = levelFor('squats', Number(results.squats) || 0);
  const finalRank = Math.min(levelRank[pompesLevel], levelRank[squatsLevel]);
  const finalLevel = rankLevel[finalRank];

  return {
    level: finalLevel,
    detail: {
      pompes: { reps: Number(results.pompes) || 0, level: pompesLevel },
      squats: { reps: Number(results.squats) || 0, level: squatsLevel },
      reason: `Niveau retenu : le plus prudent des deux tests (pompes → ${pompesLevel}, squats → ${squatsLevel}).`
    }
  };
}

/* Applique le résultat du test au profil sport et régénère le programme initial
   avec le niveau recalibré. À appeler depuis l'onboarding, après le test optionnel. */
function applyPerformanceTest(results) {
  const evalResult = evaluatePerformanceTest(results);
  DATA.sport.profile.level = evalResult.level;
  DATA.sport.performanceTest = {
    date: new Date().toISOString().split('T')[0],
    results,
    ...evalResult
  };
  saveState();
  return evalResult;
}

/* ===== COACH CONVERSATIONNEL ===== */

function coachResponse(userQuery) {
  const query = userQuery.toLowerCase().trim();
  const profile = DATA.sport.profile;
  const recovery = estimateRecovery();
  const challenge = DATA.sport.monthlyChallenge;

  if (query.includes('fatigué') || query.includes('fatigue') || query.includes('pas en forme')) {
    return {
      title: 'Je comprends',
      text: `${recovery.status === 'faible' ? 'Tu as l\'air vraiment fatigué. ' : ''}Veux-tu que je réduis l'intensité d\'aujourd\'hui ? Je peux proposer une version plus légère de ta séance ou même une séance de récupération active.`,
      action: 'reduce_session'
    };
  }

  if (query.includes('temps') && query.includes('20') || query.includes('15') || query.includes('30')) {
    const match = query.match(/(\d+)\s*min/);
    const availableTime = match ? parseInt(match[1]) : 20;
    return {
      title: 'Pas de problème',
      text: `J'adapte ta séance à ${availableTime} minutes. Concentrons-nous sur l'essentiel : on garde les exercices clés et on raccourcit les accessoires.`,
      action: 'adapt_duration',
      data: { duration: availableTime }
    };
  }

  if (query.includes('défi') || query.includes('challenge')) {
    return {
      title: 'Ton défi du mois',
      text: challenge ? `${challenge.label}\n\nProgression : ${Math.round(challenge.progress / challenge.target * 100)}%` : 'Pas encore de défi.',
      action: 'show_challenge'
    };
  }

  if (query.includes('progresser') || query.includes('progression')) {
    return {
      title: 'C\'est bon !',
      text: `Tu progresses régulièrement. Je vois tes améliorations et j'ajuste petit à petit. Reste régulier.`,
      action: 'encourage'
    };
  }

  return {
    title: 'Je suis là',
    text: 'Raconte-moi ce qui se passe ou demande-moi d\'adapter ta séance (moins de temps, trop difficile, trop facile, etc.)',
    action: 'general'
  };
}


/* ============================================================
   Historique, normalisation et statistiques Sport
   ============================================================ */
/* VitaTrack Sport — source unique d'enregistrement + historique + calories */
(function(){
  const HISTORY_SCHEMA_VERSION=2;

  function asNumberArray(value){
    if(!Array.isArray(value)) return [];
    return value.map(v=>Number(v)).filter(Number.isFinite);
  }
  function durationMinutesFromTimes(a){
    const start=a?.startTime||a?.start;
    const end=a?.endTime||a?.end;
    if(!start||!end) return 0;
    const ms=new Date(end).getTime()-new Date(start).getTime();
    return Number.isFinite(ms)&&ms>0?Math.max(1,Math.round(ms/60000)):0;
  }
  function averageDifficulty(exercises){
    const vals=(exercises||[]).map(e=>Number(e?.difficulty)).filter(v=>v>=1&&v<=10);
    return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10)/10:null;
  }
  function normaliseExercise(e={}){
    const durationScalar=Number(e.durationSeconds)||0;
    const durations=asNumberArray(e.durationsSeconds);
    if(!durations.length&&durationScalar>0) durations.push(durationScalar);
    const reps=asNumberArray(e.repsCompleted);
    const plannedReps=Array.isArray(e.plannedReps)?e.plannedReps.map(v=>Number(v)).filter(Number.isFinite):[];
    return {
      ...e,
      exerciseId:e.exerciseId||e.id||null,
      exerciseName:e.exerciseName||e.name||'Exercice',
      plannedReps,
      plannedSets:Number(e.plannedSets)||(plannedReps.length||null),
      plannedRestSeconds:Number(e.plannedRestSeconds||e.rest)||0,
      repsCompleted:reps,
      durationsSeconds:durations,
      durationSeconds:durations.reduce((n,v)=>n+v,0)||null,
      difficulty:(Number(e.difficulty)>=1&&Number(e.difficulty)<=10)?Number(e.difficulty):null,
      feedback:e.feedback??null,
      notes:e.notes||''
    };
  }
  function normaliseActivity(activity={}){
    const type=activity.type==='exercise'?'exercise':'workout';
    const date=activity.completedDate||activity.date||new Date().toISOString().slice(0,10);
    const exercises=type==='workout'?(Array.isArray(activity.exercises)?activity.exercises.map(normaliseExercise):[]):[];
    let durationMinutes=Number(activity.durationMinutes)||durationMinutesFromTimes(activity)||0;
    if(!durationMinutes&&type==='workout') durationMinutes=Number(activity.targetDuration)||0;
    if(!durationMinutes&&type==='exercise'){
      const seconds=Number(activity.durationSeconds)||asNumberArray(activity.durationsSeconds).reduce((n,v)=>n+v,0);
      durationMinutes=seconds>0?Math.max(1,Math.round(seconds/60)):0;
    }
    let difficulty=(Number(activity.difficulty)>=1&&Number(activity.difficulty)<=10)?Number(activity.difficulty):null;
    if(difficulty==null&&type==='workout') difficulty=averageDifficulty(exercises);
    const entry={
      ...activity,
      schemaVersion:HISTORY_SCHEMA_VERSION,
      id:activity.id||('sport_'+Date.now()+'_'+Math.random().toString(36).slice(2,7)),
      type,
      source:activity.source||(type==='exercise'?'library':'workout_library'),
      date,
      completedDate:date,
      status:'completed',
      recordedAt:activity.recordedAt||activity.endTime||new Date().toISOString(),
      durationMinutes,
      difficulty
    };
    if(type==='exercise'){
      const ex=normaliseExercise(activity);
      Object.assign(entry,ex,{schemaVersion:HISTORY_SCHEMA_VERSION,type:'exercise',date,completedDate:date,status:'completed',recordedAt:entry.recordedAt,source:entry.source,durationMinutes});
    } else {
      entry.exercises=exercises;
      entry.workoutName=activity.workoutName||activity.name||'Entraînement';
    }
    return entry;
  }

  function ensure(){
    DATA.sport=DATA.sport||{};
    if(!Array.isArray(DATA.sport.sessionHistory)) DATA.sport.sessionHistory=[];
    if(Number(DATA.sport.historySchemaVersion||0)<HISTORY_SCHEMA_VERSION){
      DATA.sport.sessionHistory=DATA.sport.sessionHistory.map(normaliseActivity);
      DATA.sport.historySchemaVersion=HISTORY_SCHEMA_VERSION;
      if(typeof saveState==='function') saveState();
    }
    return DATA.sport.sessionHistory;
  }

  function userWeight(){ return Number(DATA?.profile?.weightCurrent)||70; }
  function metForExercise(e){
    const n=String(e?.exerciseName||e?.name||'').toLowerCase();
    if(/course|running|sprint|burpee|jump|corde|mountain|cardio/.test(n)) return 8;
    if(/marche|walking|randonnée|hike|vélo|bike|cycling|natation|swim/.test(n)) return 6;
    if(/gainage|planche|plank|mobilité|stretch/.test(n)) return 3.5;
    if(/pompe|push|squat|fente|lunge|traction|pull|dips|abdo|crunch|musculation|renforcement/.test(n)) return 6;
    return 5;
  }
  function kcalFromMinutes(minutes,met){ return Math.max(0,Math.round((met*3.5*userWeight()/200)*minutes)); }
  window.sportKcalForActivity=function(a){
    if(!a) return 0;
    if(a.type==='exercise'){
      const seconds=Number(a.durationSeconds)||asNumberArray(a.durationsSeconds).reduce((n,v)=>n+v,0);
      if(seconds>0) return kcalFromMinutes(seconds/60,metForExercise(a));
      const reps=asNumberArray(a.repsCompleted).reduce((s,v)=>s+v,0);
      return kcalFromMinutes((reps*3)/60,metForExercise(a));
    }
    if(a.type==='workout'){
      if(Number(a.durationMinutes)>0) return kcalFromMinutes(Number(a.durationMinutes),6);
      return (a.exercises||[]).reduce((sum,e)=>sum+sportKcalForActivity({...e,type:'exercise'}),0);
    }
    return 0;
  };
  window.sportKcalForSession=window.sportKcalForActivity;
  window.normaliseSportActivity=normaliseActivity;

  window.recordSportActivity=function(activity){
    const h=ensure();
    const entry=normaliseActivity(activity);
    entry.estimatedKcal=sportKcalForActivity(entry);
    const i=h.findIndex(x=>String(x.id)===String(entry.id));
    if(i>=0) h[i]={...h[i],...entry}; else h.push(entry);
    if(typeof saveState==='function') saveState();
    return entry;
  };
  window.getSportHistory=function(){return ensure();};
  window.closeSportHistory=function(){document.getElementById('sportHistoryPanel')?.classList.remove('open');document.body.style.overflow='';};
  window.getSportHistoryStats=function(){
    const h=ensure();
    const workouts=h.filter(x=>x.type==='workout');
    const exercises=h.filter(x=>x.type==='exercise');
    const performed=workouts.reduce((n,s)=>n+(Array.isArray(s.exercises)?s.exercises.length:0),0)+exercises.length;
    const difficulties=h.map(x=>Number(x.difficulty)).filter(x=>x>=1&&x<=10);
    const kcal=h.reduce((n,x)=>n+Number(x.estimatedKcal||sportKcalForActivity(x)||0),0);
    return {total:h.length,workouts:workouts.length,individualExercises:exercises.length,performedExercises:performed,avgDifficulty:difficulties.length?Math.round(difficulties.reduce((a,b)=>a+b,0)/difficulties.length*10)/10:null,kcal:kcal};
  };


  function numericPerformance(a){
    if(!a) return 0;
    if(a.type==='exercise'){
      const reps=(a.repsCompleted||[]).reduce((n,v)=>n+(Number(v)||0),0);
      if(reps) return reps;
      const ds=(a.durationsSeconds||[]).reduce((n,v)=>n+(Number(v)||0),0);
      return ds;
    }
    const ex=a.exercises||[];
    return ex.reduce((sum,e)=>sum+(e.repsCompleted||[]).reduce((n,v)=>n+(Number(v)||0),0),0);
  }
  function progressData(){
    const h=ensure().filter(x=>x.status==='completed').sort((a,b)=>String(a.recordedAt||a.date).localeCompare(String(b.recordedAt||b.date)));
    const exerciseMap={};
    h.forEach(a=>{
      if(a.type==='exercise'){
        const key=String(a.exerciseId||a.exerciseName||'').trim(); if(!key)return;
        (exerciseMap[key] ||= {name:a.exerciseName||'Exercice',items:[]}).items.push(a);
      } else if(Array.isArray(a.exercises)) a.exercises.forEach(e=>{
        const key=String(e.exerciseId||e.exerciseName||e.name||'').trim(); if(!key)return;
        (exerciseMap[key] ||= {name:e.exerciseName||e.name||'Exercice',items:[]}).items.push({...e,type:'exercise',recordedAt:a.recordedAt,date:a.date,completedDate:a.completedDate});
      });
    });
    const top=Object.values(exerciseMap).map(x=>{
      const items=x.items.filter(i=>numericPerformance(i)>0);
      if(!items.length)return null;
      const last=items[items.length-1], prev=items.length>1?items[items.length-2]:null;
      const lv=numericPerformance(last), pv=prev?numericPerformance(prev):lv;
      return {...x,last:lv,prev:pv,delta:lv-pv,count:items.length};
    }).filter(Boolean).sort((a,b)=>b.count-a.count||b.last-a.last).slice(0,8);
    const kcal=h.reduce((n,a)=>n+Number(a.estimatedKcal||sportKcalForActivity(a)||0),0);
    const last7=h.filter(a=>Date.now()-new Date(a.recordedAt||a.date).getTime()<=7*86400000).length;
    const durations=h.reduce((n,a)=>n+Number(a.durationMinutes||0),0);
    return {h,top,kcal,last7,durations};
  }
  window.openSportProgress=function(){
    let p=document.getElementById('sportProgressPanel');
    if(!p){p=document.createElement('div');p.id='sportProgressPanel';p.className='sport-panel';document.body.appendChild(p);}
    const d=progressData(), sessions=d.h.length;
    const max=Math.max(1,...d.top.map(x=>x.last));
    const rows=d.top.map(x=>{
      const pct=Math.max(8,Math.round(x.last/max*100));
      const arrow=x.delta>0?'↗':x.delta<0?'↘':'→';
      const delta=x.delta>0?`+${x.delta}`:String(x.delta);
      return `<div class="sport-progress-row"><div class="sport-progress-row-head"><strong>${escapeHtmlHistory(x.name)}</strong><span>${arrow} ${delta} · ${x.count} fois</span></div><div class="sport-progress-bar"><i style="width:${pct}%"></i></div><small>Dernière réalisation : ${x.last}</small></div>`;
    }).join('');
    p.innerHTML=`<div class="sport-panel-head"><h2>📈 Progression</h2><button class="sport-close" onclick="closeSportProgress()">×</button></div>
      <div class="sport-metrics"><div class="sport-metric"><strong>${sessions}</strong><small>activités</small></div><div class="sport-metric"><strong>${d.last7}</strong><small>7 derniers jours</small></div><div class="sport-metric"><strong>${Math.round(d.kcal)}</strong><small>kcal sport</small></div></div>
      <div class="card" style="margin-top:12px"><div class="eyebrow">📈 Tes performances</div><p class="muted small" style="margin:4px 0 12px">Comparaison de ta dernière réalisation avec la précédente.</p>${rows||'<p class="muted small">Fais quelques exercices pour commencer à voir ta progression.</p>'}</div>
      <div class="card" style="margin-top:10px"><div class="eyebrow">🏃 Régularité</div><strong style="font-size:24px">${sportStreak? sportStreak():0} jour${(sportStreak? sportStreak():0)>1?'s':''}</strong><p class="muted small">série actuelle d’activités enregistrées.</p></div>`;
    p.classList.add('open');document.body.style.overflow='hidden';
  };
  window.closeSportProgress=function(){document.getElementById('sportProgressPanel')?.classList.remove('open');document.body.style.overflow='';};

  window.openSportHistory=function(){
    let p=document.getElementById('sportHistoryPanel');
    if(!p){p=document.createElement('div');p.id='sportHistoryPanel';p.className='sport-panel sport-history-panel';document.body.appendChild(p);}
    const h=[...ensure()].sort((a,b)=>String(b.recordedAt||b.date).localeCompare(String(a.recordedAt||a.date)));
    const st=getSportHistoryStats();
    const totalKcal=Math.round(st.kcal);
    const renderActivity=(x)=>{
      const kcal=Math.round(Number(x.estimatedKcal||sportKcalForActivity(x)||0));
      const title=escapeHtmlHistory(x.type==='exercise'?x.exerciseName:x.workoutName||x.name||'Entraînement');
      const rawDate=x.completedDate||x.date||'';
      const when=rawDate?(()=>{const m=String(rawDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}-${m[2]}-${m[1].slice(2)}`:String(rawDate);})():'—';
      const time=x.recordedAt?`(${new Date(x.recordedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})})`:'';
      const difficulty=x.difficulty?x.difficulty+'/10':'—';
      let realization='—';
      if(x.type==='exercise'){
        const reps=Array.isArray(x.repsCompleted)?x.repsCompleted:[];
        const durations=Array.isArray(x.durationsSeconds)?x.durationsSeconds:[];
        realization=reps.length ? reps.join(' / ')+' reps' : durations.length ? durations.map(v=>v+' s').join(' / ') : '—';
      } else {
        const ex=Array.isArray(x.exercises)?x.exercises:[];
        realization=x.durationMinutes ? Math.round(x.durationMinutes)+' min' : (ex.length ? ex.length+' exercice'+(ex.length>1?'s':'') : '—');
      }
      return `<article class="history-activity-card"><div class="history-activity-title">${x.type==='exercise'?'💪':'🏋️'} ${title} <span class="history-type">(${x.type==='exercise'?'Exercice individuel':'Entraînement'})</span></div><div class="history-activity-line">${when}${time?' '+time:''} · Difficulté ${difficulty} · ${escapeHtmlHistory(realization)} · 🔥 ${kcal} kcal</div></article>`;
    };
    p.innerHTML=`<div class="sport-panel-head"><h2>📊 Historique</h2><button class="sport-close" onclick="closeSportHistory()">×</button></div>
      <div class="sport-metrics"><div class="sport-metric"><strong>${st.total}</strong><small>activités</small></div><div class="sport-metric"><strong>${st.workouts}</strong><small>entraînements</small></div><div class="sport-metric"><strong>${st.individualExercises}</strong><small>exercices individuels</small></div></div>
      <div class="card" style="margin-top:12px"><div class="eyebrow">🔥 Calories sport estimées</div><div style="font-family:Fraunces,serif;font-size:30px;font-weight:600">${totalKcal} kcal</div><p class="muted small">Estimation basée sur ton poids, le type d'activité et sa durée ou son volume. Ce n'est pas une mesure exacte.</p></div>
      <div class="history-list" style="margin-top:12px">${h.length?h.map(renderActivity).join(''):'<div class="card"><p class="muted">Aucune activité enregistrée.</p></div>'}</div>`;
    p.classList.add('open');
    document.body.style.overflow='hidden';
  };

  window.openSportActivityDetail=function(id){
    const a=ensure().find(x=>String(x.id)===String(id)); if(!a) return;
    let d=document.getElementById('sportActivityDetail');
    if(!d){d=document.createElement('div');d.id='sportActivityDetail';d.className='sport-panel sport-history-panel';document.body.appendChild(d);}
    const title=a.type==='exercise'?(a.exerciseName||'Exercice'):(a.workoutName||a.name||'Entraînement');
    const kcal=Math.round(Number(a.estimatedKcal||sportKcalForActivity(a)||0));
    const reps=Array.isArray(a.repsCompleted)?a.repsCompleted:[];
    const durations=Array.isArray(a.durationsSeconds)?a.durationsSeconds:[];
    let body='';
    if(a.type==='exercise'){
      body=`<div class="card detail-summary"><div><span class="detail-big">🔥 ${kcal}</span><small>kcal estimées</small></div><div><strong>${a.completedDate||a.date||'—'}</strong><small>${a.recordedAt?new Date(a.recordedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</small></div></div><div class="card"><div class="eyebrow">Réalisation</div><div class="detail-stats"><div><strong>${reps.length?reps.join(' / '):durations.length?durations.map(v=>v+' s').join(' / '):'—'}</strong><small>${reps.length?'répétitions par série':durations.length?'durée par série':'performance'}</small></div><div><strong>${a.difficulty? a.difficulty+'/10':'—'}</strong><small>difficulté</small></div></div></div>`;
    } else {
      const ex=a.exercises||[];
      body=`<div class="card detail-summary"><div><span class="detail-big">🔥 ${kcal}</span><small>kcal estimées</small></div><div><strong>${a.completedDate||a.date||'—'}</strong><small>${a.durationMinutes?Math.round(a.durationMinutes)+' min':'durée non renseignée'}</small></div></div><div class="card"><div class="eyebrow">Exercices réalisés</div>${ex.length?ex.map(e=>`<div class="detail-ex-row"><strong>${escapeHtmlHistory(e.exerciseName||e.name||'Exercice')}</strong><span>${Array.isArray(e.repsCompleted)&&e.repsCompleted.length?e.repsCompleted.join(' / '):Array.isArray(e.durationsSeconds)&&e.durationsSeconds.length?e.durationsSeconds.map(v=>v+' s').join(' / '):'—'}</span></div>`).join(''):'<p class="muted">Détail des exercices indisponible pour cette séance.</p>'}</div><div class="card"><div class="detail-stats"><div><strong>${a.difficulty?a.difficulty+'/10':'—'}</strong><small>difficulté</small></div><div><strong>${ex.length}</strong><small>exercices</small></div></div></div>`;
    }
    d.innerHTML=`<div class="sport-panel-head"><button class="sport-back" onclick="closeSportActivityDetail()">‹</button><h2>${escapeHtmlHistory(title)}</h2><button class="sport-close" onclick="closeSportActivityDetail()">×</button></div><div class="detail-content">${body}</div>`;
    d.classList.add('open'); document.body.style.overflow='hidden';
  };
  window.closeSportActivityDetail=function(){document.getElementById('sportActivityDetail')?.classList.remove('open');document.body.style.overflow='';};
  function escapeHtmlHistory(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  window.runSportHistoryTests=function(){
    const before=ensure().length,id='__sport_test_'+Date.now();
    recordSportActivity({id,type:'exercise',exerciseName:'Test',mode:'reps',repsCompleted:[20],difficulty:5});
    const after=ensure().length,dedupeBefore=ensure().length;
    recordSportActivity({id,type:'exercise',exerciseName:'Test modifié',difficulty:6});
    const dedupeAfter=ensure().length,ok=after===before+1&&dedupeAfter===dedupeBefore&&getSportHistoryStats().individualExercises>=1;
    ensure().splice(ensure().findIndex(x=>x.id===id),1);if(typeof saveState==='function')saveState();
    console.table([{test:'ajout',ok:after===before+1},{test:'anti-doublon',ok:dedupeAfter===dedupeBefore},{test:'stats',ok}]);return {success:ok,before,after};
  };

  window.runSportHistoryIntegrityTest=function(){
    const h=ensure();
    const id='__sport_integrity_test__';
    recordSportActivity({id,type:'exercise',exerciseName:'Test intégrité',mode:'reps',repsCompleted:[11],difficulty:7});
    recordSportActivity({id,type:'exercise',exerciseName:'Test intégrité',mode:'reps',repsCompleted:[12],difficulty:6});
    const matches=ensure().filter(x=>x.id===id);
    const ok=matches.length===1 && matches[0].repsCompleted?.[0]===12 && matches[0].status==='completed';
    const idx=ensure().findIndex(x=>x.id===id);
    if(idx>=0) ensure().splice(idx,1);
    if(typeof saveState==='function') saveState();
    return {ok,message:ok?'Source unique OK : création, mise à jour, dédoublonnage et sauvegarde.':'Échec de la source unique'};
  };
})();

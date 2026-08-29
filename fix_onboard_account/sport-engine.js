/* VitaTrack - Moteur de coaching sportif adaptatif
   Cœur du système : analyse des performances, adaptation du programme
   Moteur de règles + historique + progression */

/* Additionne les répétitions, que la valeur soit un tableau (ex: [15,14,13]) ou un nombre simple. */
function sumReps(reps) {
  if (Array.isArray(reps)) return reps.reduce((a, b) => a + (Number(b) || 0), 0);
  return Number(reps) || 0;
}

/* ===== DÉCISIONS DU COACH ADAPTATIVES ===== */

function refreshPendingCoachPrescriptions(exerciseIds = []) {
  const program = DATA.sport.currentProgram;
  if (!program || typeof window.sportApplyProgressionToPrescription !== 'function') return false;
  const ids = new Set((exerciseIds || []).filter(Boolean));
  let changed = false;
  (program.sessions || []).forEach(session => {
    if (session.status !== 'pending') return;
    (session.exercises || []).forEach((item, i) => {
      if (ids.size && !ids.has(item.exerciseId)) return;
      const ex = exerciseById(item.exerciseId);
      if (!ex || !item.prescription) return;
      const next = window.sportApplyProgressionToPrescription(ex, item.prescription);
      if (!next) return;
      const currentStamp = item.prescription?.adaptation?.updatedAt || '';
      const nextStamp = next?.adaptation?.updatedAt || '';
      const state = typeof window.sportExerciseProgressionState === 'function' ? window.sportExerciseProgressionState(item.exerciseId) : null;
      if (state?.updatedAt && currentStamp === state.updatedAt) return;
      if (typeof window.applyPrescriptionToProgramItem === 'function') {
        session.exercises[i] = window.applyPrescriptionToProgramItem(item, next);
        changed = true;
      }
    });
  });
  if (changed && typeof saveState === 'function') saveState();
  return changed;
}
window.refreshPendingCoachPrescriptions = refreshPendingCoachPrescriptions;

function adaptSession(sessionId) {
  const session = DATA.sport.currentProgram?.sessions.find(s => s.id === sessionId);
  if (!session || session.status !== 'completed') return null;

  const exerciseFeedbacks = session.exercises || [];
  const rated = exerciseFeedbacks.map(e=>Number(e.difficulty)).filter(v=>v>=1&&v<=10);
  const avgDifficulty = rated.length ? rated.reduce((a,b)=>a+b,0)/rated.length : null;
  const decision = {
    schemaVersion: 3,
    sessionId,
    date: new Date().toISOString().split('T')[0],
    avgDifficulty: avgDifficulty==null?null:Math.round(avgDifficulty*10)/10,
    adaptations: []
  };

  exerciseFeedbacks.forEach(fb => {
    const ex = exerciseById(fb.exerciseId);
    if (!ex) return;

    if (typeof window.sportAnalyseCompletedExercise === 'function') {
      const adaptation = window.sportAnalyseCompletedExercise(fb);
      if (adaptation) decision.adaptations.push({name:ex.name, ...adaptation});
      return;
    }

    // Fallback pour compatibilité si le modèle Coach V3 n'est pas chargé.
    const adaptation = { exerciseId: fb.exerciseId, name: ex.name, action: 'maintain', reason: 'Maintien' };
    if (fb.difficulty >= 8) {
      adaptation.action = 'reduce';
      adaptation.reason = `Difficulté ${fb.difficulty}/10 → réduction`;
      if (ex.variants?.easier?.length) { adaptation.recommendation='easier_variant'; adaptation.suggestedId=ex.variants.easier[0]; }
    } else if (fb.difficulty <= 3) {
      adaptation.action = 'progress';
      adaptation.reason = `Difficulté ${fb.difficulty}/10 → progression`;
      if (ex.variants?.harder?.length) { adaptation.recommendation='harder_variant'; adaptation.suggestedId=ex.variants.harder[0]; }
    }
    decision.adaptations.push(adaptation);
  });

  DATA.sport.coachDecisions = Array.isArray(DATA.sport.coachDecisions) ? DATA.sport.coachDecisions : [];
  DATA.sport.coachDecisions.push(decision);
  refreshPendingCoachPrescriptions(decision.adaptations.map(a=>a.exerciseId));
  saveState();
  return decision;
}

/* ===== GÉNÉRATION INITIALE DE PROGRAMME ===== */

/* Retourne la structure de séances (jour, nom, mouvements ciblés) pour un objectif
   et un nombre de séances/semaine donnés. Réutilisée par generateInitialProgram()
   et advanceWeek() pour que la structure de la semaine reste stable d'une semaine
   à l'autre (seuls les exercices/charges évoluent). */
function weekStructure(objectivePrimary, sessionsPerWeek) {
  const n=Math.max(2,Math.min(5,Math.round(Number(sessionsPerWeek)||3)));
  const templates={
    force:{
      2:[
        {id:'jour_1',name:'Full body Force A',movements:'push_h, pull_h, squat, hinge'},
        {id:'jour_2',name:'Full body Force B',movements:'push_v, pull_v, lunge, core'}
      ],
      3:[
        {id:'jour_1',name:'Full body Force A',movements:'push_h, pull_h, squat, core'},
        {id:'jour_2',name:'Jambes - Force',movements:'squat, hinge, lunge'},
        {id:'jour_3',name:'Full body Force B',movements:'push_v, pull_v, hinge, core'}
      ],
      4:[
        {id:'jour_1',name:'Haut du corps - Force',movements:'push_h, pull_v, push_v, core'},
        {id:'jour_2',name:'Jambes - Force',movements:'squat, hinge, lunge'},
        {id:'jour_3',name:'Haut du corps - Volume',movements:'pull_h, push_h, core'},
        {id:'jour_4',name:'Jambes + conditionnement',movements:'squat, lunge, hinge, loco'}
      ],
      5:[
        {id:'jour_1',name:'Poussée - Force',movements:'push_h, push_v, core'},
        {id:'jour_2',name:'Jambes - Force',movements:'squat, hinge'},
        {id:'jour_3',name:'Tirage + tronc',movements:'pull_v, core'},
        {id:'jour_4',name:'Jambes - Volume',movements:'squat, lunge, hinge'},
        {id:'jour_5',name:'Full body technique',movements:'push_h, pull_h, squat, core'}
      ]
    },
    musculation:{
      2:[
        {id:'jour_1',name:'Full body A',movements:'push_h, pull_h, squat, core'},
        {id:'jour_2',name:'Full body B',movements:'push_v, pull_v, hinge, lunge'}
      ],
      3:[
        {id:'jour_1',name:'Full body A',movements:'push_h, squat, pull_h'},
        {id:'jour_2',name:'Full body B',movements:'push_v, hinge, core'},
        {id:'jour_3',name:'Full body C',movements:'lunge, push_h, pull_v, core'}
      ],
      4:[
        {id:'jour_1',name:'Haut du corps A',movements:'push_h, pull_v, push_v'},
        {id:'jour_2',name:'Bas du corps A',movements:'squat, hinge, lunge'},
        {id:'jour_3',name:'Haut du corps B',movements:'pull_h, push_h, core'},
        {id:'jour_4',name:'Bas du corps B',movements:'squat, lunge, hinge, core'}
      ],
      5:[
        {id:'jour_1',name:'Poussée',movements:'push_h, push_v, core'},
        {id:'jour_2',name:'Tirage',movements:'pull_v, core'},
        {id:'jour_3',name:'Jambes',movements:'squat, lunge, hinge'},
        {id:'jour_4',name:'Haut du corps',movements:'push_h, pull_h, push_v'},
        {id:'jour_5',name:'Bas du corps + tronc',movements:'squat, hinge, core'}
      ]
    },
    endurance:{
      2:[
        {id:'jour_1',name:'Cardio + renforcement',movements:'loco, squat, push_h, core'},
        {id:'jour_2',name:'Endurance full body',movements:'loco, hinge, lunge, core'}
      ],
      3:[
        {id:'jour_1',name:'Cardio + poids du corps',movements:'loco, squat, push_h'},
        {id:'jour_2',name:'Full body circuit',movements:'squat, push_h, core, loco'},
        {id:'jour_3',name:'Intervalles + jambes',movements:'loco, lunge, squat, core'}
      ],
      4:[
        {id:'jour_1',name:'Cardio modéré',movements:'loco, core'},
        {id:'jour_2',name:'Circuit haut + cardio',movements:'push_h, pull_v, loco'},
        {id:'jour_3',name:'Jambes endurance',movements:'squat, lunge, hinge, loco'},
        {id:'jour_4',name:'Intervalles full body',movements:'loco, push_h, core'}
      ],
      5:[
        {id:'jour_1',name:'Cardio facile',movements:'loco, mobility'},
        {id:'jour_2',name:'Circuit full body',movements:'squat, push_h, core, loco'},
        {id:'jour_3',name:'Jambes endurance',movements:'lunge, hinge, loco'},
        {id:'jour_4',name:'Cardio + haut du corps',movements:'loco, pull_v, push_h'},
        {id:'jour_5',name:'Mobilité + cardio léger',movements:'mobility, loco, core'}
      ]
    },
    perte_poids:{
      2:[
        {id:'jour_1',name:'Circuit full body',movements:'loco, squat, push_h, core'},
        {id:'jour_2',name:'Cardio + jambes',movements:'loco, lunge, hinge, core'}
      ],
      3:[
        {id:'jour_1',name:'Cardio + poids du corps',movements:'loco, squat, push_h'},
        {id:'jour_2',name:'Full body circuit',movements:'squat, push_h, core, loco'},
        {id:'jour_3',name:'Intervalles + force',movements:'loco, lunge, hinge, core'}
      ],
      4:[
        {id:'jour_1',name:'Circuit full body A',movements:'loco, squat, push_h'},
        {id:'jour_2',name:'Jambes + cardio',movements:'lunge, hinge, loco'},
        {id:'jour_3',name:'Circuit full body B',movements:'push_h, core, loco'},
        {id:'jour_4',name:'Cardio modéré + mobilité',movements:'loco, mobility, core'}
      ],
      5:[
        {id:'jour_1',name:'Cardio facile',movements:'loco, mobility'},
        {id:'jour_2',name:'Circuit full body A',movements:'squat, push_h, core, loco'},
        {id:'jour_3',name:'Jambes + cardio',movements:'lunge, hinge, loco'},
        {id:'jour_4',name:'Circuit full body B',movements:'push_h, pull_v, core, loco'},
        {id:'jour_5',name:'Cardio léger + mobilité',movements:'loco, mobility, core'}
      ]
    },
    mobilite:{
      2:[
        {id:'jour_1',name:'Mobilité corps complet',movements:'mobility, core'},
        {id:'jour_2',name:'Mobilité + renforcement doux',movements:'mobility, squat, hinge, core'}
      ],
      3:[
        {id:'jour_1',name:'Mobilité haut du corps',movements:'mobility, push_h, core'},
        {id:'jour_2',name:'Mobilité hanches & jambes',movements:'mobility, squat, lunge'},
        {id:'jour_3',name:'Mobilité corps complet',movements:'mobility, hinge, core'}
      ],
      4:[
        {id:'jour_1',name:'Mobilité + tronc',movements:'mobility, core'},
        {id:'jour_2',name:'Mobilité jambes',movements:'mobility, squat, lunge'},
        {id:'jour_3',name:'Mobilité haut du corps',movements:'mobility, push_h'},
        {id:'jour_4',name:'Récupération active',movements:'mobility, loco, core'}
      ],
      5:[
        {id:'jour_1',name:'Mobilité douce',movements:'mobility, core'},
        {id:'jour_2',name:'Jambes & hanches',movements:'mobility, squat, lunge'},
        {id:'jour_3',name:'Haut du corps',movements:'mobility, push_h, core'},
        {id:'jour_4',name:'Chaîne postérieure',movements:'mobility, hinge, core'},
        {id:'jour_5',name:'Récupération active',movements:'mobility, loco'}
      ]
    },
    condition_physique:{
      2:[
        {id:'jour_1',name:'Full body A',movements:'push_h, squat, core, loco'},
        {id:'jour_2',name:'Full body B',movements:'hinge, lunge, pull_v, mobility'}
      ],
      3:[
        {id:'jour_1',name:'Force légère + mobilité',movements:'push_h, squat, mobility'},
        {id:'jour_2',name:'Cardio modéré',movements:'loco, lunge, core'},
        {id:'jour_3',name:'Full body',movements:'hinge, push_h, pull_v, core'}
      ],
      4:[
        {id:'jour_1',name:'Haut du corps + tronc',movements:'push_h, pull_v, core'},
        {id:'jour_2',name:'Jambes',movements:'squat, lunge, hinge'},
        {id:'jour_3',name:'Cardio',movements:'loco, core'},
        {id:'jour_4',name:'Full body + mobilité',movements:'push_h, squat, mobility, core'}
      ],
      5:[
        {id:'jour_1',name:'Haut du corps',movements:'push_h, pull_v, core'},
        {id:'jour_2',name:'Jambes',movements:'squat, lunge, hinge'},
        {id:'jour_3',name:'Cardio',movements:'loco, core'},
        {id:'jour_4',name:'Full body',movements:'push_h, squat, hinge, core'},
        {id:'jour_5',name:'Mobilité / récupération',movements:'mobility, loco'}
      ]
    }
  };
  const family=templates[objectivePrimary]||templates.condition_physique;
  return family[n]||templates.condition_physique[n];
}

function sportExerciseCatalog(){
  return Array.isArray(window.EXERCISES)?window.EXERCISES:(Array.isArray(window.VITATRACK_EXERCISES)?window.VITATRACK_EXERCISES:[]);
}

function normalizeSportEquipment(equipment){
  const out=new Set(['none']); // le poids du corps reste toujours disponible
  const list=Array.isArray(equipment)?equipment:[];
  list.forEach(raw=>{
    const e=String(raw||'').toLowerCase();
    if(e==='aucun'||e==='none')out.add('none');
    else if(e==='barre_traction'||e==='barre')out.add('barre');
    else if(e==='halteres')out.add('halteres');
    else if(e==='kettlebell')out.add('kettlebell');
    else if(e==='elastiques')out.add('elastiques');
    else if(e==='banc')out.add('banc');
    else if(e==='machines'||e==='machine')out.add('machine');
  });
  return [...out];
}

function sportExerciseEquipment(ex){
  if(!ex)return[];
  // Exercise V3 est la source canonique du matériel. On garde un repli
  // minimal pour les anciennes sauvegardes/objets non normalisés.
  if(typeof window.getExerciseEquipment==='function'){
    const canonical=window.getExerciseEquipment(ex.id||ex);
    if(Array.isArray(canonical)&&canonical.length)return canonical;
  }
  return Array.isArray(ex.equipment)&&ex.equipment.length?ex.equipment:(Array.isArray(ex.equip)?ex.equip:[]);
}

function sportEquipmentAllows(ex,equipment){
  const have=new Set(normalizeSportEquipment(equipment));
  return sportExerciseEquipment(ex).some(e=>have.has(e));
}

function chooseEvenProgramDays(preferredDays,count){
  const order=['lun','mar','mer','jeu','ven','sam','dim'];
  const n=Math.max(1,Math.min(7,Math.round(Number(count)||3)));
  const pref=[...new Set((Array.isArray(preferredDays)?preferredDays:[]).filter(d=>order.includes(d)))];
  const scoreDays=days=>{
    const idx=days.map(d=>order.indexOf(d)).sort((a,b)=>a-b);
    if(idx.length<=1)return{minGap:7,spread:0};
    const gaps=[];for(let i=0;i<idx.length;i++){const a=idx[i],b=i===idx.length-1?idx[0]+7:idx[i+1];gaps.push(b-a)}
    const minGap=Math.min(...gaps),avg=7/idx.length,spread=gaps.reduce((s,g)=>s+Math.abs(g-avg),0);
    return{minGap,spread};
  };
  const combinations=(arr,k)=>{
    const out=[];const walk=(start,cur)=>{if(cur.length===k){out.push([...cur]);return}for(let i=start;i<=arr.length-(k-cur.length);i++){cur.push(arr[i]);walk(i+1,cur);cur.pop()}};walk(0,[]);return out;
  };
  if(pref.length>=n){
    const opts=combinations(pref,n);
    opts.sort((a,b)=>{const A=scoreDays(a),B=scoreDays(b);return B.minGap-A.minGap||A.spread-B.spread});
    return opts[0].sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  }
  const chosen=[...pref];
  const defaultSets={2:['lun','jeu'],3:['lun','mer','ven'],4:['lun','mar','jeu','sam'],5:['lun','mar','mer','ven','sam']};
  (defaultSets[n]||order).forEach(d=>{if(chosen.length<n&&!chosen.includes(d))chosen.push(d)});
  while(chosen.length<n){
    const remaining=order.filter(d=>!chosen.includes(d));
    remaining.sort((a,b)=>{const A=scoreDays([...chosen,a]),B=scoreDays([...chosen,b]);return B.minGap-A.minGap||A.spread-B.spread});
    chosen.push(remaining[0]);
  }
  return chosen.sort((a,b)=>order.indexOf(a)-order.indexOf(b));
}

function generateInitialProgram() {
  const profile = DATA.sport.profile;
  const objectives = DATA.sport.objectives;
  const sessionsPerWeek=Math.max(2,Math.min(5,Math.round(Number(profile.sessionsPerWeek)||3)));
  const program = {
    id: 'program_' + Date.now(),
    createdDate: new Date().toISOString().split('T')[0],
    cycle: 1,
    week: 1,
    isDeload: false,
    generatorVersion: 6,
    sessions: []
  };

  const availableDays = chooseEvenProgramDays(profile.preferredDays, sessionsPerWeek);
  const structure = weekStructure(objectives.primary, sessionsPerWeek);
  const generationContext = {familyCounts:{}, exerciseCounts:{}};
  program.sessions = structure.map((s, i) =>
    createSession(s.id, s.name, s.movements, availableDays[i], 1, {}, generationContext)
  );
  program.scheduledDays=availableDays;

  DATA.sport.currentProgram = program;
  DATA.sport.programHistory = DATA.sport.programHistory || [];
  saveState();
  return program;
}

/* intensityFactor : 1 = volume normal, <1 = séance allégée (deload).
   forcedExerciseIds : map { movementSlot: exerciseId } pour imposer un exercice précis
   (utilisé par advanceWeek() afin d'appliquer les variantes proposées par le coach). */
function createSession(dayId, sessionName, movementsFocusStr, dayOfWeek, intensityFactor = 1, forcedExerciseIds = {}, generationContext = null) {
  const durationBase = DATA.sport.profile.sessionDuration || 35;
  const exercises = selectExercisesForSession(movementsFocusStr, DATA.sport.profile.level, DATA.sport.profile.equipment, durationBase, forcedExerciseIds, generationContext);
  const objective=DATA.sport.objectives?.primary||'condition_physique';
  const level=DATA.sport.profile?.level||'intermediaire';

  return {
    id: 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    dayOfWeek,
    name: sessionName + (intensityFactor < 1 ? ' (allégée)' : ''),
    targetDuration: Math.round(durationBase * intensityFactor),
    isDeload: intensityFactor < 1,
    generatorVersion: 6,
    exercises: exercises.map(ex => {
      const baseItem={
        id: Math.random().toString(36).slice(2, 7),
        exerciseId: ex.id,
        exerciseName: ex.name,
        exerciseFamilyId: ex.familyId || ex.family?.id || null,
        exerciseFamilyLabel: ex.familyLabel || ex.family?.label || '',
        movement: ex.move || ex.movement || null,
        repsCompleted: null,
        difficulty: null,
        feedback: null,
        notes: ''
      };
      if(typeof window.buildExercisePrescription!=='function'){
        return {...baseItem,plannedReps:[10,10,10],plannedSets:3,plannedRestSeconds:60};
      }
      let prescription=window.buildExercisePrescription(ex,{
        objective,level,source:'program',volumeFactor:intensityFactor,
        reduceSetCount:intensityFactor<0.85
      });
      if(intensityFactor>=0.85&&typeof window.sportApplyProgressionToPrescription==='function')prescription=window.sportApplyProgressionToPrescription(ex,prescription);
      return typeof window.applyPrescriptionToProgramItem==='function'
        ? window.applyPrescriptionToProgramItem(baseItem,prescription)
        : {...baseItem,plannedReps:prescription.targets,plannedSets:prescription.setCount,plannedRestSeconds:prescription.restSeconds,prescription};
    }),
    status: 'pending',
    startTime: null,
    endTime: null,
    completedDate: null
  };
}

function ensureSportProgramPrescriptionsV3(){
  const program=DATA.sport?.currentProgram;if(!program||!Array.isArray(program.sessions)||typeof window.buildExercisePrescription!=='function')return false;
  let changed=false;const objective=DATA.sport?.objectives?.primary||'condition_physique',level=DATA.sport?.profile?.level||'intermediaire';
  for(const session of program.sessions){
    for(let i=0;i<(session.exercises||[]).length;i++){
      const item=session.exercises[i],ex=exerciseById(item?.exerciseId);if(!ex)continue;
      if(item?.prescription?.schemaVersion===3){
        if(session.status==='pending'&&typeof window.sportApplyProgressionToPrescription==='function'){
          const state=typeof window.sportExerciseProgressionState==='function'?window.sportExerciseProgressionState(item.exerciseId):null;
          if(state?.updatedAt&&item.prescription?.adaptation?.updatedAt!==state.updatedAt){
            const next=window.sportApplyProgressionToPrescription(ex,item.prescription);
            session.exercises[i]=typeof window.applyPrescriptionToProgramItem==='function'?window.applyPrescriptionToProgramItem(item,next):{...item,prescription:next,plannedReps:next.targets,plannedSets:next.setCount,plannedRestSeconds:next.restSeconds};
            changed=true;
          }
        }
        continue;
      }
      const preserveLegacy=session.status==='completed'||session.status==='in_progress'||!!session.quickAdaptation;
      let p=preserveLegacy&&typeof window.prescriptionFromLegacy==='function'
        ? window.prescriptionFromLegacy(ex,item)
        : window.buildExercisePrescription(ex,{objective,level,source:'program_migration'});
      if(session.status==='pending'&&typeof window.sportApplyProgressionToPrescription==='function')p=window.sportApplyProgressionToPrescription(ex,p);
      if(!p)continue;
      session.exercises[i]=typeof window.applyPrescriptionToProgramItem==='function'?window.applyPrescriptionToProgramItem(item,p):{...item,prescription:p,plannedReps:p.targets,plannedSets:p.setCount,plannedRestSeconds:p.restSeconds};
      changed=true;
    }
  }
  if(changed){program.prescriptionSchemaVersion=3;if(typeof saveState==='function')saveState();}
  return changed;
}
window.ensureSportProgramPrescriptionsV3=ensureSportProgramPrescriptionsV3;

function normalizeSportMovement(move){
  const aliases={anti_rot:'core',mountain_climbers:'loco',burpees:'loco',fente_avant:'lunge',jogging_sur_place:'loco',planche:'core',hip_thrust_sol:'hinge'};
  return aliases[move]||move;
}

function sportLevelAllows(ex,level){
  const diff=Number(ex?.difficultyScore ?? ex?.diff ?? 3);
  if(level==='debutant')return diff<=2;
  if(level==='intermediaire')return diff<=4;
  return true;
}

/* Générateur V6 : une séance doit couvrir ses mouvements sans empiler plusieurs
   déclinaisons de la même famille. Le contexte hebdomadaire pénalise aussi les
   répétitions inutiles d'une séance à l'autre, tout en gardant les choix
   déterministes et compatibles avec les adaptations du coach. */
function selectExercisesForSession(movementsFocus, level, equipment, durationTarget, forcedExerciseIds = {}, generationContext = null) {
  const focusedMovements=[...new Set(String(movementsFocus||'').split(',').map(m=>normalizeSportMovement(m.trim())).filter(Boolean))];
  const availableEquipment=normalizeSportEquipment(equipment);
  const objective=DATA.sport.objectives?.primary||'condition_physique';
  const targetDiff=level==='debutant'?1.5:level==='avance'?4:3;
  const targetCount=Math.max(3,Math.min(6,Math.round((Number(durationTarget)||35)/10)));
  const selected=[];
  const selectedIds=new Set();
  const selectedFamilies=new Set();
  const movementCounts={};
  const forcedIds=new Set(Object.values(forcedExerciseIds||{}).filter(Boolean));
  const weekFamilies=generationContext?.familyCounts||{};
  const weekExercises=generationContext?.exerciseCounts||{};
  const catalog=sportExerciseCatalog();

  const familyId=ex=>String(ex?.familyId||ex?.family?.id||'other_exercises');
  const roleRank=ex=>ex?.programRole==='main'?0:ex?.programRole==='cardio'||ex?.programRole==='mobility'?1:ex?.programRole==='activity'?2:4;

  function exactCandidates(move){
    return catalog.filter(ex=>ex.move===move&&(ex.autoProgram!==false||forcedIds.has(ex.id))&&(forcedIds.has(ex.id)||sportLevelAllows(ex,level))&&sportEquipmentAllows(ex,availableEquipment));
  }

  function candidatesFor(move){
    let pool=exactCandidates(move);
    // Un tirage horizontal/vertical peut remplacer l'autre uniquement si le
    // matériel de l'utilisateur ne permet vraiment aucune option du mouvement demandé.
    if(!pool.length&&move==='pull_v')pool=exactCandidates('pull_h');
    if(!pool.length&&move==='pull_h')pool=exactCandidates('pull_v');
    // Dernier filet pour le dos au poids du corps.
    if(!pool.length&&['pull_h','pull_v'].includes(move)){
      pool=catalog.filter(ex=>['superman','bird-dog'].includes(ex.id)&&sportLevelAllows(ex,level));
    }
    return pool;
  }

  const complementaryMovements={
    push_h:['push_v','pull_h','pull_v','core','mobility'],push_v:['push_h','pull_h','pull_v','core','mobility'],
    pull_h:['pull_v','push_h','push_v','core','mobility'],pull_v:['pull_h','push_h','push_v','core','mobility'],
    squat:['lunge','hinge'],lunge:['squat','hinge'],hinge:['lunge','squat'],
    core:['mobility'],loco:['core','mobility'],mobility:['core','loco']
  };

  function candidateScore(ex,requestedMove){
    const fam=familyId(ex);
    let score=0;
    if(forcedIds.has(ex.id))score-=1000;
    if(ex.move!==requestedMove)score+=28; // fallback, jamais premier choix
    score+=roleRank(ex)*14;
    score+=Math.abs((Number(ex.diff)||3)-targetDiff)*12;
    if((ex.goals||[]).includes(objective))score-=7;
    else score+=3;
    // Diversité dans la séance : une autre famille est presque toujours préférable.
    if(selectedFamilies.has(fam))score+=140;
    if(selectedIds.has(ex.id))score+=1000;
    // Diversité dans la semaine : on évite de refaire exactement les mêmes
    // familles/exercices lorsque plusieurs options équivalentes existent.
    score+=(Number(weekFamilies[fam])||0)*18;
    score+=(Number(weekExercises[ex.id])||0)*30;
    // Au moment de compléter la séance, on favorise le mouvement le moins répété.
    score+=(Number(movementCounts[ex.move])||0)*9;
    return score;
  }

  function choose(pool,requestedMove){
    return [...pool].sort((a,b)=>{
      const d=candidateScore(a,requestedMove)-candidateScore(b,requestedMove);
      if(d)return d;
      const ar=Number(a.familyRank)||100,br=Number(b.familyRank)||100;
      return ar-br||String(a.name).localeCompare(String(b.name),'fr');
    })[0]||null;
  }

  function add(ex){
    if(!ex||selectedIds.has(ex.id))return false;
    selected.push(ex);
    selectedIds.add(ex.id);
    selectedFamilies.add(familyId(ex));
    movementCounts[ex.move]=(movementCounts[ex.move]||0)+1;
    return true;
  }

  // 1) Garantir un exercice pour chaque mouvement annoncé dans la séance.
  for(const move of focusedMovements){
    if(selected.length>=targetCount)break;
    add(choose(candidatesFor(move),move));
  }

  // 2) Compléter la durée en privilégiant de nouvelles familles et en répartissant
  //    les exercices supplémentaires sur les mouvements déjà ciblés.
  while(selected.length<targetCount){
    const options=[];
    for(const move of focusedMovements){
      for(const ex of candidatesFor(move)){
        if(!selectedIds.has(ex.id))options.push({ex,move,score:candidateScore(ex,move),outsideFocus:false});
      }
    }

    // Si les mouvements annoncés n'offrent plus qu'une famille déjà utilisée,
    // on préfère un mouvement complémentaire cohérent à une troisième variante
    // presque identique (ex. pike push-up plutôt qu'une 3e pompe).
    const hasFreshFocusedFamily=options.some(o=>!selectedFamilies.has(familyId(o.ex)));
    if(!hasFreshFocusedFamily){
      const extraMoves=[...new Set(focusedMovements.flatMap(m=>complementaryMovements[m]||[]))].filter(m=>!focusedMovements.includes(m));
      for(const move of extraMoves){
        for(const ex of candidatesFor(move)){
          if(selectedIds.has(ex.id)||selectedFamilies.has(familyId(ex)))continue;
          options.push({ex,move,score:candidateScore(ex,move)+24,outsideFocus:true});
        }
      }
    }

    if(!options.length)break;
    options.sort((a,b)=>a.score-b.score||(a.outsideFocus?1:0)-(b.outsideFocus?1:0)||(Number(a.ex.familyRank)||100)-(Number(b.ex.familyRank)||100)||String(a.ex.name).localeCompare(String(b.ex.name),'fr'));
    if(!add(options[0].ex))break;
  }

  // 3) Garde-fou pour les anciennes configurations de matériel/mouvements.
  if(!selected.length){
    const fallback=catalog.filter(ex=>ex.autoProgram!==false&&sportLevelAllows(ex,level)&&sportEquipmentAllows(ex,availableEquipment)&&['push_h','push_v','pull_h','pull_v','squat','lunge','hinge','core','loco','mobility'].includes(ex.move));
    while(selected.length<Math.max(3,targetCount)){
      const ex=choose(fallback.filter(x=>!selectedIds.has(x.id)),focusedMovements[0]||'core');
      if(!add(ex))break;
    }
  }

  // Enregistre la diversité de la semaine uniquement après la sélection finale.
  if(generationContext){
    generationContext.familyCounts=generationContext.familyCounts||{};
    generationContext.exerciseCounts=generationContext.exerciseCounts||{};
    for(const ex of selected){
      const fam=familyId(ex);
      generationContext.familyCounts[fam]=(generationContext.familyCounts[fam]||0)+1;
      generationContext.exerciseCounts[ex.id]=(generationContext.exerciseCounts[ex.id]||0)+1;
    }
  }
  return selected;
}
window.VITATRACK_SESSION_GENERATOR_VERSION=6;
window.selectExercisesForSession=selectExercisesForSession;


/* ===== PRÉPARATION DE SÉANCE V7 =====
   Remplacement manuel avant démarrage : variantes de la même famille d'abord,
   puis alternatives compatibles. Une séance commencée n'est jamais modifiée. */
function sportSessionReplacementCandidates(sessionId,index){
  const session=DATA.sport?.currentProgram?.sessions?.find(s=>s.id===sessionId);
  if(!session||session.status!=='pending')return[];
  const item=session.exercises?.[Number(index)];
  const current=exerciseById(item?.exerciseId);
  if(!current)return[];
  const level=DATA.sport?.profile?.level||'intermediaire';
  const equipment=normalizeSportEquipment(DATA.sport?.profile?.equipment||[]);
  const currentFamily=String(current.familyId||current.family?.id||'other_exercises');
  const currentRank=Number(current.familyRank)||100;
  const usedIds=new Set((session.exercises||[]).map((e,i)=>i===Number(index)?null:e.exerciseId).filter(Boolean));
  const usedFamilies=new Set((session.exercises||[]).map((e,i)=>{
    if(i===Number(index))return null;
    const x=exerciseById(e.exerciseId);return x?String(x.familyId||x.family?.id||'other_exercises'):null;
  }).filter(Boolean));
  const progressionIds=new Set([
    ...(current.progression?.easier||[]),
    ...(current.progression?.harder||[]),
    ...(current.progression?.alternatives||[])
  ]);
  const catalog=sportExerciseCatalog();
  const rows=[];
  for(const ex of catalog){
    if(!ex||ex.id===current.id||usedIds.has(ex.id))continue;
    if(ex.autoProgram===false && !progressionIds.has(ex.id))continue;
    if(!sportLevelAllows(ex,level) && !progressionIds.has(ex.id))continue;
    if(!sportEquipmentAllows(ex,equipment))continue;
    const fam=String(ex.familyId||ex.family?.id||'other_exercises');
    const sameFamily=fam===currentFamily;
    const explicit=progressionIds.has(ex.id);
    const sameMovement=normalizeSportMovement(ex.move||ex.movement)===normalizeSportMovement(current.move||current.movement);
    if(!sameFamily&&!explicit&&!sameMovement)continue;
    if(!sameFamily&&usedFamilies.has(fam))continue;
    let score=100;
    let group='alternative';
    if(sameFamily){score=0;group='family';score+=Math.abs((Number(ex.familyRank)||100)-currentRank);}
    else if(explicit){score=35;group='recommended';}
    else if(sameMovement){score=60;group='alternative';}
    score+=Math.abs((Number(ex.diff)||3)-(Number(current.diff)||3))*8;
    rows.push({
      id:ex.id,name:ex.name,familyId:fam,familyLabel:ex.familyLabel||ex.family?.label||'',
      difficulty:ex.difficulty,metric:ex.metric||ex.measure||'reps',equipment:sportExerciseEquipment(ex),
      group,score,rank:Number(ex.familyRank)||100
    });
  }
  rows.sort((a,b)=>{const gp={family:0,recommended:1,alternative:2};return (gp[a.group]??9)-(gp[b.group]??9)||(a.group==='family'?a.rank-b.rank:a.score-b.score)||a.rank-b.rank||String(a.name).localeCompare(String(b.name),'fr')});
  return rows.slice(0,14);
}

function replaceSportSessionExercise(sessionId,index,newExerciseId){
  const session=DATA.sport?.currentProgram?.sessions?.find(s=>s.id===sessionId);
  const idx=Number(index);
  if(!session||session.status!=='pending'||!session.exercises?.[idx])return{changed:false,message:'Cette séance a déjà commencé.'};
  const next=exerciseById(newExerciseId),previous=exerciseById(session.exercises[idx].exerciseId);
  if(!next)return{changed:false,message:'Exercice introuvable.'};
  const allowed=sportSessionReplacementCandidates(sessionId,idx).some(x=>x.id===next.id);
  if(!allowed)return{changed:false,message:'Cette variante n’est pas compatible avec la séance.'};
  if(typeof sportEnsureOriginalPlan==='function')sportEnsureOriginalPlan(session);
  const old=session.exercises[idx];
  const objective=DATA.sport?.objectives?.primary||'condition_physique';
  const level=DATA.sport?.profile?.level||'intermediaire';
  let prescription=null;
  if(typeof window.buildExercisePrescription==='function'){
    const easier=session.quickAdaptation==='easier';
    prescription=window.buildExercisePrescription(next,{
      objective,level,source:'program_manual_replace',
      setCount:Math.max(1,Number(old.prescription?.setCount)||Number(old.plannedSets)||3),
      volumeFactor:easier?0.8:(session.isDeload?0.6:1),
      reduceSetCount:easier||!!session.isDeload
    });
    if(typeof window.sportApplyProgressionToPrescription==='function')prescription=window.sportApplyProgressionToPrescription(next,prescription);
  }
  let base={
    ...old,
    exerciseId:next.id,
    exerciseName:next.name,
    exerciseFamilyId:next.familyId||next.family?.id||null,
    exerciseFamilyLabel:next.familyLabel||next.family?.label||'',
    movement:next.move||next.movement||null,
    repsCompleted:null,difficulty:null,feedback:null,notes:'',
    manualReplacementOf:old.manualReplacementOf||previous?.id||old.exerciseId,
    manualReplacedAt:new Date().toISOString()
  };
  if(prescription&&typeof window.applyPrescriptionToProgramItem==='function')base=window.applyPrescriptionToProgramItem(base,prescription);
  session.exercises[idx]=base;
  session.preparedAt=new Date().toISOString();
  if(typeof saveState==='function')saveState();
  return{changed:true,message:`${previous?.name||'Exercice'} remplacé par ${next.name}`,exercise:next};
}

window.sportSessionReplacementCandidates=sportSessionReplacementCandidates;
window.replaceSportSessionExercise=replaceSportSessionExercise;
window.VITATRACK_SESSION_PREPARATION_VERSION=7;

/* Migre uniquement un programme qui n'a encore jamais été commencé. On évite
   volontairement de modifier une semaine déjà en cours afin de préserver les
   prescriptions, l'historique et les repères de l'utilisateur. */
function ensureSportProgramGeneratorV6(){
  const program=DATA.sport?.currentProgram;
  if(!program||Number(program.generatorVersion)>=6||!Array.isArray(program.sessions)||!program.sessions.length)return false;
  if(program.sessions.some(s=>s.status&&s.status!=='pending'))return false;
  const profile=DATA.sport.profile||{},objectives=DATA.sport.objectives||{};
  const sessionsPerWeek=Math.max(2,Math.min(5,Math.round(Number(profile.sessionsPerWeek)||program.sessions.length||3)));
  const structure=weekStructure(objectives.primary||'condition_physique',sessionsPerWeek);
  const existingDays=program.sessions.map(s=>s.dayOfWeek).filter(Boolean);
  const availableDays=existingDays.length===sessionsPerWeek?existingDays:chooseEvenProgramDays(profile.preferredDays,sessionsPerWeek);
  const generationContext={familyCounts:{},exerciseCounts:{}};
  program.sessions=structure.map((spec,i)=>createSession(spec.id,spec.name,spec.movements,availableDays[i],program.isDeload?0.6:1,{},generationContext));
  program.scheduledDays=availableDays;
  program.generatorVersion=6;
  if(typeof saveState==='function')saveState();
  return true;
}
window.ensureSportProgramGeneratorV6=ensureSportProgramGeneratorV6;

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
  [...decisions].reverse().forEach(d => {
    (d.adaptations || []).forEach(a => {
      if (Object.prototype.hasOwnProperty.call(swaps,a.exerciseId)) return;
      swaps[a.exerciseId] = (a.suggestedId && (a.action === 'progress' || a.action === 'reduce')) ? a.suggestedId : null;
    });
  });
  Object.keys(swaps).forEach(k=>{if(!swaps[k])delete swaps[k]});
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
  const availableDays = chooseEvenProgramDays(profile.preferredDays, sessionsPerWeek);
  const structure = weekStructure(objectives.primary, sessionsPerWeek);

  const nextWeek = program.week + 1;
  const deload = isDeloadWeek(nextWeek);
  const intensityFactor = deload ? 0.6 : 1;
  const swaps = pendingVariantSwaps();
  const generationContext = {familyCounts:{}, exerciseCounts:{}};

  const newSessions = structure.map((s, i) => {
    // Ne force que les mouvements concernés par cette séance : on ne propage un swap
    // que si l'exercice remplacé faisait partie des mouvements ciblés par cette séance.
    const focusedMovements = s.movements.split(',').map(m => m.trim());
    const forced = {};
    Object.entries(swaps).forEach(([oldId, newId]) => {
      const newEx = sportExerciseCatalog().find(e => e.id === newId);
      if (newEx && focusedMovements.includes(newEx.move)) forced[oldId] = newId;
    });
    return createSession(s.id, s.name, s.movements, availableDays[i], intensityFactor, forced, generationContext);
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

/* ===== RÉCUPÉRATION + ADAPTATIONS RAPIDES ===== */

function exerciseById(id){
  return (Array.isArray(window.EXERCISES)?window.EXERCISES:[]).find(e=>e.id===id)||null;
}

function sportNormalizeZone(value){
  const s=String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const aliases={
    epaule:'epaules',epaules:'epaules',shoulder:'epaules',
    genou:'genoux',genoux:'genoux',knee:'genoux',
    poignet:'poignets',poignets:'poignets',wrist:'poignets',
    dos:'dos',lombaire:'lombaires',lombaires:'lombaires',bas_du_dos:'lombaires',
    hanche:'hanches',hanches:'hanches',hip:'hanches',
    cheville:'chevilles',chevilles:'chevilles',ankle:'chevilles',
    coude:'coudes',coudes:'coudes',elbow:'coudes',
    cou:'cou',nuque:'cou',
    pectoraux:'pectoraux',bras:'bras',abdos:'abdominaux',abdominaux:'abdominaux',
    cuisse:'jambes',cuisses:'jambes',jambe:'jambes',jambes:'jambes',fessiers:'fessiers'
  };
  return aliases[s.replace(/[ -]+/g,'_')]||aliases[s]||s.replace(/[ -]+/g,'_');
}

function sportExerciseTouchesZone(ex,zone){
  if(!ex||!zone)return false;
  const z=sportNormalizeZone(zone);
  const fields=[...(ex.avoid||[]),...(ex.muscles||[]),...(ex.musclesSec||[]),...(ex.body_area||[]),...(ex.target_muscles||[])];
  const norm=fields.map(sportNormalizeZone);
  if(norm.includes(z))return true;
  const movementZones={push_h:['epaules','poignets','coudes'],push_v:['epaules','coudes'],pull_h:['epaules','coudes','dos'],squat:['genoux','hanches','chevilles'],lunge:['genoux','hanches','chevilles'],hinge:['lombaires','hanches'],core:['lombaires'],loco:['genoux','chevilles','hanches']};
  if((movementZones[ex.move]||[]).includes(z))return true;
  const groups={
    epaules:['epaules','pectoraux','triceps'],
    genoux:['genoux','jambes','quadriceps','fessiers'],
    lombaires:['lombaires','dos','ischio-jambiers','fessiers'],
    hanches:['hanches','jambes','fessiers','ischio-jambiers'],
    poignets:['poignets','pectoraux','triceps'],
    chevilles:['chevilles','jambes','mollets'],
    coudes:['coudes','biceps','triceps']
  };
  return (groups[z]||[]).some(x=>norm.includes(sportNormalizeZone(x)));
}

function sportSessionSnapshot(session){
  if(!session)return null;
  return {
    targetDuration:Number(session.targetDuration)||0,
    exercises:(session.exercises||[]).map(e=>({
      ...e,
      prescription:e.prescription?JSON.parse(JSON.stringify(e.prescription)):e.prescription,
      plannedTargets:Array.isArray(e.plannedTargets)?e.plannedTargets.map(x=>({...x})):e.plannedTargets,
      plannedReps:Array.isArray(e.plannedReps)?[...e.plannedReps]:[],
      repsCompleted:Array.isArray(e.repsCompleted)?[...e.repsCompleted]:e.repsCompleted,
      performanceSets:Array.isArray(e.performanceSets)?e.performanceSets.map(s=>({...s})):e.performanceSets
    }))
  };
}

function sportEnsureOriginalPlan(session){
  if(session&&!session.originalPlan)session.originalPlan=sportSessionSnapshot(session);
}

function sportCandidateExercises(sourceEx,options={}){
  const all=Array.isArray(window.EXERCISES)?window.EXERCISES:[];
  const level=DATA.sport?.profile?.level||'debutant';
  const equipment=options.bodyweightOnly?['none']:(DATA.sport?.profile?.equipment||['aucun']);
  const avoidZone=options.avoidZone? sportNormalizeZone(options.avoidZone):null;
  return all.filter(ex=>{
    if(!ex||ex.id===sourceEx?.id)return false;
    if(sourceEx?.move&&ex.move!==sourceEx.move)return false;
    if(!sportLevelAllows(ex,level))return false;
    if(!sportEquipmentAllows(ex,equipment))return false;
    if(avoidZone&&sportExerciseTouchesZone(ex,avoidZone))return false;
    return true;
  }).sort((a,b)=>{
    const target=Number(sourceEx?.diff)||3;
    const da=Number(a.diff)||3,db=Number(b.diff)||3;
    if(options.easier){
      const ap=da<target?0:1,bp=db<target?0:1;
      return ap-bp||Math.abs(da-(target-1))-Math.abs(db-(target-1));
    }
    return Math.abs(da-target)-Math.abs(db-target);
  });
}

function sportReplacementForExercise(exerciseId,options={}){
  const source=exerciseById(exerciseId);if(!source)return null;
  const variantIds=options.easier?(source.variants?.easier||[]):[];
  for(const id of variantIds){
    const ex=exerciseById(id);
    if(!ex)continue;
    if(options.bodyweightOnly&&!sportEquipmentAllows(ex,['none']))continue;
    if(options.avoidZone&&sportExerciseTouchesZone(ex,options.avoidZone))continue;
    return ex;
  }
  const sameMove=sportCandidateExercises(source,options)[0];
  if(sameMove)return sameMove;
  if(options.avoidZone){
    const level=DATA.sport?.profile?.level||'debutant';
    const equipment=options.bodyweightOnly?['none']:(DATA.sport?.profile?.equipment||['aucun']);
    const safe=(Array.isArray(window.EXERCISES)?window.EXERCISES:[]).filter(ex=>ex.id!==source.id&&sportLevelAllows(ex,level)&&sportEquipmentAllows(ex,equipment)&&!sportExerciseTouchesZone(ex,options.avoidZone));
    safe.sort((a,b)=>(Number(a.diff)||3)-(Number(b.diff)||3));
    return safe[0]||null;
  }
  return null;
}

function sportReplacementExcluding(exerciseId,options={},excludedIds=new Set()){
  const source=exerciseById(exerciseId);if(!source)return null;
  const excluded=excludedIds instanceof Set?excludedIds:new Set(excludedIds||[]);
  const variants=options.easier?(source.variants?.easier||[]):[];
  for(const id of variants){
    const ex=exerciseById(id);if(!ex||excluded.has(ex.id))continue;
    if(options.bodyweightOnly&&!sportEquipmentAllows(ex,['none']))continue;
    if(options.avoidZone&&sportExerciseTouchesZone(ex,options.avoidZone))continue;
    return ex;
  }
  const same=sportCandidateExercises(source,options).find(ex=>!excluded.has(ex.id));
  if(same)return same;
  if(options.avoidZone){
    const level=DATA.sport?.profile?.level||'debutant';
    const equipment=options.bodyweightOnly?['none']:(DATA.sport?.profile?.equipment||['aucun']);
    const safe=(Array.isArray(window.EXERCISES)?window.EXERCISES:[]).filter(ex=>ex.id!==source.id&&!excluded.has(ex.id)&&sportLevelAllows(ex,level)&&sportEquipmentAllows(ex,equipment)&&!sportExerciseTouchesZone(ex,options.avoidZone));
    safe.sort((a,b)=>(Number(a.diff)||3)-(Number(b.diff)||3));
    return safe[0]||null;
  }
  return null;
}

function sportReplaceSessionExercise(item,replacement){
  if(!item||!replacement)return item;
  let out={
    ...item,
    exerciseId:replacement.id,
    exerciseName:replacement.name,
    adaptedFrom:item.adaptedFrom||item.exerciseId,
    adaptationNote:item.adaptationNote||''
  };
  if(typeof window.buildExercisePrescription==='function'){
    const p=window.buildExercisePrescription(replacement,{
      objective:DATA.sport?.objectives?.primary||'condition_physique',
      level:DATA.sport?.profile?.level||'intermediaire',
      source:'adaptation'
    });
    if(typeof window.applyPrescriptionToProgramItem==='function')out=window.applyPrescriptionToProgramItem(out,p);
  }
  return out;
}

function sportAdjustSessionTo15Min(session){
  sportEnsureOriginalPlan(session);
  session.targetDuration=15;
  const original=session.exercises||[];
  const keep=Math.min(3,original.length);
  session.exercises=original.slice(0,keep).map(e=>{
    const ex=exerciseById(e.exerciseId);
    if(ex&&typeof window.prescriptionFromLegacy==='function'&&typeof window.buildExercisePrescription==='function'){
      const current=window.prescriptionFromLegacy(ex,e);
      const sets=(current?.sets||[]).slice(0,Math.min(2,current?.sets?.length||2));
      const p=window.buildExercisePrescription(ex,{metric:current?.metric,sets,restSeconds:Math.min(Number(current?.restSeconds)||60,45),source:'quick_15min'});
      const out=typeof window.applyPrescriptionToProgramItem==='function'?window.applyPrescriptionToProgramItem({...e},p):e;
      return {...out,adaptationNote:'Séance raccourcie à 15 min'};
    }
    const reps=(Array.isArray(e.plannedReps)?e.plannedReps:[10,10]).slice(0,2);
    return {...e,plannedReps:reps,plannedSets:Math.max(1,reps.length),plannedRestSeconds:Math.min(Number(e.plannedRestSeconds)||60,45),adaptationNote:'Séance raccourcie à 15 min'};
  });
  session.quickAdaptation='15min';
  return {changed:true,message:`Séance ramenée à 15 min · ${session.exercises.length} exercices essentiels`};
}

function sportAdjustSessionNoEquipment(session){
  sportEnsureOriginalPlan(session);
  let replaced=0,removed=0;const used=new Set();const next=[];
  for(const item of (session.exercises||[])){
    const ex=exerciseById(item.exerciseId);if(!ex){next.push(item);continue;}
    if(sportEquipmentAllows(ex,['none'])&&!used.has(ex.id)){used.add(ex.id);next.push(item);continue;}
    const replacement=sportReplacementExcluding(item.exerciseId,{bodyweightOnly:true},used);
    if(replacement){used.add(replacement.id);replaced++;next.push({...sportReplaceSessionExercise(item,replacement),adaptationNote:'Variante sans matériel'});}
    else removed++;
  }
  session.exercises=next;
  session.quickAdaptation='no_equipment';
  return {changed:replaced>0||removed>0,message:`Sans matériel · ${replaced} remplacement${replaced>1?'s':''}${removed?` · ${removed} exercice${removed>1?'s':''} retiré${removed>1?'s':''}`:''}`};
}

function sportAdjustSessionEasier(session){
  sportEnsureOriginalPlan(session);
  let replaced=0;
  session.exercises=(session.exercises||[]).map(item=>{
    const replacement=sportReplacementForExercise(item.exerciseId,{easier:true});
    let out=item;
    if(replacement){out=sportReplaceSessionExercise(item,replacement);replaced++;}
    const ex=exerciseById(out.exerciseId);
    if(ex&&typeof window.prescriptionFromLegacy==='function'&&typeof window.buildExercisePrescription==='function'){
      const current=window.prescriptionFromLegacy(ex,out);
      const p=window.buildExercisePrescription(ex,{
        metric:current?.metric,
        sets:current?.sets,
        restSeconds:Math.max(60,Number(current?.restSeconds)||60),
        volumeFactor:.8,
        reduceSetCount:true,
        source:'quick_easier'
      });
      if(typeof window.applyPrescriptionToProgramItem==='function')out=window.applyPrescriptionToProgramItem(out,p);
    }else{
      const reps=(Array.isArray(out.plannedReps)?out.plannedReps:[10,10,10]);
      const lighter=reps.map(v=>Math.max(3,Math.round((Number(v)||10)*0.8))).slice(0,Math.max(2,reps.length-1));
      out={...out,plannedReps:lighter,plannedSets:lighter.length,plannedRestSeconds:Math.max(60,Number(out.plannedRestSeconds)||60)};
    }
    return {...out,adaptationNote:'Volume réduit / variante plus facile'};
  });
  session.targetDuration=Math.max(15,Math.round((Number(session.targetDuration)||30)*0.8));
  session.quickAdaptation='easier';
  return {changed:true,message:`Séance allégée${replaced?` · ${replaced} variante${replaced>1?'s':''} plus facile${replaced>1?'s':''}`:''}`};
}

function sportAdjustSessionForZone(session,zone){
  sportEnsureOriginalPlan(session);
  const z=sportNormalizeZone(zone);let replaced=0,removed=0;const used=new Set();const next=[];
  for(const item of (session.exercises||[])){
    const ex=exerciseById(item.exerciseId);if(!ex){next.push(item);continue;}
    if(!sportExerciseTouchesZone(ex,z)&&!used.has(ex.id)){used.add(ex.id);next.push(item);continue;}
    const replacement=sportReplacementExcluding(item.exerciseId,{avoidZone:z,easier:true},used);
    if(replacement){used.add(replacement.id);replaced++;next.push({...sportReplaceSessionExercise(item,replacement),adaptationNote:`Adapté pour éviter : ${z}`});}
    else removed++;
  }
  session.exercises=next;
  // La gêne est appliquée à la séance courante uniquement : on évite de mémoriser
  // une blessure temporaire comme contrainte permanente sans confirmation dédiée.
  session.quickAdaptation='constraint';session.constraintZone=z;
  return {changed:replaced>0||removed>0,message:`Séance adaptée pour ${String(zone).trim()} · ${replaced} remplacement${replaced>1?'s':''}${removed?` · ${removed} retiré${removed>1?'s':''}`:''}`};
}

function resetSportSessionAdaptation(sessionId){
  const session=DATA.sport.currentProgram?.sessions?.find(s=>s.id===sessionId);if(!session?.originalPlan)return false;
  session.targetDuration=session.originalPlan.targetDuration;
  session.exercises=session.originalPlan.exercises.map(e=>({...e,prescription:e.prescription?JSON.parse(JSON.stringify(e.prescription)):e.prescription,plannedTargets:Array.isArray(e.plannedTargets)?e.plannedTargets.map(x=>({...x})):e.plannedTargets,plannedReps:Array.isArray(e.plannedReps)?[...e.plannedReps]:[]}));
  delete session.originalPlan;delete session.quickAdaptation;delete session.constraintZone;
  saveState();return true;
}
window.resetSportSessionAdaptation=resetSportSessionAdaptation;

function applySportQuickAdjustment(sessionId,type,zone){
  const session=DATA.sport.currentProgram?.sessions?.find(s=>s.id===sessionId);if(!session)return{changed:false,message:'Séance introuvable'};
  let result={changed:false,message:'Adaptation non disponible'};
  if(type==='15 min max'||type==='15min')result=sportAdjustSessionTo15Min(session);
  else if(type==='Pas de matériel'||type==='no_equipment')result=sportAdjustSessionNoEquipment(session);
  else if(type==='Plus facile'||type==='easier')result=sportAdjustSessionEasier(session);
  else if(type==='Gêne / blessure'||type==='constraint'){
    if(!zone)return{changed:false,needsZone:true};
    result=sportAdjustSessionForZone(session,zone);
  }
  if(result.changed){session.adaptedAt=new Date().toISOString();saveState();}
  return result;
}
window.applySportQuickAdjustment=applySportQuickAdjustment;

function sportHistoryExercises(activity){
  if(!activity)return[];
  if(activity.type==='exercise')return[activity];
  return Array.isArray(activity.exercises)?activity.exercises:[];
}

function sportRecoveryMuscleKey(raw){
  const s=sportNormalizeZone(raw);
  const map={quadriceps:'jambes',ischio_jambiers:'jambes','ischio-jambiers':'jambes',mollets:'jambes',biceps:'bras',triceps:'bras',gainage:'abdominaux',abdos:'abdominaux',core:'abdominaux',trap:'dos',trapèzes:'dos',trapezes:'dos'};
  return map[s]||s;
}

function estimateRecovery() {
  const history=Array.isArray(DATA.sport?.sessionHistory)?DATA.sport.sessionHistory:[];
  if(!history.length)return{status:'bonne',label:'✅ Bonne',score:0,zones:[]};
  const now=Date.now(),scores={};
  const recent=history.filter(a=>{
    const t=new Date(a.recordedAt||a.endTime||a.completedDate||a.date||0).getTime();
    return Number.isFinite(t)&&t>0&&now-t<=5*86400000;
  });
  recent.forEach(activity=>{
    const t=new Date(activity.recordedAt||activity.endTime||activity.completedDate||activity.date||0).getTime();
    const ageDays=Math.max(0,(now-t)/86400000);
    const decay=ageDays<1?1:ageDays<2?.72:ageDays<3?.45:ageDays<4?.25:.12;
    sportHistoryExercises(activity).forEach(item=>{
      const def=exerciseById(item.exerciseId||item.id);
      if(!def)return;
      const sets=Math.max(1,(item.performanceSets||[]).length||Number(item.plannedSets)||((item.repsCompleted||[]).length)||1);
      const rpeVals=(item.performanceSets||[]).map(s=>Number(s.rpe)).filter(v=>v>=1&&v<=10);
      const rpe=rpeVals.length?rpeVals.reduce((a,b)=>a+b,0)/rpeVals.length:(Number(item.difficulty)||Number(activity.difficulty)||5);
      const stress=Math.min(5,sets)*(0.65+Math.max(1,Math.min(10,rpe))/10)*decay;
      const primary=[...(def.muscles||[]),...(def.target_muscles||[])];
      const secondary=def.musclesSec||def.secondary_muscles||[];
      primary.forEach(m=>{const k=sportRecoveryMuscleKey(m);scores[k]=(scores[k]||0)+stress});
      secondary.forEach(m=>{const k=sportRecoveryMuscleKey(m);scores[k]=(scores[k]||0)+stress*.45});
    });
  });
  const zones=Object.entries(scores).map(([name,score])=>({name,score:Math.round(score*10)/10,status:score>=7?'fatiguee':score>=4?'prudence':'prete'})).sort((a,b)=>b.score-a.score);
  const max=zones[0]?.score||0;
  const hard=zones.filter(z=>z.status==='fatiguee').length;
  if(max>=9||hard>=2)return{status:'faible',label:'⚠️ Récupération faible',score:max,zones};
  if(max>=5)return{status:'moyenne',label:'📊 Récupération moyenne',score:max,zones};
  return{status:'bonne',label:'✅ Bonne récupération',score:max,zones};
}


/* ===== DÉFIS — moteur unifié ===== */

const SPORT_CHALLENGES=[
  {id:'pompes-100',icon:'💪',title:'Objectif 100 pompes',exerciseId:'pompes',category:'Force',duration:30,unit:'répétitions',unitType:'reps',finalTarget:100,description:'Atteindre progressivement 100 pompes dans la journée, réparties en plusieurs séries.',stages:[
    {day:1,total:15,sets:[5,5,5]},{day:4,total:20,sets:[5,5,5,5]},{day:8,total:30,sets:[8,8,7,7]},{day:12,total:40,sets:[10,10,10,10]},{day:16,total:50,sets:[10,10,10,10,10]},{day:20,total:65,sets:[13,13,13,13,13]},{day:24,total:80,sets:[20,20,20,20]},{day:27,total:90,sets:[20,20,20,15,15]},{day:30,total:100,sets:[20,20,20,20,20]}]},
  {id:'squats-100',icon:'🦵',title:'Objectif 100 squats',exerciseId:'squat',category:'Jambes',duration:30,unit:'répétitions',unitType:'reps',finalTarget:100,description:'Construire progressivement l’endurance des jambes jusqu’à cumuler 100 squats.',stages:[
    {day:1,total:20,sets:[10,10]},{day:7,total:35,sets:[12,12,11]},{day:14,total:50,sets:[10,10,10,10,10]},{day:21,total:70,sets:[14,14,14,14,14]},{day:30,total:100,sets:[20,20,20,20,20]}]},
  {id:'gainage-5',icon:'🧱',title:'5 minutes de gainage',exerciseId:'planche',category:'Tronc',duration:30,unit:'secondes',unitType:'time',finalTarget:300,description:'Cumuler progressivement 5 minutes de gainage avec des séries courtes et un repos maîtrisé.',stages:[
    {day:1,total:60,sets:[30,30]},{day:7,total:90,sets:[30,30,30]},{day:14,total:120,sets:[40,40,40]},{day:21,total:180,sets:[60,60,60]},{day:30,total:300,sets:[60,60,60,60,60]}]},
  {id:'dips-50',icon:'🤸',title:'Objectif 50 dips',exerciseId:'dips',category:'Haut du corps',duration:30,unit:'répétitions',unitType:'reps',finalTarget:50,description:'Progresser jusqu’à cumuler 50 dips dans une séance courte.',stages:[
    {day:1,total:10,sets:[5,5]},{day:7,total:15,sets:[5,5,5]},{day:14,total:25,sets:[5,5,5,5,5]},{day:21,total:35,sets:[7,7,7,7,7]},{day:30,total:50,sets:[10,10,10,10,10]}]},
  {id:'tractions-30',icon:'🏋️',title:'Objectif 30 tractions',exerciseId:'tractions',category:'Dos',duration:30,unit:'répétitions',unitType:'reps',finalTarget:30,description:'Accumuler progressivement 30 tractions en plusieurs séries.',stages:[
    {day:1,total:6,sets:[2,2,2]},{day:7,total:9,sets:[3,3,3]},{day:14,total:15,sets:[3,3,3,3,3]},{day:21,total:22,sets:[5,5,4,4,4]},{day:30,total:30,sets:[6,6,6,6,6]}]}
];
window.SPORT_CHALLENGES=SPORT_CHALLENGES;

function sportChallengeById(id){return SPORT_CHALLENGES.find(x=>x.id===id)||null;}
function ensureSportChallengeSystem(){
  DATA.sport=DATA.sport||{};
  let sys=DATA.sport.challengeSystem;
  if(!sys||typeof sys!=='object')sys=DATA.sport.challengeSystem={version:2,activeId:null,progress:{},legacyMigrated:false};
  sys.version=2;sys.progress=sys.progress&&typeof sys.progress==='object'?sys.progress:{};
  if(!sys.legacyMigrated){
    // Migre l'ancien catalogue stocké séparément vers DATA pour que le cloud puisse le synchroniser.
    try{
      const legacy=JSON.parse(localStorage.getItem('vitatrack_challenges_v1')||'{}');
      for(const [id,st] of Object.entries(legacy||{})){
        if(!sportChallengeById(id)||!st?.start)continue;
        if(!sys.progress[id])sys.progress[id]={start:st.start};
        if(!sys.activeId && !(Array.isArray(st.done)&&st.done.includes('finished')))sys.activeId=id;
      }
      localStorage.removeItem('vitatrack_challenges_v1');
    }catch(e){}
    // Migre autant que possible l'ancien défi mensuel vers le nouveau catalogue.
    if(!sys.activeId&&DATA.sport.monthlyChallenge){
      const aliases={pompe_classique:'pompes-100',squat_poids_corps:'squats-100',burpees:null,hip_thrust_sol:null,jogging_sur_place:null,corde_a_sauter:null,mountain_climbers:null};
      const id=aliases[DATA.sport.monthlyChallenge.exerciseId];
      if(id){sys.activeId=id;sys.progress[id]={start:DATA.sport.monthlyChallenge.monthStart?DATA.sport.monthlyChallenge.monthStart+'T12:00:00':new Date().toISOString()};}
    }
    DATA.sport.monthlyChallenge=null;
    sys.legacyMigrated=true;
  }
  if(sys.activeId&&!sportChallengeById(sys.activeId))sys.activeId=null;
  return sys;
}
function sportChallengeState(id){const sys=ensureSportChallengeSystem();return sys.progress[id]||null;}
function sportChallengeDateOnly(value){return String(value||'').slice(0,10);}
function sportChallengeNoon(date){const d=new Date(String(date).slice(0,10)+'T12:00:00');return Number.isNaN(d.getTime())?null:d;}
function sportChallengeDayForDate(id,date=TODAY){
  const st=sportChallengeState(id);if(!st?.start)return null;
  const a=sportChallengeNoon(st.start),b=sportChallengeNoon(date);if(!a||!b)return null;
  const day=Math.floor((b-a)/86400000)+1;
  const ch=sportChallengeById(id);return ch&&day>=1&&day<=ch.duration?day:null;
}
function sportChallengeDateForDay(id,day){
  const st=sportChallengeState(id);if(!st?.start)return null;
  const d=sportChallengeNoon(st.start);if(!d)return null;d.setDate(d.getDate()+Number(day||1)-1);return d.toISOString().slice(0,10);
}
function sportChallengeStage(ch,day){let out=ch?.stages?.[0]||null;(ch?.stages||[]).forEach(x=>{if(x.day<=day)out=x});return out;}
function sportChallengeNumericValues(v){
  if(!Array.isArray(v))return[];
  return v.map(x=>{if(typeof x==='number')return x;const m=String(x||'').replace(',','.').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):0}).filter(Number.isFinite);
}
function sportChallengeExerciseAmount(e,ch){
  if(!e||!ch||String(e.exerciseId||'')!==ch.exerciseId)return 0;
  if(ch.unitType==='time'){
    const ds=sportChallengeNumericValues(e.durationsSeconds).reduce((a,b)=>a+b,0);
    return ds||Number(e.durationSeconds||0)||0;
  }
  return sportChallengeNumericValues(e.repsCompleted).reduce((a,b)=>a+b,0);
}
function sportChallengePerformanceForDate(ch,date){
  if(!ch)return 0;const key=String(date||TODAY).slice(0,10);let total=0;
  for(const a of (DATA.sport?.sessionHistory||[])){
    if(sportChallengeDateOnly(a.completedDate||a.date)!==key)continue;
    if(a.type==='exercise')total+=sportChallengeExerciseAmount(a,ch);
    else for(const e of (a.exercises||[]))total+=sportChallengeExerciseAmount(e,ch);
  }
  return Math.max(0,Math.round(total*10)/10);
}
function sportChallengeSummary(id,date=TODAY){
  const ch=sportChallengeById(id);const st=sportChallengeState(id);if(!ch||!st?.start)return null;
  const day=sportChallengeDayForDate(id,date);if(day===null)return null;
  const stage=sportChallengeStage(ch,day);const target=Number(stage?.total||0);const actual=sportChallengePerformanceForDate(ch,date);
  const pct=target?Math.min(100,Math.round(actual/target*100)):0;
  let completedDays=0;const last=Math.min(day,ch.duration);
  for(let n=1;n<=last;n++){
    const d=sportChallengeDateForDay(id,n),sg=sportChallengeStage(ch,n);if(d&&sportChallengePerformanceForDate(ch,d)>=Number(sg?.total||Infinity))completedDays++;
  }
  return {id:ch.id,title:ch.title,label:ch.title,icon:ch.icon,exerciseId:ch.exerciseId,category:ch.category,unit:ch.unit,unitType:ch.unitType,duration:ch.duration,finalTarget:ch.finalTarget,day,stage,target,actual,pct,completedToday:pct>=100,completedDays,overallPct:Math.min(100,Math.round(Number(stage?.total||0)/Math.max(1,ch.finalTarget)*100)),start:st.start};
}
function getActiveSportChallenge(){const sys=ensureSportChallengeSystem();return sys.activeId?sportChallengeById(sys.activeId):null;}
function getActiveSportChallengeSummary(date=TODAY){const ch=getActiveSportChallenge();return ch?sportChallengeSummary(ch.id,date):null;}
function getSportChallengeCalendarPct(date){const x=getActiveSportChallengeSummary(date);return x?x.pct:null;}
function startSportChallenge(id){
  const ch=sportChallengeById(id);if(!ch)return null;const sys=ensureSportChallengeSystem();
  const existing=sys.progress[id];
  // Un défi terminé/expiré peut être recommencé proprement depuis le jour 1.
  if(!existing?.start||sportChallengeDayForDate(id,TODAY)===null)sys.progress[id]={start:new Date().toISOString()};
  sys.activeId=id;DATA.sport.monthlyChallenge=null;if(typeof saveState==='function')saveState();return sportChallengeSummary(id,TODAY);
}
function stopSportChallenge(id){const sys=ensureSportChallengeSystem();if(!id||sys.activeId===id)sys.activeId=null;if(typeof saveState==='function')saveState();}
function runSportChallengeDay(id){
  const ch=sportChallengeById(id);if(!ch)return;
  if(!sportChallengeState(id)?.start)startSportChallenge(id);
  const info=sportChallengeSummary(id,TODAY);if(!info){if(typeof toast==='function')toast('Ce défi n’est pas actif aujourd’hui');return;}
  if(info.completedToday){if(typeof toast==='function')toast('Défi du jour déjà réalisé ✓');return;}
  const remaining=Math.max(1,Math.ceil(info.target-info.actual));
  const planned=Array.isArray(info.stage?.sets)?info.stage.sets.map(Number).filter(Number.isFinite):[];
  let consumed=Math.max(0,Number(info.actual)||0),remainingSets=[];
  for(const value of planned){
    if(consumed>=value){consumed-=value;continue;}
    remainingSets.push(Math.max(1,Math.round((value-consumed)*10)/10));consumed=0;
  }
  if(!remainingSets.length)remainingSets=[remaining];
  document.getElementById('challengeScreen')?.classList.remove('open');document.body.style.overflow='';
  if(typeof window.openExerciseRun==='function')window.openExerciseRun(ch.exerciseId,{mode:ch.unitType,target:remaining,sets:remainingSets,restSeconds:ch.unitType==='time'?30:60,challengeId:id,challengeDay:info.day,returnToChallenge:true});
  else if(typeof toast==='function')toast('Exécution de l’exercice indisponible');
}

// Compatibilité avec l'ancien moteur : aucune progression parallèle n'est conservée.
function generateMonthlyChallenge(){const x=getActiveSportChallengeSummary();return x?{id:x.id,label:x.title,exerciseId:x.exerciseId,target:x.target,progress:x.actual,unit:x.unit,completed:x.completedToday}:null;}
function updateChallengeProgress(){return getActiveSportChallengeSummary();}

window.getSportChallengeCatalog=()=>SPORT_CHALLENGES.slice();
window.getSportChallengeById=sportChallengeById;
window.getSportChallengeState=sportChallengeState;
window.getSportChallengeDayForDate=sportChallengeDayForDate;
window.getSportChallengeDateForDay=sportChallengeDateForDay;
window.getSportChallengeStage=sportChallengeStage;
window.getSportChallengePerformanceForDate=sportChallengePerformanceForDate;
window.getSportChallengeSummary=sportChallengeSummary;
window.getActiveSportChallenge=getActiveSportChallenge;
window.getActiveSportChallengeSummary=getActiveSportChallengeSummary;
window.getSportChallengeCalendarPct=getSportChallengeCalendarPct;
window.startSportChallenge=startSportChallenge;
window.stopSportChallenge=stopSportChallenge;
window.runSportChallengeDay=runSportChallengeDay;

/* ===== PROGRESSION TRACKING ===== */

function trackProgress(exerciseId) {
  // Compatibilité avec l'ancien écran de saisie : la progression n'est plus
  // stockée dans exerciseProgress. La source unique est sessionHistory + Coach V3.
  return typeof window.sportExerciseProgressionState==='function' ? window.sportExerciseProgressionState(exerciseId) : null;
}

/* ===== COACH CONVERSATIONNEL ===== */

function coachResponse(userQuery) {
  const query = userQuery.toLowerCase().trim();
  const profile = DATA.sport.profile;
  const recovery = estimateRecovery();
  const challenge = typeof getActiveSportChallengeSummary==='function'?getActiveSportChallengeSummary():null;

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
      text: challenge ? `${challenge.title}\n\nAujourd’hui : ${challenge.actual}/${challenge.target} ${challenge.unit} · ${challenge.pct}%` : 'Pas encore de défi actif.',
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
    const performanceSets=(Array.isArray(e.performanceSets)?e.performanceSets:[]).map(set=>({
      reps:Number(set?.reps)||0,
      loadKg:Number(set?.loadKg)||0,
      durationSeconds:Number(set?.durationSeconds)||0,
      distanceKm:Number(set?.distanceKm)||0,
      rpe:(Number(set?.rpe)>=1&&Number(set?.rpe)<=10)?Number(set.rpe):null
    }));
    const totalLoadVolume=performanceSets.reduce((n,set)=>n+(set.reps*set.loadKg),0)||Number(e.totalLoadVolume)||null;
    const maxLoadKg=Math.max(0,...performanceSets.map(set=>set.loadKg),Number(e.maxLoadKg)||0,Number(e.loadKg)||0)||null;
    const distanceKm=performanceSets.reduce((n,set)=>n+set.distanceKm,0)||Number(e.distanceKm)||null;
    return {
      ...e,
      exerciseId:e.exerciseId||e.id||null,
      exerciseName:e.exerciseName||e.name||'Exercice',
      plannedReps,
      plannedSets:Number(e.plannedSets)||(plannedReps.length||null),
      plannedRestSeconds:Number(e.plannedRestSeconds||e.rest)||0,
      repsCompleted:reps,
      durationsSeconds:durations,
      durationSeconds:durations.reduce((n,v)=>n+v,0)||durationScalar||null,
      performanceSets,
      totalLoadVolume,
      maxLoadKg,
      distanceKm,
      loadKg:Number(e.loadKg)||maxLoadKg||null,
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


  function performanceMetric(a){
    if(!a)return{value:0,kind:'reps',unit:'reps',secondary:null};
    const sets=Array.isArray(a.performanceSets)?a.performanceSets:[];
    const volume=Number(a.totalLoadVolume)||sets.reduce((n,set)=>n+(Number(set?.reps)||0)*(Number(set?.loadKg)||0),0);
    const maxLoad=Math.max(0,Number(a.maxLoadKg)||0,Number(a.loadKg)||0,...sets.map(set=>Number(set?.loadKg)||0));
    if(volume>0)return{value:volume,kind:'load',unit:'kg·reps',secondary:maxLoad>0?`meilleure charge ${maxLoad.toLocaleString('fr-FR',{maximumFractionDigits:2})} kg`:null};
    const distance=Number(a.distanceKm)||sets.reduce((n,set)=>n+(Number(set?.distanceKm)||0),0);
    if(distance>0)return{value:distance,kind:'distance',unit:'km',secondary:null};
    const seconds=Number(a.durationSeconds)||asNumberArray(a.durationsSeconds).reduce((n,v)=>n+v,0)||sets.reduce((n,set)=>n+(Number(set?.durationSeconds)||0),0);
    if(seconds>0)return{value:seconds,kind:'time',unit:'s',secondary:null};
    const reps=asNumberArray(a.repsCompleted).reduce((n,v)=>n+v,0)||sets.reduce((n,set)=>n+(Number(set?.reps)||0),0);
    return{value:reps,kind:'reps',unit:'reps',secondary:null};
  }
  function numericPerformance(a){return performanceMetric(a).value}
  function formatPerformance(metric){
    if(!metric)return'—';
    if(metric.kind==='load')return`${Math.round(metric.value).toLocaleString('fr-FR')} kg·reps`;
    if(metric.kind==='distance')return`${Number(metric.value).toLocaleString('fr-FR',{maximumFractionDigits:2})} km`;
    if(metric.kind==='time'){
      const sec=Math.round(metric.value);
      return sec>=60?`${Math.floor(sec/60)} min ${sec%60}s`:`${sec} s`;
    }
    return`${Math.round(metric.value)} reps`;
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
      const items=x.items.map(i=>({item:i,metric:performanceMetric(i)})).filter(i=>i.metric.value>0);
      if(!items.length)return null;
      const last=items[items.length-1], prev=items.length>1?items[items.length-2]:null;
      // Compare only like-for-like metrics.
      const comparablePrev=prev&&prev.metric.kind===last.metric.kind?prev.metric:null;
      const delta=comparablePrev?last.metric.value-comparablePrev.value:0;
      return {...x,lastMetric:last.metric,prevMetric:comparablePrev,delta,count:items.length};
    }).filter(Boolean).sort((a,b)=>b.count-a.count||b.lastMetric.value-a.lastMetric.value).slice(0,8);
    const kcal=h.reduce((n,a)=>n+Number(a.estimatedKcal||sportKcalForActivity(a)||0),0);
    const last7=h.filter(a=>Date.now()-new Date(a.recordedAt||a.date).getTime()<=7*86400000).length;
    const durations=h.reduce((n,a)=>n+Number(a.durationMinutes||0),0);
    return {h,top,kcal,last7,durations};
  }
  window.openSportProgress=function(){
    let p=document.getElementById('sportProgressPanel');
    if(!p){p=document.createElement('div');p.id='sportProgressPanel';p.className='sport-panel';document.body.appendChild(p);}
    const d=progressData(), activities=d.h.length;
    const trend={up:0,down:0,same:0,first:0};
    d.top.forEach(x=>{if(!x.prevMetric)trend.first++;else if(x.delta>0)trend.up++;else if(x.delta<0)trend.down++;else trend.same++;});
    const rows=d.top.map(x=>{
      const arrow=!x.prevMetric?'•':x.delta>0?'↗':x.delta<0?'↘':'→';
      const cls=!x.prevMetric?'first':x.delta>0?'up':x.delta<0?'down':'same';
      let delta='Première référence';
      if(x.prevMetric){
        if(x.delta===0)delta='Stable';
        else if(x.lastMetric.kind==='distance')delta=`${x.delta>0?'+':'−'}${Math.abs(x.delta).toLocaleString('fr-FR',{maximumFractionDigits:2})} km`;
        else if(x.lastMetric.kind==='time')delta=`${x.delta>0?'+':'−'}${Math.round(Math.abs(x.delta))} s`;
        else if(x.lastMetric.kind==='load')delta=`${x.delta>0?'+':'−'}${Math.round(Math.abs(x.delta)).toLocaleString('fr-FR')} kg·reps`;
        else delta=`${x.delta>0?'+':'−'}${Math.round(Math.abs(x.delta))} reps`;
      }
      const secondary=x.lastMetric.secondary?` · ${escapeHtmlHistory(x.lastMetric.secondary)}`:'';
      const previous=x.prevMetric?`Avant : ${formatPerformance(x.prevMetric)}`:'Ta prochaine réalisation sera comparée à celle-ci.';
      return `<div class="sport-progress-v9-row"><div class="sport-progress-v9-head"><div><strong>${escapeHtmlHistory(x.name)}</strong><span>${formatPerformance(x.lastMetric)}${secondary}</span></div><b class="sport-progress-v9-trend ${cls}">${arrow} ${escapeHtmlHistory(delta)}</b></div><small>${escapeHtmlHistory(previous)} · ${x.count} réalisation${x.count>1?'s':''}</small></div>`;
    }).join('');
    const adaptations=Object.values(DATA.sport?.exerciseAdaptations||{}).filter(Boolean).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,5);
    const coachRows=adaptations.map(a=>{
      const ex=typeof window.getExerciseV3==='function'?window.getExerciseV3(a.exerciseId):null;
      const suggested=a.suggestedId&&typeof window.getExerciseV3==='function'?window.getExerciseV3(a.suggestedId):null;
      const targets=Array.isArray(a.nextPrescription?.targets)&&a.nextPrescription.targets.length?a.nextPrescription.targets.join(' / '):'';
      const label=a.action==='progress'?'Progression':a.action==='reduce'?'Allégé':'Maintenu';
      const icon=a.action==='progress'?'↗':a.action==='reduce'?'↘':'→';
      const next=suggested?`→ ${suggested.name}`:(targets?targets:'Même cible');
      return `<div class="sport-coach-next-row"><div><strong>${icon} ${escapeHtmlHistory(ex?.name||a.exerciseId||'Exercice')}</strong><span>${escapeHtmlHistory(label)}</span></div><small>${escapeHtmlHistory(next)}</small></div>`;
    }).join('');
    const streak=typeof sportStreak==='function'?sportStreak():0;
    p.innerHTML=`<div class="sport-panel-head"><h2>📈 Progression</h2><button class="sport-close" onclick="closeSportProgress()">×</button></div>
      <div class="sport-metrics"><div class="sport-metric"><strong>${activities}</strong><small>activités</small></div><div class="sport-metric"><strong>${d.last7}</strong><small>7 derniers jours</small></div><div class="sport-metric"><strong>${Math.round(d.kcal)}</strong><small>kcal sport</small></div></div>
      <div class="sport-progress-v9-overview"><div><span>↗</span><strong>${trend.up}</strong><small>en progression</small></div><div><span>→</span><strong>${trend.same}</strong><small>stables</small></div><div><span>●</span><strong>${trend.first}</strong><small>références</small></div></div>
      <div class="card sport-progress-v9-card"><div class="eyebrow">Tes performances</div><p class="muted small">Dernière réalisation comparée à la précédente, exercice par exercice.</p>${rows||'<p class="muted small">Fais quelques exercices pour commencer à voir ta progression.</p>'}</div>
      ${coachRows?`<div class="card sport-progress-v9-card"><div class="eyebrow">🤖 Coach · prochaine fois</div><p class="muted small">Les prochaines cibles déjà préparées à partir de tes ressentis et performances.</p><div class="sport-coach-next-list">${coachRows}</div></div>`:''}
      <div class="card sport-progress-v9-card"><div class="eyebrow">🏃 Régularité</div><strong class="sport-progress-v9-streak">${streak} jour${streak>1?'s':''}</strong><p class="muted small">série actuelle d’activités enregistrées.</p></div>`;
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

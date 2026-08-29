/* VitaTrack Sport — Exercise Model V4
   Couche canonique compatible avec le catalogue historique.
   Objectif : une seule représentation fiable de l'exercice sans casser les
   écrans/programmes existants qui utilisent encore les anciens alias. */
(function(){
  const source = Array.isArray(window.EXERCISES)
    ? window.EXERCISES
    : (Array.isArray(window.VITATRACK_EXERCISES) ? window.VITATRACK_EXERCISES : []);

  const CONTENT = window.VITATRACK_EXERCISE_CONTENT_V3 || {technique:{},progression:{}};
  const QUALITY = window.VITATRACK_EXERCISE_QUALITY_V4 || {version:0,family:{},exercise:{}};

  const EQUIPMENT_ALIASES = {
    aucun:'none', none:'none',
    haltere:'halteres', halteres:'halteres', dumbbell:'halteres', dumbbells:'halteres',
    barre:'barre', barbell:'barre', barre_traction:'barre',
    kettlebell:'kettlebell',
    elastique:'elastiques', elastiques:'elastiques', bands:'elastiques',
    machine:'machine', machines:'machine',
    trx:'trx', banc:'banc'
  };

  /* Familles V4 : utilisées par la bibliothèque pour regrouper les variantes
     d'un même mouvement. Les règles restent ici, dans le modèle, afin que
     l'interface et le coach puissent partager la même taxonomie. */
  const FAMILY_DEFS = [
    ['pushups','Pompes',10,/^(pompes(?:-|$)|pseudo-planche-pompes$)/],
    ['vertical_pushups','Pompes verticales',20,/^(pike-push-up|handstand-push-up)$/],
    ['dips','Dips',30,/^dips(?:-|$)/],
    ['bench_press','Développés poitrine',40,/^(developpe-couche|developpe-couche-incline|developpe-couche-decline|developpe-halteres|developpe-incline-halteres)$/],
    ['chest_fly','Écartés poitrine',50,/^(ecartes-|pec-deck$)/],
    ['pullups','Tractions',60,/^tractions(?:-|$)/],
    ['rows','Rowing & tirages',70,/^(rowing-|tirage-|pullover-haltere$)/],
    ['deadlift','Soulevés de terre',80,/^(souleve-de-terre(?:-|$)|good-morning$)/],
    ['biceps','Curl biceps',90,/^curl-/],
    ['triceps','Triceps',100,/^(extension-triceps|barre-au-front|kickback-triceps)/],
    ['shoulder_press','Développés épaules',110,/^(developpe-militaire|developpe-epaules-halteres|arnold-press)$/],
    ['shoulder_isolation','Épaules · isolation',120,/^(elevations-|oiseau-halteres$|face-pull$)/],
    ['core_stability','Stabilité du tronc',125,/^(superman$|bird-dog$)/],
    ['abs_flexion','Abdominaux',130,/^(crunch(?:-|$)|sit-up$|bicycle-crunch$|v-up$)/],
    ['leg_raises','Relevés de jambes',140,/^(releves-de-jambes|releves-de-genoux|flutter-kicks|dragon-flag)$/],
    ['core_rotation','Rotation du tronc',150,/^russian-twist$/],
    ['planks','Gainage',160,/^(planche$|planche-laterale$|planche-dynamique$|hollow-body-hold$|dead-bug$|wall-sit$)/],
    ['squats','Squats',170,/^(squat(?:-|$)|front-squat$|back-squat$)/],
    ['lunges','Fentes',180,/^fentes(?:-|$)/],
    ['step','Step & montée',190,/^step-up$/],
    ['quadriceps','Quadriceps · machine',200,/^leg-extension$/],
    ['hip_extension','Hip thrust & pont fessier',210,/^(hip-thrust$|glute-bridge(?:-|$))/],
    ['glute_isolation','Fessiers · isolation',220,/^(donkey-kicks$|fire-hydrants$|kickback-fessier$)/],
    ['hamstrings','Ischio-jambiers',230,/^(leg-curl$|nordic-curl$)/],
    ['kettlebell','Kettlebell',240,/^kettlebell-swing$/],
    ['burpees','Burpees',250,/^burpees(?:-|$)/],
    ['full_body','Mouvements complets',260,/^(thrusters$|clean-press$|turkish-get-up$|farmer-walk$|man-makers$)/],
    ['ground_locomotion','Locomotion au sol',270,/^(bear-crawl$|crab-walk$)/],
    ['cardio_drills','Cardio dynamique',280,/^(mountain-climbers$|jumping-jacks$|high-knees$|butt-kicks$|skaters$|tuck-jumps$|plank-jacks$|shadow-boxing$)/],
    ['handstand','Équilibre sur les mains',290,/^(handstand$|handstand-hold$)/],
    ['lsit','L-sit',300,/^(l-sit$|tuck-l-sit$)/],
    ['levers','Levers',310,/^(front-lever$|tuck-front-lever$|back-lever$)/],
    ['planche_skill','Planche · calisthénie',320,/^(planche-2$|tuck-planche$)/],
    ['single_leg_squat','Squats unilatéraux',330,/^(pistol-squat$|shrimp-squat$)/],
    ['calisthenics_skills','Figures calisthénie',340,/^(muscle-up$|human-flag$)/],
    ['mobility_lower','Mobilité · jambes',400,/^(etirement-quadriceps$|etirement-ischio-jambiers$|etirement-mollets$|mobilite-chevilles$)/],
    ['mobility_upper','Mobilité · haut du corps',410,/^(etirement-pectoraux$|etirement-epaules$|etirement-dos$|mobilite-epaules$)/],
    ['mobility_spine_hips','Mobilité · dos & hanches',420,/^(rotation-thoracique$|cat-cow$|child-s-pose$|cobra$|90-90-hanches$|world-s-greatest-stretch$|mobilite-hanches$)/],
    ['run_walk','Course & marche',500,/^activity-(course|jogging|sprint|marche|marche-rapide|randonnee)$/],
    ['cycling','Vélo',510,/^activity-(velo|velo-d-appartement)$/],
    ['cardio_machine','Cardio · machines',520,/^activity-(velo-elliptique|rameur|montees-d-escaliers|step)$/],
    ['jump_rope','Corde à sauter',530,/^activity-corde-a-sauter$/],
    ['glide','Glisse',540,/^activity-(roller|patinage)$/],
    ['water','Natation',550,/^activity-natation$/],
    ['combat','Boxe',560,/^activity-boxe$/],
    ['climbing','Escalade',565,/^activity-escalade$/],
    ['mind_body','Mobilité & corps-esprit',570,/^activity-(yoga|pilates|danse)$/],
    ['team_sports','Sports collectifs',580,/^activity-(football|basketball|volleyball)$/],
    ['racket_sports','Sports de raquette',590,/^activity-(tennis|badminton)$/]
  ];
  const FAMILY_RANKS = {
    'pompes-sur-les-genoux':10,'pompes-inclinees':20,'pompes':30,'pompes-larges':35,'pompes-serrees':40,'pompes-diamant':50,'pompes-declinees':60,'pompes-archer':70,'pompes-explosives':80,'pompes-claquees':90,'pseudo-planche-pompes':100,
    'pike-push-up':10,'handstand-push-up':20,
    'dips-sur-banc':10,'dips-entre-deux-supports':20,'dips':30,
    'tractions-australiennes':10,'tractions':20,'tractions-supination':30,'tractions-prise-neutre':40,'tractions-pronation':50,'tractions-poitrine':60,'tractions-explosives':70,
    'glute-bridge':10,'glute-bridge-une-jambe':20,'hip-thrust':30,
    'tuck-l-sit':10,'l-sit':20,
    'tuck-front-lever':10,'front-lever':20,'back-lever':30,
    'tuck-planche':10,'planche-2':20,
    'squat':10,'squat-sumo':20,'squat-gobelet':30,'front-squat':40,'back-squat':50,'squat-bulgare':60,'squat-saute':70,
    'fentes':10,'fentes-arriere':20,'fentes-avant':30,'fentes-marchees':40,'fentes-laterales':50,
    'burpees':10,'burpees-avec-saut':20,
    'handstand-hold':10,'handstand':20,
    'pistol-squat':10,'shrimp-squat':20
  };
  const inferFamily = raw => {
    const id=String(raw?.id||'');
    const hit=FAMILY_DEFS.find(([, , , re])=>re.test(id));
    const familyRank=FAMILY_RANKS[id] ?? 100;
    if(hit)return {id:hit[0],label:hit[1],order:hit[2],rank:familyRank};
    if(raw?.kind==='activity')return {id:'other_activities',label:'Autres activités',order:900,rank:familyRank};
    return {id:'other_exercises',label:'Autres exercices',order:800,rank:familyRank};
  };

  const OVERRIDES = {
    /* matériel historique manifestement erroné */
    'developpe-couche': {equipment:['barre'], isBodyweight:false},
    'developpe-couche-incline': {equipment:['barre'], isBodyweight:false},
    'developpe-couche-decline': {equipment:['barre'], isBodyweight:false},
    'developpe-halteres': {equipment:['halteres'], isBodyweight:false},
    'developpe-incline-halteres': {equipment:['halteres'], isBodyweight:false},
    'ecartes-a-la-poulie': {equipment:['machine'], isBodyweight:false, movement:'push_h'},
    'rowing-haltere': {equipment:['halteres'], isBodyweight:false},
    'rowing-unilateral': {equipment:['halteres'], isBodyweight:false},
    'rowing-a-la-poulie': {equipment:['machine'], isBodyweight:false},
    'tirage-horizontal': {equipment:['machine'], isBodyweight:false},
    'tirage-vertical': {equipment:['machine'], isBodyweight:false, movement:'pull_v'},
    'tirage-poitrine': {equipment:['machine'], isBodyweight:false, movement:'pull_v'},
    'superman': {equipment:['none'], isBodyweight:true},
    'bird-dog': {equipment:['none'], isBodyweight:true},
    'pike-push-up': {equipment:['none'], isBodyweight:true, movement:'push_v'},
    'handstand-push-up': {equipment:['none'], isBodyweight:true, movement:'push_v', difficulty:'difficile', level:'avance', difficultyScore:5},
    'squat-gobelet': {equipment:['halteres','kettlebell'], isBodyweight:false},
    'leg-extension': {equipment:['machine'], isBodyweight:false},
    'leg-curl': {equipment:['machine'], isBodyweight:false, movement:'hinge'},
    'kettlebell-swing': {equipment:['kettlebell'], isBodyweight:false, movement:'hinge'},
    'souleve-de-terre-roumain': {equipment:['barre'], isBodyweight:false},
    'curl-barre': {equipment:['barre'], isBodyweight:false},
    'curl-poulie': {equipment:['machine'], isBodyweight:false},

    /* mouvements */
    'tractions': {movement:'pull_v', isBodyweight:true},
    'tractions-pronation': {movement:'pull_v', isBodyweight:true},
    'tractions-supination': {movement:'pull_v', isBodyweight:true},
    'tractions-prise-neutre': {movement:'pull_v', isBodyweight:true},
    'tractions-explosives': {movement:'pull_v', isBodyweight:true},
    'tractions-poitrine': {movement:'pull_v', isBodyweight:true},
    'fentes-avant': {movement:'lunge'},
    'fentes-arriere': {movement:'lunge'},
    'fentes-marchees': {movement:'lunge'},
    'fentes-laterales': {movement:'lunge'},
    'nordic-curl': {movement:'hinge'},

    /* difficultés manifestement sous-évaluées */
    'pompes-explosives': {difficulty:'difficile', level:'avance', difficultyScore:4},
    'pompes-claquees': {difficulty:'difficile', level:'avance', difficultyScore:5},
    'pompes-archer': {difficulty:'difficile', level:'avance', difficultyScore:4},
    'pseudo-planche-pompes': {difficulty:'difficile', level:'avance', difficultyScore:5},
    'dragon-flag': {difficulty:'difficile', level:'avance', difficultyScore:5},
    'squat-bulgare': {difficulty:'moyen', level:'intermediaire', difficultyScore:3}
  };

  const arr = v => Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []);
  const uniq = v => [...new Set(arr(v))];
  const normalizeEquipment = list => {
    const out = uniq(list).map(v=>EQUIPMENT_ALIASES[String(v).toLowerCase()] || String(v).toLowerCase());
    return out.length ? out : ['none'];
  };
  const difficultyScoreFrom = x => {
    const n=Number(x?.diff);
    if(Number.isFinite(n)&&n>=1&&n<=5)return n;
    return ({facile:1,moyen:3,difficile:5,variable:3})[x?.difficulty] || 3;
  };
  const inferMetric = (raw,equipment,isBodyweight) => {
    if(raw.measure==='distance')return 'distance';
    if(raw.measure==='time' || raw.kind==='activity')return 'time';
    if(raw.measure!=='reps')return 'reps';
    const id=String(raw.id||'').toLowerCase();
    const bodyweightPattern=/(^pompes?|^tractions?|^dips|^planche|crunch|burpee|mountain|bird-dog|superman|glute-bridge|nordic-curl|pike-push-up|handstand-push-up|squat(?!-gobelet)|fentes?|releves-de-jambes|hollow|l-sit|wall-sit)/;
    if(isBodyweight || bodyweightPattern.test(id))return 'reps';
    if(equipment.some(v=>['halteres','barre','kettlebell','machine'].includes(v)))return 'load_reps';
    return 'reps';
  };

  const difficultyLabelFromScore=score=>Number(score)>=4?'difficile':Number(score)>=3?'moyen':'facile';
  const levelFromScore=score=>Number(score)>=4?'avance':Number(score)>=3?'intermediaire':'debutant';

  function normalize(raw){
    const family=inferFamily(raw);
    const familyQuality=QUALITY.family?.[family.id]||{};
    const exerciseQuality=QUALITY.exercise?.[raw.id]||{};
    // Priorité : défaut de famille < anciennes corrections < curation V4.
    const o={...familyQuality,...(OVERRIDES[raw.id]||{}),...exerciseQuality};
    const curatedTechnique=CONTENT.technique?.[raw.id]||{};
    const curatedProgression=CONTENT.progression?.[raw.id]||{};
    const equipment=normalizeEquipment(o.equipment ?? raw.equipment ?? raw.equip);
    const isBodyweight=o.isBodyweight ?? (o.equipment!==undefined ? equipment.includes('none') : (raw.is_bodyweight ?? (equipment.length===1&&equipment[0]==='none')));
    const primary=uniq(o.primary!==undefined ? o.primary : (raw.muscles?.length ? raw.muscles : (raw.target_muscles?.length ? raw.target_muscles : raw.body_area)));
    const secondary=uniq(o.secondary!==undefined ? o.secondary : (curatedTechnique.secondary?.length ? curatedTechnique.secondary : (raw.musclesSec?.length ? raw.musclesSec : raw.secondary_muscles)));
    const movement=o.movement ?? raw.move ?? 'core';
    const difficultyScore=o.difficultyScore ?? difficultyScoreFrom(raw);
    const difficulty=o.difficulty ?? (o.difficultyScore!==undefined?difficultyLabelFromScore(difficultyScore):(raw.difficulty ?? difficultyLabelFromScore(difficultyScore)));
    const level=o.level ?? (o.difficultyScore!==undefined?levelFromScore(difficultyScore):(raw.level ?? levelFromScore(difficultyScore)));
    const metric=o.metric ?? inferMetric(raw,equipment,isBodyweight);
    const variants=raw.variants||{};
    const technique={
      setup:String(curatedTechnique.setup||''),
      execution:String(curatedTechnique.execution||raw.instr||''),
      breathing:String(curatedTechnique.breathing||''),
      instruction:String(curatedTechnique.execution||raw.instr||''),
      mistakes:uniq(curatedTechnique.mistakes?.length ? curatedTechnique.mistakes : raw.mistakes),
      avoid:uniq(curatedTechnique.avoid?.length ? curatedTechnique.avoid : raw.avoid)
    };
    const progression={
      easier:uniq(curatedProgression.easier!==undefined ? curatedProgression.easier : variants.easier),
      harder:uniq(curatedProgression.harder!==undefined ? curatedProgression.harder : variants.harder),
      alternatives:uniq(curatedProgression.alternatives!==undefined ? curatedProgression.alternatives : variants.alt)
    };
    const bodyArea=uniq(o.bodyArea!==undefined ? o.bodyArea : (raw.body_area?.length?raw.body_area:primary));
    const goals=uniq(o.goals!==undefined ? o.goals : raw.goals);
    const role=String(o.role||'main');
    const autoProgram=o.autoProgram!==undefined?!!o.autoProgram:!['accessory','skill'].includes(role);

    /* Les alias historiques sont conservés pour les écrans et le moteur
       existants, mais ils pointent tous vers les valeurs V4 normalisées. */
    return {
      ...raw,
      schemaVersion:4,
      qualityVersion:Number(QUALITY.version)||0,
      kind:raw.kind||'exercise',
      family,
      familyId:family.id,
      familyLabel:family.label,
      familyOrder:family.order,
      familyRank:family.rank,
      category:raw.category||raw.cat||'renforcement',
      movement,
      move:movement,
      difficulty,
      difficultyScore,
      diff:difficultyScore,
      level,
      metric,
      measure:metric==='load_reps'?'reps':metric,
      loadType:metric==='load_reps'?'external':(isBodyweight?'bodyweight':'none'),
      equipment,
      equip:[...equipment],
      isBodyweight,
      is_bodyweight:isBodyweight,
      duration:raw.duration||'moyen',
      types:uniq(raw.types),
      bodyArea,
      body_area:[...bodyArea],
      muscles:{primary,secondary},
      target_muscles:[...primary],
      secondary_muscles:[...secondary],
      /* aliases d'affichage existants */
      musclesLegacy:[...primary],
      musclesSec:[...secondary],
      goals,
      role,
      programRole:role,
      autoProgram,
      technique,
      instr:technique.instruction,
      mistakes:[...technique.mistakes],
      avoid:[...technique.avoid],
      progression,
      variants:{easier:[...progression.easier],harder:[...progression.harder],alt:[...progression.alternatives]}
    };
  }

  /* Compatibilité importante : beaucoup de code existant attend x.muscles
     comme un tableau. On expose donc une vue V4 détaillée séparée sans casser
     cet alias historique. */
  const normalized = source.map(raw=>{
    const v3=normalize(raw);
    const primary=[...v3.muscles.primary],secondary=[...v3.muscles.secondary];
    v3.muscleGroups={primary,secondary};
    v3.muscles=primary;
    return v3;
  });

  const byId=new Map(normalized.map(x=>[x.id,x]));
  window.VITATRACK_EXERCISE_MODEL_VERSION=4;
  window.VITATRACK_EXERCISES_V4=normalized;
  window.VITATRACK_EXERCISES_V3=normalized; // alias de compatibilité
  window.getExerciseV4=id=>byId.get(id)||null;
  window.getExerciseV3=id=>byId.get(id)||null; // alias de compatibilité
  window.getExerciseFamily=exerciseOrId=>{
    const x=typeof exerciseOrId==='string'?byId.get(exerciseOrId):exerciseOrId;
    return x?.family || {id:'other_exercises',label:'Autres exercices',order:800};
  };
  window.getExerciseMetric=exerciseOrId=>{
    const x=typeof exerciseOrId==='string'?byId.get(exerciseOrId):exerciseOrId;
    return x?.metric || 'reps';
  };
  window.sportPerformanceKind=exerciseOrId=>window.getExerciseMetric(exerciseOrId);
  window.getExerciseEquipment=exerciseOrId=>{
    const x=typeof exerciseOrId==='string'?byId.get(exerciseOrId):exerciseOrId;
    return Array.isArray(x?.equipment)?[...x.equipment]:['none'];
  };

  /* V4 devient la source active, tout en conservant les noms globaux utilisés
     par le reste de l'application. */
  window.EXERCISES=normalized;
  window.VITATRACK_EXERCISES=normalized;
  if(window.EXERCISES_CATALOG){
    window.EXERCISES_CATALOG={...window.EXERCISES_CATALOG,version:4,exercises:normalized};
  }
})();

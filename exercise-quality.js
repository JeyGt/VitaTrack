/* VitaTrack Sport — Catalogue Quality V4
   Métadonnées curatées séparées du catalogue historique.
   Cette couche corrige les informations utilisées par la bibliothèque,
   les filtres et la génération automatique sans réécrire les 172 objets. */
(function(){
  const Q={version:4,family:{},exercise:{}};
  const family=(id,meta)=>{Q.family[id]={...(Q.family[id]||{}),...meta};};
  const add=(ids,meta)=>String(ids).trim().split(/\s+/).filter(Boolean).forEach(id=>{Q.exercise[id]={...(Q.exercise[id]||{}),...meta};});

  /* Rôles : main = mouvement principal générable ; accessory = utile mais ne
     remplace pas un mouvement principal ; skill = figure technique ; cardio,
     mobility et activity restent générables dans les séances correspondantes. */
  family('pushups',{movement:'push_h',role:'main',bodyArea:['pectoraux','bras','epaules'],primary:['pectoraux','triceps'],secondary:['epaules','abdominaux'],goals:['condition_physique','musculation','force']});
  family('vertical_pushups',{movement:'push_v',role:'main',bodyArea:['epaules','bras','tronc'],primary:['epaules','triceps'],secondary:['pectoraux','abdominaux'],goals:['condition_physique','musculation','force']});
  family('dips',{movement:'push_v',role:'main',bodyArea:['pectoraux','bras','epaules'],primary:['triceps','pectoraux'],secondary:['epaules'],goals:['condition_physique','musculation','force']});
  family('bench_press',{movement:'push_h',role:'main',bodyArea:['pectoraux','bras','epaules'],primary:['pectoraux','triceps'],secondary:['epaules'],goals:['condition_physique','musculation','force']});
  family('chest_fly',{movement:'push_h',role:'accessory',bodyArea:['pectoraux','epaules'],primary:['pectoraux'],secondary:['epaules'],goals:['musculation','condition_physique']});
  family('pullups',{movement:'pull_v',role:'main',bodyArea:['dos','bras'],primary:['dos','biceps'],secondary:['avant-bras','abdominaux'],goals:['condition_physique','musculation','force']});
  family('rows',{movement:'pull_h',role:'main',bodyArea:['dos','bras'],primary:['dos'],secondary:['biceps','arriere-epaules'],goals:['condition_physique','musculation','force']});
  family('deadlift',{movement:'hinge',role:'main',bodyArea:['jambes','fessiers','dos'],primary:['fessiers','ischio-jambiers'],secondary:['dos','quadriceps','avant-bras'],goals:['condition_physique','musculation','force']});
  family('biceps',{movement:'elbow_flexion',role:'accessory',bodyArea:['bras'],primary:['biceps'],secondary:['avant-bras'],goals:['musculation','condition_physique']});
  family('triceps',{movement:'elbow_extension',role:'accessory',bodyArea:['bras'],primary:['triceps'],secondary:[],goals:['musculation','condition_physique']});
  family('shoulder_press',{movement:'push_v',role:'main',bodyArea:['epaules','bras'],primary:['epaules','triceps'],secondary:['haut-pectoraux'],goals:['condition_physique','musculation','force']});
  family('shoulder_isolation',{movement:'shoulder_isolation',role:'accessory',bodyArea:['epaules'],primary:['epaules'],secondary:['haut-dos'],goals:['musculation','condition_physique']});
  family('core_stability',{movement:'core',role:'main',bodyArea:['tronc','dos'],primary:['abdominaux','lombaires'],secondary:['fessiers'],goals:['condition_physique','musculation']});
  family('abs_flexion',{movement:'core',role:'main',bodyArea:['tronc','abdominaux'],primary:['abdominaux'],secondary:['obliques'],goals:['condition_physique','musculation']});
  family('leg_raises',{movement:'core',role:'main',bodyArea:['tronc','abdominaux'],primary:['abdominaux'],secondary:['flechisseurs-hanche'],goals:['condition_physique','musculation']});
  family('core_rotation',{movement:'core',role:'main',bodyArea:['tronc','abdominaux'],primary:['obliques'],secondary:['abdominaux'],goals:['condition_physique','musculation']});
  family('planks',{movement:'core',role:'main',bodyArea:['tronc','abdominaux'],primary:['abdominaux'],secondary:['obliques','lombaires','epaules'],goals:['condition_physique','musculation']});
  family('squats',{movement:'squat',role:'main',bodyArea:['jambes','fessiers'],primary:['quadriceps','fessiers'],secondary:['ischio-jambiers','abdominaux'],goals:['condition_physique','musculation','force']});
  family('lunges',{movement:'lunge',role:'main',bodyArea:['jambes','fessiers'],primary:['quadriceps','fessiers'],secondary:['ischio-jambiers'],goals:['condition_physique','musculation']});
  family('step',{movement:'lunge',role:'main',bodyArea:['jambes','fessiers'],primary:['quadriceps','fessiers'],secondary:['ischio-jambiers','mollets'],goals:['condition_physique','musculation']});
  family('quadriceps',{movement:'knee_extension',role:'accessory',bodyArea:['jambes'],primary:['quadriceps'],secondary:[],goals:['musculation','condition_physique']});
  family('hip_extension',{movement:'hinge',role:'main',bodyArea:['fessiers','jambes'],primary:['fessiers'],secondary:['ischio-jambiers','abdominaux'],goals:['condition_physique','musculation','force']});
  family('glute_isolation',{movement:'hip_accessory',role:'accessory',bodyArea:['fessiers','jambes'],primary:['fessiers'],secondary:['abducteurs'],goals:['musculation','condition_physique']});
  family('hamstrings',{movement:'knee_flexion',role:'accessory',bodyArea:['jambes'],primary:['ischio-jambiers'],secondary:['fessiers'],goals:['musculation','condition_physique']});
  family('kettlebell',{movement:'hinge',role:'main',bodyArea:['fessiers','jambes','tronc'],primary:['fessiers','ischio-jambiers'],secondary:['abdominaux','dos'],goals:['condition_physique','force','endurance']});
  family('burpees',{movement:'loco',role:'cardio',bodyArea:['corps complet'],primary:['corps complet'],secondary:[],goals:['condition_physique','endurance','perte_poids']});
  family('full_body',{movement:'loco',role:'main',bodyArea:['corps complet'],primary:['corps complet'],secondary:[],goals:['condition_physique','musculation','endurance']});
  family('ground_locomotion',{movement:'loco',role:'cardio',bodyArea:['corps complet','tronc'],primary:['corps complet'],secondary:['abdominaux'],goals:['condition_physique','endurance']});
  family('cardio_drills',{movement:'loco',role:'cardio',bodyArea:['corps complet'],primary:['corps complet'],secondary:[],goals:['condition_physique','endurance','perte_poids']});
  family('handstand',{movement:'push_v',role:'skill',bodyArea:['epaules','tronc','bras'],primary:['epaules'],secondary:['triceps','abdominaux'],goals:['force','condition_physique']});
  family('lsit',{movement:'core',role:'skill',bodyArea:['tronc','abdominaux','bras'],primary:['abdominaux'],secondary:['triceps','flechisseurs-hanche'],goals:['force','condition_physique']});
  family('levers',{movement:'core',role:'skill',bodyArea:['tronc','dos','bras'],primary:['dos','abdominaux'],secondary:['biceps','epaules'],goals:['force','condition_physique']});
  family('planche_skill',{movement:'push_h',role:'skill',bodyArea:['pectoraux','epaules','tronc','bras'],primary:['epaules','pectoraux'],secondary:['triceps','abdominaux'],goals:['force','condition_physique']});
  family('single_leg_squat',{movement:'squat',role:'skill',bodyArea:['jambes','fessiers'],primary:['quadriceps','fessiers'],secondary:['ischio-jambiers','mollets'],goals:['force','condition_physique']});
  family('calisthenics_skills',{movement:'skill',role:'skill',bodyArea:['corps complet'],primary:['corps complet'],secondary:[],goals:['force','condition_physique']});
  for(const id of ['mobility_lower','mobility_upper','mobility_spine_hips']) family(id,{movement:'mobility',role:'mobility',bodyArea:['corps complet'],primary:['corps complet'],secondary:[],goals:['mobilite','condition_physique']});
  for(const id of ['run_walk','cycling','cardio_machine','jump_rope','glide','water','combat','climbing','mind_body','team_sports','racket_sports']) family(id,{movement:'loco',role:'activity',bodyArea:['corps complet'],primary:['corps complet'],secondary:[],goals:['condition_physique','endurance']});

  /* Difficulté 1–5. Les libellés/niveaux sont dérivés par Exercise Model V4. */
  add('pompes-sur-les-genoux pompes-inclinees',{difficultyScore:1});
  add('pompes pompes-larges',{difficultyScore:2});
  add('pompes-serrees pompes-diamant pompes-declinees',{difficultyScore:3});
  add('pompes-archer pompes-explosives',{difficultyScore:4});
  add('pompes-claquees pseudo-planche-pompes',{difficultyScore:5});
  add('pike-push-up',{difficultyScore:3}); add('handstand-push-up',{difficultyScore:5});
  add('dips-sur-banc',{difficultyScore:2,equipment:['banc']}); add('dips-entre-deux-supports dips',{difficultyScore:3});

  add('developpe-couche developpe-couche-incline developpe-couche-decline',{equipment:['barre'],metric:'load_reps',difficultyScore:3});
  add('developpe-halteres developpe-incline-halteres',{equipment:['halteres'],metric:'load_reps',difficultyScore:2});
  add('ecartes-halteres',{equipment:['halteres'],metric:'load_reps',difficultyScore:2});
  add('ecartes-a-la-poulie pec-deck',{equipment:['machine'],metric:'load_reps',difficultyScore:2});

  add('tractions-australiennes',{equipment:['barre'],difficultyScore:2,movement:'pull_h'});
  add('tractions tractions-pronation tractions-supination tractions-prise-neutre',{equipment:['barre'],difficultyScore:3});
  add('tractions-poitrine',{equipment:['barre'],difficultyScore:4}); add('tractions-explosives',{equipment:['barre'],difficultyScore:5});
  add('rowing-haltere rowing-unilateral',{equipment:['halteres'],metric:'load_reps',difficultyScore:2});
  add('rowing-barre',{equipment:['barre'],metric:'load_reps',difficultyScore:3});
  add('rowing-a-la-poulie tirage-horizontal tirage-vertical tirage-poitrine',{equipment:['machine'],metric:'load_reps',difficultyScore:2});
  add('pullover-haltere',{equipment:['halteres'],metric:'load_reps',difficultyScore:2,movement:'pull_h',primary:['dos','pectoraux'],secondary:['triceps']});

  add('souleve-de-terre souleve-de-terre-jambes-tendues souleve-de-terre-roumain',{equipment:['barre'],metric:'load_reps',difficultyScore:3});
  add('good-morning',{equipment:['barre'],metric:'load_reps',difficultyScore:3});
  add('souleve-de-terre',{primary:['fessiers','ischio-jambiers','dos'],secondary:['quadriceps','avant-bras']});

  add('curl-biceps curl-marteau curl-incline curl-concentration',{equipment:['halteres'],metric:'load_reps',difficultyScore:1});
  add('curl-barre',{equipment:['barre'],metric:'load_reps',difficultyScore:2}); add('curl-poulie',{equipment:['machine'],metric:'load_reps',difficultyScore:1});
  add('extension-triceps extension-triceps-au-dessus-de-la-tete kickback-triceps',{equipment:['halteres'],metric:'load_reps',difficultyScore:1});
  add('barre-au-front',{equipment:['barre'],metric:'load_reps',difficultyScore:2});

  add('developpe-militaire',{equipment:['barre'],metric:'load_reps',difficultyScore:3});
  add('developpe-epaules-halteres arnold-press',{equipment:['halteres'],metric:'load_reps',difficultyScore:2,movement:'push_v'});
  add('elevations-laterales elevations-frontales oiseau-halteres',{equipment:['halteres'],metric:'load_reps',difficultyScore:1});
  add('face-pull',{equipment:['machine','elastiques'],metric:'load_reps',difficultyScore:1,primary:['arriere-epaules','haut-dos'],secondary:['biceps']});

  add('superman',{equipment:['none'],difficultyScore:2}); add('bird-dog',{equipment:['none'],difficultyScore:1});
  add('crunch crunch-inverse dead-bug',{difficultyScore:1});
  add('sit-up bicycle-crunch releves-de-genoux flutter-kicks russian-twist',{difficultyScore:2});
  add('v-up releves-de-jambes',{difficultyScore:3}); add('dragon-flag',{difficultyScore:5});
  add('planche',{metric:'time',difficultyScore:1}); add('planche-laterale hollow-body-hold wall-sit',{metric:'time',difficultyScore:2}); add('planche-dynamique',{metric:'time',difficultyScore:3});
  add('dead-bug',{metric:'reps'});
  add('wall-sit',{movement:'squat',primary:['quadriceps'],secondary:['fessiers'],bodyArea:['jambes','fessiers']});

  add('squat',{difficultyScore:1}); add('squat-sumo',{difficultyScore:2}); add('squat-saute',{difficultyScore:3,goals:['condition_physique','endurance','perte_poids']});
  add('squat-bulgare',{difficultyScore:3}); add('squat-gobelet',{equipment:['halteres','kettlebell'],metric:'load_reps',difficultyScore:2});
  add('front-squat back-squat',{equipment:['barre'],metric:'load_reps',difficultyScore:4});
  add('fentes fentes-avant fentes-arriere',{difficultyScore:2}); add('fentes-marchees fentes-laterales',{difficultyScore:3});
  add('step-up',{difficultyScore:2,equipment:['none','halteres'],movement:'lunge'});
  add('leg-extension',{equipment:['machine'],metric:'load_reps',difficultyScore:1});
  add('hip-thrust',{equipment:['none','barre'],metric:'reps',difficultyScore:2}); add('glute-bridge',{difficultyScore:1}); add('glute-bridge-une-jambe',{difficultyScore:2});
  add('donkey-kicks fire-hydrants kickback-fessier',{difficultyScore:1});
  add('leg-curl',{equipment:['machine'],metric:'load_reps',difficultyScore:1,movement:'knee_flexion'}); add('nordic-curl',{equipment:['none'],metric:'reps',difficultyScore:4,movement:'knee_flexion'});
  add('kettlebell-swing',{equipment:['kettlebell'],metric:'load_reps',difficultyScore:3});

  add('burpees',{difficultyScore:3,metric:'reps'}); add('burpees-avec-saut',{difficultyScore:4,metric:'reps'});
  add('thrusters',{equipment:['halteres','barre'],metric:'load_reps',difficultyScore:3,movement:'push_v'});
  add('clean-press',{equipment:['halteres','barre','kettlebell'],metric:'load_reps',difficultyScore:4,movement:'push_v'});
  add('turkish-get-up',{equipment:['kettlebell','halteres'],metric:'load_reps',difficultyScore:4,movement:'core',role:'skill'});
  add('farmer-walk',{equipment:['halteres','kettlebell'],metric:'distance',difficultyScore:2,movement:'loco'});
  add('man-makers',{equipment:['halteres'],metric:'load_reps',difficultyScore:5,movement:'loco'});
  add('bear-crawl crab-walk',{metric:'time',difficultyScore:2});
  add('jumping-jacks high-knees butt-kicks skaters plank-jacks shadow-boxing',{metric:'time',difficultyScore:1});
  add('mountain-climbers',{metric:'time',difficultyScore:2}); add('tuck-jumps',{metric:'reps',difficultyScore:4});

  add('handstand-hold',{metric:'time',difficultyScore:4}); add('handstand',{metric:'time',difficultyScore:5});
  add('tuck-l-sit',{metric:'time',difficultyScore:3}); add('l-sit',{metric:'time',difficultyScore:4});
  add('tuck-front-lever',{metric:'time',difficultyScore:4}); add('front-lever back-lever',{metric:'time',difficultyScore:5});
  add('tuck-planche',{metric:'time',difficultyScore:4}); add('planche-2',{metric:'time',difficultyScore:5});
  add('pistol-squat',{metric:'reps',difficultyScore:4}); add('shrimp-squat',{metric:'reps',difficultyScore:4});
  add('muscle-up',{metric:'reps',equipment:['barre'],difficultyScore:5,movement:'pull_v'}); add('human-flag',{metric:'time',equipment:['barre'],difficultyScore:5,movement:'core'});

  /* Mobilité : la durée est la métrique commune et ces entrées ne doivent pas
     hériter du vague objectif « condition physique » uniquement. */
  add('etirement-quadriceps etirement-ischio-jambiers etirement-mollets etirement-pectoraux etirement-epaules etirement-dos rotation-thoracique cat-cow child-s-pose cobra 90-90-hanches world-s-greatest-stretch mobilite-chevilles mobilite-hanches mobilite-epaules',{metric:'time',equipment:['none'],difficultyScore:1,goals:['mobilite','condition_physique']});
  add('etirement-quadriceps',{bodyArea:['jambes'],primary:['quadriceps']}); add('etirement-ischio-jambiers',{bodyArea:['jambes'],primary:['ischio-jambiers']});
  add('etirement-mollets',{bodyArea:['jambes'],primary:['mollets']}); add('etirement-pectoraux',{bodyArea:['pectoraux','epaules'],primary:['pectoraux']});
  add('etirement-epaules mobilite-epaules',{bodyArea:['epaules'],primary:['epaules']}); add('etirement-dos rotation-thoracique cat-cow child-s-pose cobra',{bodyArea:['dos','tronc'],primary:['dos']});
  add('90-90-hanches world-s-greatest-stretch mobilite-hanches',{bodyArea:['jambes','fessiers'],primary:['hanches']}); add('mobilite-chevilles',{bodyArea:['jambes'],primary:['chevilles']});

  /* Activités : métrique principale, difficulté indicative et objectifs. */
  add('activity-course activity-jogging activity-marche activity-marche-rapide activity-randonnee activity-velo activity-rameur activity-roller activity-patinage activity-natation',{metric:'distance'});
  add('activity-sprint',{metric:'distance',difficultyScore:4});
  add('activity-marche',{difficultyScore:1}); add('activity-marche-rapide activity-jogging',{difficultyScore:2}); add('activity-course activity-randonnee activity-velo activity-rameur activity-roller activity-patinage activity-natation',{difficultyScore:3});
  add('activity-velo-d-appartement activity-velo-elliptique activity-corde-a-sauter activity-montees-d-escaliers activity-step activity-escalade activity-boxe activity-danse activity-football activity-basketball activity-tennis activity-badminton activity-volleyball',{metric:'time'});
  add('activity-yoga activity-pilates',{metric:'time',movement:'mobility',role:'activity',difficultyScore:2,goals:['mobilite','condition_physique']});
  add('activity-corde-a-sauter',{difficultyScore:3,goals:['endurance','perte_poids','condition_physique']});
  add('activity-football activity-basketball activity-tennis activity-badminton activity-volleyball activity-boxe activity-escalade',{difficultyScore:3,goals:['condition_physique','endurance']});
  add('activity-danse',{difficultyScore:2,goals:['condition_physique','endurance']});

  window.VITATRACK_EXERCISE_QUALITY_V4=Q;
})();

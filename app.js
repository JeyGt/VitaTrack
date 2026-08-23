/* VitaTrack Core V2 */
const STORAGE_KEY='vitatrack_state_v2';
let DATA=loadState();
const TODAY=todayStr();

function todayStr(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dateOffset(days){const d=new Date(); d.setDate(d.getDate()+days); return todayStr(d);}
function loadState(){try{const raw=localStorage.getItem(STORAGE_KEY); if(raw)return migrate(JSON.parse(raw));}catch(e){} return defaultData();}
function normaliseDrinkLog(log){
  if(Array.isArray(log))return log.map(x=>({...x,kcal:Number(x.kcal||0)}));
  if(!log||typeof log!=='object')return[];
  return Object.entries(log).flatMap(([date,items])=>(Array.isArray(items)?items:[]).map(x=>({
    date,
    name:x.name||'Boisson',
    portion:x.portion||(x.qty?`${x.qty} portion${x.qty>1?'s':''}`:'1 portion'),
    kcal:Number(x.kcal??(Number(x.qty||1)*Number(x.kcalEach||0)))||0
  })));
}
function migrate(d){const def=defaultData(); const p=Object.assign({},def.profile,d.profile||{}); const oldGoal=p.goal;
  const objective=Object.assign({},def.objective,d.objective||{});
  if(!d.objective){if(oldGoal==='lose')objective.type='fat_loss'; else if(oldGoal==='gain')objective.type='muscle_gain'; else if(oldGoal==='maintain')objective.type='maintain';}
  p.visceralFat=p.visceralFat??null; return Object.assign({},def,d,{profile:p,objective,nutrition:Object.assign({},def.nutrition,d.nutrition||{}),waterLog:d.waterLog||{},drinkLog:normaliseDrinkLog(d.drinkLog),stepsLog:d.stepsLog||{},settings:Object.assign({},def.settings,d.settings||{}),foodLog:d.foodLog||{},weights:d.weights||[],customFoods:d.customFoods||[],coachDecisions:d.coachDecisions||[],reports:d.reports||{}});
}
function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(DATA));}
function toast(msg){const el=document.getElementById('toast'); if(!el)return; el.textContent=msg; el.classList.add('show'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.remove('show'),2200);}


/* ---------- Navigation ---------- */
function go(screen){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));const el=document.getElementById('screen-'+screen);if(!el)return;el.classList.add('active');document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.screen===screen));const fab=document.getElementById('globalFab');fab.style.display='flex';fab.onclick=openAddMenu;window.scrollTo(0,0);renderAll();}
function openAddMenu(){openSheet('addMenuOverlay');}
function openAddMeal(){closeSheet('addMenuOverlay');openFoodSheet();}
function openWeighing(){closeSheet('addMenuOverlay');go('food');setTimeout(()=>document.getElementById('newWeight')?.focus(),100);}
function openTraining(){closeSheet('addMenuOverlay');go('sport');}
function setSubtab(group,name){const c=document.getElementById('screen-'+group);c.querySelectorAll('.subtab').forEach(t=>t.classList.toggle('active',t.dataset.sub===name));c.querySelectorAll('.sub').forEach(s=>s.style.display=s.dataset.sub===name?'block':'none');if(name==='poids')renderWeightChart();if(name==='rapport')renderWeeklyReport();}
function scrollNutritionTo(id){go('food');setTimeout(()=>{const el=document.getElementById(id);if(!el)return;const details=el.closest('details');if(details)details.open=true;el.scrollIntoView({behavior:'smooth',block:'start'});},30);}
function openProfileSheet(){renderProfile();openSheet('profileSheetOverlay');setTimeout(refreshProfileWithingsUI,0);}
function openWeightSheet(){go('food');setTimeout(()=>document.getElementById('newWeight')?.focus(),80);}

/* ---------- Profile ---------- */
function renderProfile(){
  ensureProfileSettings();
  const p=DATA.profile,t=currentTargets(),goal=goalLabel(DATA.objective.type||'fat_loss');
  setText('profileCalorieTarget',t.calories?t.calories+' kcal/j':'À calculer');
  setText('profileProteinTarget',t.protein?t.protein+' g/j':'À calculer');
  setVal('pf_name',p.name||'');setVal('pf_age',p.age||'');setVal('pf_sex',p.sex||'homme');setVal('pf_height',p.height||'');setVal('pf_weight',p.weightCurrent||'');setVal('pf_goal',DATA.objective.type||'fat_loss');setVal('pf_activity',p.activity||'moderate');setVal('pf_target',DATA.objective.targetWeight||'');setVal('pf_bodyfat_target',DATA.objective.targetBodyFat||'');setVal('pf_waist_target',DATA.objective.targetWaist||'');setVal('pf_steps_goal',DATA.settings?.stepsGoal||'');
  setText('profileDisplayName',p.name?`Profil de ${p.name}`:'Mon profil');setText('profileDisplayGoal',goal);
  const initials=(p.name||'VT').trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'VT';setText('profileAvatar',initials);
  const summary=[p.age?`${p.age} ans`:null,p.height?`${p.height} cm`:null,p.weightCurrent?`${p.weightCurrent} kg`:null].filter(Boolean).join(' · ')||'Âge, taille, poids';setText('profileSummary',summary);
  let goalSummary=goal;if(DATA.objective.targetWeight)goalSummary+=` · cible ${DATA.objective.targetWeight} kg`;setText('profileGoalSummary',goalSummary);
  const n=DATA.settings.notifications;
  ['enabled','water','meals','sport','weight'].forEach(k=>{const e=document.getElementById('notif_'+k);if(e)e.checked=!!n[k]});
  const wt=n.waterTimes||[], mt=n.mealTimes||[];
  ['t1','t2','t3'].forEach((k,i)=>{const e=document.getElementById('notif_water_'+k);if(e)e.value=wt[i]||'';});
  ['t1','t2','t3'].forEach((k,i)=>{const e=document.getElementById('notif_meals_'+k);if(e)e.value=mt[i]||'';});
  setVal('notif_sport_time',n.sportTime||'18:00');setVal('notif_weight_time',n.weightTime||'08:00');
  ['mon','tue','wed','thu','fri','sat','sun'].forEach(day=>{
    const se=document.getElementById('notif_sport_'+day);if(se)se.checked=(n.sportDays||[]).includes(day);
    const we=document.getElementById('notif_weight_'+day);if(we)we.checked=(n.weightDays||[]).includes(day);
  });
  ['water','meals','sport','weight'].forEach(k=>document.getElementById('notif'+k.charAt(0).toUpperCase()+k.slice(1)+'Block')?.classList.toggle('active',!!n[k]));
  const activeCount=['water','meals','sport','weight'].filter(k=>n[k]).length;
  setText('notificationSummary',n.enabled?(activeCount?`${activeCount} rappel${activeCount>1?'s':''} configuré${activeCount>1?'s':''}`:'Rappels activés'):'Rappels désactivés');
  const pref=DATA.settings.theme||'light';setText('themeSummary',pref==='dark'?'Sombre':pref==='system'?'Selon le système':'Clair');document.querySelectorAll('[data-theme-choice]').forEach(b=>b.classList.toggle('active',b.dataset.themeChoice===pref));
}
function saveProfile(){const p=DATA.profile;p.name=document.getElementById('pf_name').value.trim();p.age=+document.getElementById('pf_age').value||0;p.sex=document.getElementById('pf_sex').value;p.height=+document.getElementById('pf_height').value||0;const w=+document.getElementById('pf_weight').value||0;if(w&&!p.startingWeight)p.startingWeight=w;p.weightCurrent=w;saveState();ensureTargets();saveState();toast('Profil enregistré');renderAll();}
function saveGoals(){DATA.objective.type=document.getElementById('pf_goal').value;DATA.profile.activity=document.getElementById('pf_activity').value;const tw=+document.getElementById('pf_target').value;DATA.objective.targetWeight=tw>0?tw:null;const bf=+document.getElementById('pf_bodyfat_target').value;DATA.objective.targetBodyFat=bf>0?bf:null;const wa=+document.getElementById('pf_waist_target').value;DATA.objective.targetWaist=wa>0?wa:null;const stepsRaw=String(document.getElementById('pf_steps_goal')?.value||'').trim();const stepGoalValue=Math.round(Number(stepsRaw));if(stepsRaw&&(!Number.isFinite(stepGoalValue)||stepGoalValue<1000||stepGoalValue>50000)){toast('Choisis un objectif entre 1 000 et 50 000 pas');return;}DATA.settings=DATA.settings||{};if(stepsRaw)DATA.settings.stepsGoal=stepGoalValue;else delete DATA.settings.stepsGoal;DATA.nutrition.manualCalories=false;DATA.nutrition.manualProtein=false;ensureTargets();saveState();toast('Objectif mis à jour');renderAll();}
function goalLabel(g){return{fat_loss:'Perte de gras',recomposition:'Recomposition',muscle_gain:'Prise de muscle',maintain:'Maintien',weight_target:'Atteindre un poids'}[g]||'—';}
function ensureProfileSettings(){
  DATA.settings=DATA.settings||{};
  if(!['light','dark','system'].includes(DATA.settings.theme))DATA.settings.theme='light';
  DATA.settings.notifications=Object.assign({
    enabled:false,water:true,meals:false,sport:true,weight:false,
    waterTimes:['10:00','14:00','18:00'],
    mealTimes:['08:00','12:30','19:30'],
    sportTime:'18:00',
    sportDays:['mon','wed','fri'],
    weightTime:'08:00',
    weightDays:['mon']
  },DATA.settings.notifications||{});
  if(!Array.isArray(DATA.settings.notifications.waterTimes))DATA.settings.notifications.waterTimes=['10:00','14:00','18:00'];
  if(!Array.isArray(DATA.settings.notifications.mealTimes))DATA.settings.notifications.mealTimes=['08:00','12:30','19:30'];
  if(!Array.isArray(DATA.settings.notifications.sportDays))DATA.settings.notifications.sportDays=['mon','wed','fri'];
  if(!Array.isArray(DATA.settings.notifications.weightDays))DATA.settings.notifications.weightDays=['mon'];
}
function resolvedTheme(){ensureProfileSettings();return DATA.settings.theme==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):DATA.settings.theme;}
function applyTheme(){document.body.dataset.theme=resolvedTheme();}
function setThemePreference(theme){ensureProfileSettings();if(!['light','dark','system'].includes(theme))return;DATA.settings.theme=theme;applyTheme();saveState();renderProfile();toast(theme==='dark'?'Thème sombre activé':theme==='system'?'Thème synchronisé au système':'Thème clair activé');}
function toggleTheme(){setThemePreference(resolvedTheme()==='dark'?'light':'dark');}
function saveNotificationSettings(){
  ensureProfileSettings();
  const n=DATA.settings.notifications;
  ['enabled','water','meals','sport','weight'].forEach(k=>{const e=document.getElementById('notif_'+k);if(e)n[k]=e.checked});
  n.waterTimes=['t1','t2','t3'].map(k=>document.getElementById('notif_water_'+k)?.value||'');
  n.mealTimes=['t1','t2','t3'].map(k=>document.getElementById('notif_meals_'+k)?.value||'');
  n.sportTime=document.getElementById('notif_sport_time')?.value||'18:00';
  n.weightTime=document.getElementById('notif_weight_time')?.value||'08:00';
  n.sportDays=['mon','tue','wed','thu','fri','sat','sun'].filter(day=>document.getElementById('notif_sport_'+day)?.checked);
  n.weightDays=['mon','tue','wed','thu','fri','sat','sun'].filter(day=>document.getElementById('notif_weight_'+day)?.checked);
  saveState();
  renderProfile();
}
function toggleProfilePanel(id){const el=document.getElementById(id);if(el)el.classList.toggle('open');}


/* ---------- Setup ---------- */
function needsSetup(){const p=DATA.profile;return !(p.age&&p.height&&p.weightCurrent);}
function openSetup(){openSheet('setupSheetOverlay');}
function saveSetup(){const p=DATA.profile;p.name=document.getElementById('setup_name').value.trim();p.age=+document.getElementById('setup_age').value;p.sex=document.getElementById('setup_sex').value;p.height=+document.getElementById('setup_height').value;p.weightCurrent=+document.getElementById('setup_weight').value;if(!p.startingWeight)p.startingWeight=p.weightCurrent;DATA.objective.type=document.getElementById('setup_goal').value;p.activity=document.getElementById('setup_activity').value;const tw=+document.getElementById('setup_target').value;DATA.objective.targetWeight=tw>0?tw:null;ensureTargets();saveState();closeSheet('setupSheetOverlay');toast('Ton point de départ est prêt');renderAll();}

/* ---------- Misc ---------- */
function setVal(id,v){const e=document.getElementById(id);if(e)e.value=v;}
function emptyState(icon,text){return`<div class="empty-state"><div style="font-size:30px">${icon}</div><p>${text}</p></div>`;}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function openSheet(id){document.getElementById(id).classList.add('open');}
function closeSheet(id){document.getElementById(id).classList.remove('open');}
function closeSheetIfBg(ev,id){if(ev.target.id===id)closeSheet(id);}
function exportData(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(DATA,null,2)],{type:'application/json'}));a.download='vitatrack_'+TODAY+'.json';a.click();toast('Export terminé');}
function importData(ev){const f=ev.target.files[0];if(!f)return;const r=new FileReader();r.onload=e=>{try{DATA=migrate(JSON.parse(e.target.result));saveState();applyTheme();renderAll();toast('Données importées');}catch(x){toast('Fichier invalide');}};r.readAsText(f);}
function resetToday(){if(!confirm('Réinitialiser les repas et données du jour ?'))return;delete DATA.foodLog[TODAY];if(DATA.waterLog)delete DATA.waterLog[TODAY];saveState();renderAll();toast('Journée réinitialisée');}
function ensureSportV3Data(){DATA.sport=DATA.sport||{};DATA.sport.favoriteExercises=DATA.sport.favoriteExercises||[];DATA.sport.progressPhotos=DATA.sport.progressPhotos||[];}
function renderAll(){ensureSportV3Data();ensureTargets();renderHome();renderFood();renderGuide();renderWeightList();renderProfile();renderWeightChart();renderNutritionCoach();renderSport();}
/* ========== SPORT MODULE ========== */
let SPORT_VIEW='today',SPORT_EXPLORE='home',SPORT_FILTER='all',SPORT_PROFILE_RANGE=7;
function sportStreak(){const done=new Set((DATA.sport.sessionHistory||[]).map(s=>s.completedDate||s.date).filter(Boolean));let d=new Date(),n=0;while(done.has(d.toISOString().slice(0,10))){n++;d.setDate(d.getDate()-1)}return n}
function sportTodaySession(){const ss=DATA.sport.currentProgram?.sessions||[],dow=['dim','lun','mar','mer','jeu','ven','sam'][new Date().getDay()];return ss.find(s=>s.dayOfWeek===dow&&s.status!=='completed')||ss.find(s=>s.status==='pending')||ss[0]}
function sportSessionScore(s){if(!s?.exercises?.length)return 0;let t=0,n=0;s.exercises.forEach(e=>{if(e.repsCompleted?.length){const p=(e.plannedReps||[]).reduce((a,b)=>a+b,0),a=e.repsCompleted.reduce((x,y)=>x+y,0),c=Math.min(1,a/Math.max(1,p)),d=1-Math.min(.35,Math.abs((e.difficulty||5)-5)*.07);t+=(c*.8+d*.2)*100;n++}});return n?Math.round(t/n):0}
function sportKcalForSession(s){return typeof window.sportKcalForActivity==='function' ? window.sportKcalForActivity(s) : Math.round(Number(s?.targetDuration||0)*7)}
function sportMuscles(s){const set=new Set();(s?.exercises||[]).forEach(e=>{const x=EXERCISES.find(y=>y.id===e.exerciseId);(x?.muscles||[]).forEach(m=>set.add(m))});return [...set].slice(0,4).join(' · ')||'Corps entier'}
function setSportView(v){SPORT_VIEW=v;renderSport()}
function renderSport(){
  const p=DATA.sport.profile||{};
  if(!p.level||!p.sessionsPerWeek){
    document.getElementById('sportContent').innerHTML='<div class="card coming-card"><div class="big">🏋️</div><h2>Ton espace Sport</h2><p class="muted">Configure ton niveau, tes objectifs et ton rythme pour créer ton premier programme.</p><button class="btn btn-primary btn-block" onclick="openSportOnboarding()">Créer mon programme</button></div>';
    return;
  }
  document.getElementById('sportContent').innerHTML=`<div class="sport-shell">
    <div class="sport-top"><div></div>
      <div class="sport-top-actions"><button class="sport-icon-btn" onclick="openSportPanel('calendar')">📅</button><button class="sport-icon-btn" onclick="openSportPanel('profile')">👤</button></div>
    </div>
    <div id="sportV3Body"></div>
  </div>`;
  renderSportTodayV3();
}
function renderSportTodayV3(){
  const b=document.getElementById('sportV3Body');
  const s=sportTodaySession();
  const c=DATA.sport.monthlyChallenge||{label:'Défi du jour',progress:0,target:1};
  const st=sportStreak();
  const done=new Set((DATA.sport.sessionHistory||[]).map(x=>x.completedDate||x.date).filter(Boolean));
  const today=TODAY;
  const days=['lun','mar','mer','jeu','ven','sam','dim'],labs=['L','M','M','J','V','S','D'];
  const now=new Date(),mon=new Date(now);
  mon.setDate(now.getDate()-(now.getDay()+6)%7);
  let week='';
  days.forEach((d,i)=>{
    const dt=new Date(mon);dt.setDate(mon.getDate()+i);
    const k=dt.toISOString().slice(0,10);
    week+=`<div class="sport-day ${done.has(k)?'done ':''}${k===today?'today':''}"><b>${labs[i]}</b><strong>${dt.getDate()}</strong><i></i></div>`;
  });
  const cp=Math.min(100,Math.round((c.progress||0)/Math.max(1,c.target)*100));

  b.innerHTML=`
    <div class="card sport-session-card" style="padding:16px">
      <div class="sport-section-head">
        <h3>Aujourd’hui</h3>
        <span class="sport-chip green">🔥 ${st} ${st>1?'jours':'jour'}</span>
      </div>

      <!-- PROGRAMME DU JOUR -->
      <div style="margin-top:14px">
        <div class="eyebrow">Mon programme du jour</div>
        ${s?`
          <div class="row">
            <div>
              <strong style="font-size:17px">${s.name}</strong>
              <small class="muted" style="display:block;margin-top:3px">${s.exercises?.length||0} exercices · ${s.targetDuration||0} min</small>
            </div>
            <div class="sport-score">${sportSessionScore(s)||'—'}</div>
          </div>
          <div class="sport-session-meta">
            <span class="sport-chip">💪 ${sportMuscles(s)}</span>
            <span class="sport-chip green">${pLevel()}</span>
          </div>
          <div class="sport-adjusts">
            <button class="sport-adjust" onclick="sportQuickAdjust('15 min max')">15 min max</button>
            <button class="sport-adjust" onclick="sportQuickAdjust('Pas de matériel')">Pas de matériel</button>
            <button class="sport-adjust" onclick="sportQuickAdjust('Plus facile')">Plus facile</button>
            <button class="sport-adjust" onclick="sportQuickAdjust('Gêne / blessure')">Gêne / blessure</button>
          </div>
          <button class="btn btn-primary btn-block" onclick="openSession('${s.id}')">▶ Démarrer la séance</button>
        `:`<p class="muted small">Pas de séance prévue aujourd’hui.</p>`}
      </div>

      <!-- DEFI DU JOUR : DANS LE MEME RECTANGLE -->
      <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--border)">
        <div class="eyebrow">Mon défi du jour</div>
        <div class="row">
          <div>
            <strong style="font-size:16px">${c.label||'Défi du jour'}</strong>
            <small class="muted" style="display:block;margin-top:3px">${c.progress||0}/${c.target||0} · ${cp}% du défi</small>
          </div>
          <strong>${cp}%</strong>
        </div>
        <div class="sport-progress" style="margin:10px 0 12px">
          <i style="width:${cp}%"></i>
        </div>
        <button class="btn btn-ghost btn-block" onclick="launchSportChallenge()">▶ Lancer le défi du jour</button>
      </div>
    </div>

    <div class="card">
      <div class="sport-section-head">
        <h3>Cette semaine</h3>
        <div style="display:flex;gap:8px"><button onclick="openSportHistory()">Historique</button><button onclick="openSportProgress()">Progression</button><button onclick="openSportPanel('calendar')">Calendrier</button></div>
      </div>
      <div class="sport-week" style="margin-top:10px">${week}</div>
    </div>

    <div class="explore-grid" style="margin-top:8px">
      <button class="explore-card explore-card-wide" onclick="setSportExplore('challenges')"><div class="ico">🏆</div><div><strong>Défis</strong><small>Défis du mois et challenges à relever.</small></div></button>
      <button class="explore-card explore-card-wide" onclick="setSportExplore('workouts')"><div class="ico">🏋️</div><div><strong>Entraînements</strong><small>Routines prêtes à l’emploi ou personnalisées.</small></div></button>
      <button class="explore-card explore-card-wide" onclick="setSportExplore('exercises')"><div class="ico">💪</div><div><strong>Exercices</strong><small>Bibliothèque, filtres et favoris.</small></div></button>
    </div>`;
}
function pLevel(){return 'Niveau '+(DATA.sport.profile.level||'')}
function sportQuickAdjust(x){toast('Adaptation demandée : '+x)}
function setSportExplore(v){
  if(v==='exercises' && window.openExerciseLibrary){ window.openExerciseLibrary(); return; }
  if(v==='workouts' && window.openWorkoutLibrary){ window.openWorkoutLibrary(); return; }
  SPORT_EXPLORE=v;SPORT_FILTER='all';renderSport();
}
function renderSportExploreV3(){const b=document.getElementById('sportV3Body');if(SPORT_EXPLORE==='home'){b.innerHTML='<div class="explore-grid"><button class="explore-card" onclick="setSportExplore(\'programs\')"><div class="ico">📋</div><strong>Programmes</strong><small>Parcours guidés et évolutifs.</small></button><button class="explore-card" onclick="setSportExplore(\'workouts\')"><div class="ico">🏋️</div><strong>Entraînements</strong><small>Routines prêtes à l’emploi ou personnalisées.</small></button><button class="explore-card" onclick="setSportExplore(\'exercises\')"><div class="ico">💪</div><strong>Exercices</strong><small>Bibliothèque, filtres et favoris.</small></button><button class="explore-card" onclick="setSportExplore(\'challenges\')"><div class="ico">🏆</div><strong>Défis</strong><small>Défis du mois et challenges.</small></button><button class="explore-card" onclick="setSportExplore(\'coach\')"><div class="ico">🤖</div><strong>Coach Sport</strong><small>Analyse tes séances et adapte tes prochains entraînements.</small></button></div>';return}const back='<button class="small-link" onclick="setSportExplore(\'home\')">← Explorer</button>';if(SPORT_EXPLORE==='programs'){b.innerHTML=`${back}<div class="card" style="margin-top:10px"><div class="eyebrow">Programmes</div><h2>Choisis ton parcours</h2><div class="filter-row">${['condition_physique','musculation','force','endurance','perte_poids'].map(g=>`<button class="filter-btn ${DATA.sport.objectives?.primary===g?'active':''}" onclick="selectSportGoal('${g}')">${GOALS.find(x=>x.id===g)?.label||g}</button>`).join('')}</div><div class="explore-card"><strong>Programme actuel</strong><small>${DATA.sport.currentProgram?.sessions?.length||0} séances · objectif ${DATA.sport.objectives?.primary||'condition physique'}</small><button class="btn btn-primary btn-block" style="margin-top:10px" onclick="openSportOnboarding()">Modifier mon programme</button></div></div>`;return}if(SPORT_EXPLORE==='workouts'){const ss=DATA.sport.currentProgram?.sessions||[];b.innerHTML=`${back}<div class="card" style="margin-top:10px"><div class="row"><div><div class="eyebrow">Entraînements</div><h2>Routines</h2></div><button class="btn btn-primary btn-sm" onclick="openTraining()">+ Créer</button></div><div class="filter-row"><button class="filter-btn active">Full Body</button><button class="filter-btn">Haut</button><button class="filter-btn">Bas</button></div>${ss.map(x=>`<div class="exercise-row"><div class="exercise-ico">🏋️</div><div class="exercise-main"><strong>${x.name}</strong><small>${x.targetDuration} min · ${x.exercises?.length||0} exercices</small></div><button class="btn btn-primary btn-sm" onclick="openSession('${x.id}')">▶</button></div>`).join('')}</div>`;return}if(SPORT_EXPLORE==='exercises'){const fs=[['all','Tous','🔎'],['cardio','Cardio','❤️'],['bras','Bras','💪'],['pectoraux','Pectoraux','🫀'],['dos','Dos','🦾'],['abdos','Abdos','🔥'],['cuisses','Cuisses','🦵']],f=DATA.sport.favoriteExercises||[],map={cardio:['loco'],bras:['biceps','triceps'],pectoraux:['pectoraux'],dos:['dos','trap'],abdos:['abdo','gainage'],cuisses:['quadr','jambe','fess']};const list=EXERCISES.filter(x=>SPORT_FILTER==='all'||(x.muscles||[]).concat(x.musclesSec||[]).some(m=>map[SPORT_FILTER]?.some(k=>m.toLowerCase().includes(k)))).slice(0,30);b.innerHTML=`${back}<div class="card" style="margin-top:10px"><div class="eyebrow">Répertoire des exercices</div><h2>Bibliothèque</h2><div class="filter-row">${fs.map(x=>`<button class="filter-btn ${SPORT_FILTER===x[0]?'active':''}" onclick="setSportFilter('${x[0]}')">${x[2]} ${x[1]}</button>`).join('')}</div>${list.map(x=>`<div class="exercise-row"><div class="exercise-ico">${MOVEMENTS[x.move]?.icon||'🏋️'}</div><div class="exercise-main"><strong>${x.name}</strong><small>${(x.muscles||[]).join(' · ')} · ${x.level}</small></div><button class="exercise-fav" onclick="toggleSportFavorite('${x.id}')">${f.includes(x.id)?'⭐':'☆'}</button><button class="btn btn-ghost btn-sm" onclick="openExerciseInfo('${x.id}')">Voir</button></div>`).join('')}</div>`;return}if(SPORT_EXPLORE==='challenges'){const c=DATA.sport.monthlyChallenge,p=c?Math.min(100,Math.round(c.progress/Math.max(1,c.target)*100)):0;b.innerHTML=`${back}<div class="card"><div class="eyebrow">Défis</div><h2>Défi du mois</h2>${c?`<strong>${c.label}</strong><p class="muted small">${c.progress}/${c.target} · ${p}%</p><div class="sport-progress"><i style="width:${p}%"></i></div><button class="btn btn-primary btn-block" style="margin-top:12px" onclick="launchSportChallenge()">Lancer le défi du jour</button>`:'<p class="muted">Configure ton programme pour créer un défi.</p>'}</div><div class="card"><h3>Catalogue</h3><p class="muted small">Défis de 7, 14 ou 21 jours : force, cardio, gainage, mobilité.</p></div>`;return}if(SPORT_EXPLORE==='coach'){b.innerHTML=`${back}<div class="card"><div class="eyebrow">Coach IA</div><h2>Ton coach s’adapte</h2><p class="muted">Objectif : <strong>${DATA.sport.objectives?.primary||'condition physique'}</strong></p><p class="muted small">Récupération : ${estimateRecovery().label}</p><button class="btn btn-primary btn-block" onclick="openSportOnboarding()">Modifier mes objectifs</button></div>`}}
function setSportFilter(v){SPORT_FILTER=v;renderSportExploreV3()}
function selectSportGoal(g){DATA.sport.objectives.primary=g;saveState();generateInitialProgram();DATA.sport.monthlyChallenge=generateMonthlyChallenge();renderSportExploreV3();toast('Programme adapté')}
function toggleSportFavorite(id){DATA.sport.favoriteExercises=DATA.sport.favoriteExercises||[];const i=DATA.sport.favoriteExercises.indexOf(id);if(i>=0)DATA.sport.favoriteExercises.splice(i,1);else DATA.sport.favoriteExercises.push(id);saveState();renderSportExploreV3()}
function openExerciseInfo(id){const x=EXERCISES.find(e=>e.id===id);if(x)alert(x.name+'\\n\\nMuscles : '+(x.muscles||[]).join(', ')+'\\nNiveau : '+x.level+'\\n\\n'+(x.instr||''))}
function launchSportChallenge(){toast('Défi du jour lancé')}
function openSportPanel(type){let p=document.getElementById('sportPanel');if(!p){p=document.createElement('div');p.id='sportPanel';p.className='sport-panel';document.body.appendChild(p)}p.classList.add('open');type==='calendar'?renderSportCalendarPanel(p):renderSportProfilePanel(p)}
function closeSportPanel(){document.getElementById('sportPanel')?.classList.remove('open')}
function renderSportCalendarPanel(p){const n=new Date(),y=n.getFullYear(),m=n.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0),off=(first.getDay()+6)%7,done=new Set((DATA.sport.sessionHistory||[]).map(s=>s.completedDate||s.date).filter(Boolean)),heads=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];let g=heads.map(x=>`<div class="cal-head">${x}</div>`).join('');for(let i=0;i<off;i++)g+='<div></div>';for(let d=1;d<=last.getDate();d++){const k=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');g+=`<button class="cal-day ${k===TODAY?'today ':''}${done.has(k)?'done':''}" onclick="showSportDay('${k}')">${d}${done.has(k)?'<span class="cal-dot"></span>':''}</button>`}p.innerHTML=`<div class="sport-panel-head"><h2>📅 Calendrier</h2><button class="sport-close" onclick="closeSportPanel()">×</button></div><div class="card"><div class="eyebrow">${first.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</div><div class="sport-calendar">${g}</div></div><div id="sportDayDetail" class="card" style="margin-top:12px"><p class="muted">Sélectionne une journée.</p></div>`}
function showSportDay(date){const h=(DATA.sport.sessionHistory||[]).filter(s=>(s.completedDate||s.date)===date),mins=h.reduce((a,s)=>a+Number(s.durationMinutes||s.targetDuration||0),0),k=h.reduce((a,s)=>a+sportKcalForSession(s),0),score=h.length?Math.round(h.reduce((a,s)=>a+(s.score||sportSessionScore(s)),0)/h.length):0;const e=document.getElementById('sportDayDetail');if(e)e.innerHTML=`<div class="eyebrow">${date}</div><h3>${h.length?'Activité réalisée':'Repos / aucune séance'}</h3><div class="sport-metrics"><div class="sport-metric"><strong>${h.length}</strong><small>séances</small></div><div class="sport-metric"><strong>${mins}</strong><small>minutes</small></div><div class="sport-metric"><strong>${k}</strong><small>kcal</small></div></div><p class="muted small">Score global : <strong>${score}%</strong></p>`}
function renderSportProfilePanel(p){
  const h=DATA.sport.sessionHistory||[],r=SPORT_PROFILE_RANGE;
  const cutoff=r===0?0:Date.now()-r*86400000;
  const f=r===0?h:h.filter(s=>new Date(s.completedDate||s.date||0).getTime()>=cutoff);
  const mins=f.reduce((a,s)=>a+Number(s.targetDuration||s.durationSeconds/60||0),0);
  const k=f.reduce((a,s)=>a+sportKcalForSession(s),0);
  const activeDays=new Set(f.map(s=>String(s.completedDate||s.date||'').slice(0,10)).filter(Boolean)).size;
  const previousCutoff=r===0?0:cutoff-r*86400000;
  const prev=r===0?[]:h.filter(s=>{const d=new Date(s.completedDate||s.date||0).getTime();return d>=previousCutoff&&d<cutoff});
  const prevMins=prev.reduce((a,s)=>a+Number(s.targetDuration||s.durationSeconds/60||0),0);
  const prevK=prev.reduce((a,s)=>a+sportKcalForSession(s),0);
  const trend=(a,b)=>b?`${a>=b?'↗️':'↘️'} ${Math.round(Math.abs(a-b))}`:'—';
  const ex={};
  f.forEach(s=>{if(s.type==='exercise'){const n=s.exerciseName||s.name||'Exercice';ex[n]=(ex[n]||0)+1;}else (s.exercises||[]).forEach(e=>{const n=e.exerciseName||e.name||'Exercice';ex[n]=(ex[n]||0)+1;});});
  const top=Object.entries(ex).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const z=['Pectoraux','Dos','Épaules','Bras','Abdos','Cuisses','Cardio'];
  p.innerHTML=`<div class="sport-panel-head"><h2>👤 Mon activité</h2><button class="sport-close" onclick="closeSportPanel()">×</button></div>
  <div class="filter-row"><button class="filter-btn ${r===7?'active':''}" onclick="SPORT_PROFILE_RANGE=7;renderSportProfilePanel(document.getElementById('sportPanel'))">7 jours</button><button class="filter-btn ${r===30?'active':''}" onclick="SPORT_PROFILE_RANGE=30;renderSportProfilePanel(document.getElementById('sportPanel'))">30 jours</button><button class="filter-btn ${r===0?'active':''}" onclick="SPORT_PROFILE_RANGE=0;renderSportProfilePanel(document.getElementById('sportPanel'))">Depuis toujours</button></div>
  <div class="card"><div class="sport-metrics"><div class="sport-metric"><strong>${f.length}</strong><small>activités</small></div><div class="sport-metric"><strong>${mins}</strong><small>minutes</small></div><div class="sport-metric"><strong>${k}</strong><small>kcal</small></div><div class="sport-metric"><strong>${activeDays}</strong><small>jours actifs</small></div></div></div>
  ${r!==0?`<div class="card"><div class="eyebrow">Par rapport à la période précédente</div><div class="row small"><span>Activités</span><strong>${trend(f.length,prev.length)}</strong></div><div class="row small" style="margin-top:6px"><span>Temps</span><strong>${trend(mins,prevMins)} min</strong></div><div class="row small" style="margin-top:6px"><span>Calories</span><strong>${trend(k,prevK)} kcal</strong></div></div>`:''}
  <div class="card"><div class="eyebrow">🏆 Exercices les plus réalisés</div>${top.length?top.map(([n,c])=>`<div class="row small" style="margin-top:7px"><span>${escapeHtml(n)}</span><strong>${c}×</strong></div>`).join(''):'<div class="muted small" style="margin-top:7px">Pas encore assez de séances pour afficher une tendance.</div>'}</div>
  <div class="card"><div class="eyebrow">Récupération</div><h3>${estimateRecovery().label}</h3><div class="body-map">${z.map((x,i)=>`<div class="body-zone ${i<2?'ready':i===2?'tired':''}">${i<2?'🟢':'🟠'} ${x}</div>`).join('')}</div></div>
  <div class="card"><div class="row"><div><div class="eyebrow">Photos de suivi</div><strong>Progression visuelle</strong></div><label class="btn btn-ghost btn-sm">+ Photo<input type="file" accept="image/*" onchange="addSportProgressPhoto(this)" hidden></label></div><div id="sportPhotos" class="photo-grid" style="margin-top:10px"></div></div>`;
  renderSportPhotos();
}
function renderSportPhotos(){const b=document.getElementById('sportPhotos');if(!b)return;const p=DATA.sport.progressPhotos||[];b.innerHTML=p.slice(-6).map(x=>`<div class="photo-slot"><img src="${x.data}" alt="Photo de suivi"></div>`).join('')||'<div class="photo-slot">📷</div><div class="photo-slot">📷</div><div class="photo-slot">📷</div>'}
function addSportProgressPhoto(input){const f=input.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{DATA.sport.progressPhotos=DATA.sport.progressPhotos||[];DATA.sport.progressPhotos.push({date:TODAY,data:r.result});saveState();renderSportPhotos();toast('Photo de suivi enregistrée')};r.readAsDataURL(f)}

function renderSportWeekly(){
  const program=DATA.sport.currentProgram;
  if(!program||!program.sessions) return;
  
  const box=document.getElementById('sportWeekly');
  const daysMap={lun:'Lun',mar:'Mar',mer:'Mer',jeu:'Jeu',ven:'Ven',sam:'Sam',dim:'Dim'};
  
  box.innerHTML=program.sessions.map(s=>{
    const statusIcon=s.status==='completed'?'✅':s.status==='in_progress'?'⏱️':'⭕';
    return `<div class="card session-card" onclick="${s.status!=='completed'?`openSession('${s.id}')`:''}"><div style="display:flex;justify-content:space-between;align-items:start"><div><strong>${s.name}</strong><small class="muted">${s.targetDuration} min</small></div><span style="font-size:18px">${statusIcon}</span></div></div>`;
  }).join('')||'<div class="card"><p class="muted">Aucune séance planifiée.</p></div>';
}

function renderSportProgress(){
  const progress=DATA.sport.exerciseProgress||{};
  const entries=Object.values(progress).slice(0,5);
  
  if(entries.length===0){
    document.getElementById('sportProgress').innerHTML='<div class="card"><p class="muted small">Complète quelques séances pour voir ta progression.</p></div>';
    return;
  }
  
  document.getElementById('sportProgress').innerHTML=`<div class="card"><div style="display:flex;flex-direction:column;gap:10px">${entries.map(e=>{
    const trending=e.trend==='progression'?'📈':e.trend==='regression'?'📉':'➡️';
    return `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong style="font-size:13px">${EXERCISES.find(ex=>ex.id===e.exerciseId)?.name||'Exercice'}</strong><small class="muted">×${e.bestReps}</small></div><span>${trending}</span></div>`;
  }).join('')}</div></div>`;
}

function renderSportChallenge(){
  const c=DATA.sport.monthlyChallenge;
  if(!c) return;
  
  const pct=Math.round(c.progress/c.target*100);
  document.getElementById('sportChallenge').innerHTML=`<div class="card"><div style="margin-bottom:12px"><strong>${c.label}</strong><small class="muted" style="display:block;margin-top:4px">${c.progress} / ${c.target}</small></div><div class="pbar" style="height:8px"><div style="background:var(--primary);width:${pct}%;height:100%"></div></div><small class="muted" style="display:block;margin-top:6px">${pct}%</small>${pct===100?'<div style="margin-top:8px;color:var(--primary);font-weight:700;font-size:13px">🎉 Défi réussi!</div>':''}</div>`;
}

function openSportOnboarding(){
  openSheet('sportOnboardingOverlay');
}

/* ===== Test de performance initial (calibrage du niveau) ===== */

let PERF_TEST_STATE = { step: 'intro', pompes: null, squats: null };

function openSportPerfTest(){
  PERF_TEST_STATE = { step: 'intro', pompes: null, squats: null };
  renderPerfTestStep();
  openSheet('sportPerfTestOverlay');
}

function renderPerfTestStep(){
  const b=document.getElementById('perfTestBody');
  if(!b) return;

  if(PERF_TEST_STATE.step==='intro'){
    b.innerHTML=`<div class="card" style="text-align:center;padding:20px">
      <div class="big" style="font-size:40px">💪</div>
      <p class="muted" style="margin-top:8px">Étape 1/2 : pompes (adapte-toi si besoin — sur les genoux, ça compte aussi).</p>
      <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="startPerfTestTimer('pompes')">Démarrer les 30 secondes</button>
      <button class="small-link" style="margin-top:10px" onclick="skipPerfTest()">Passer le test</button>
    </div>`;
    return;
  }
  if(PERF_TEST_STATE.step==='count_pompes'||PERF_TEST_STATE.step==='count_squats'){
    const label=PERF_TEST_STATE.step==='count_pompes'?'pompes':'squats';
    b.innerHTML=`<div class="card" style="text-align:center;padding:20px">
      <p class="muted">Combien de ${label} as-tu réalisées ?</p>
      <input type="number" id="perfTestReps" min="0" value="0" style="width:100%;text-align:center;font-size:28px;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--surface-alt);color:var(--ink);margin-top:10px">
      <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="submitPerfTestCount('${label}')">Valider</button>
    </div>`;
    return;
  }
  if(PERF_TEST_STATE.step==='between'){
    b.innerHTML=`<div class="card" style="text-align:center;padding:20px">
      <div class="big" style="font-size:40px">🦵</div>
      <p class="muted" style="margin-top:8px">Étape 2/2 : squats poids du corps, 30 secondes.</p>
      <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="startPerfTestTimer('squats')">Démarrer les 30 secondes</button>
      <button class="small-link" style="margin-top:10px" onclick="skipPerfTest()">Passer le test</button>
    </div>`;
    return;
  }
  if(PERF_TEST_STATE.step==='result'){
    const r=PERF_TEST_STATE.evalResult;
    const labels={debutant:'🌱 Débutant',intermediaire:'💪 Intermédiaire',avance:'🔥 Avancé'};
    b.innerHTML=`<div class="card" style="text-align:center;padding:20px">
      <div class="big" style="font-size:32px">${labels[r.level]}</div>
      <p class="muted small" style="margin-top:10px">${r.detail.pompes.reps} pompes · ${r.detail.squats.reps} squats en 30s</p>
      <p class="muted small" style="margin-top:6px">${r.detail.reason}</p>
      <button class="btn btn-primary btn-block" style="margin-top:14px" onclick="applyPerfTestResult()">Utiliser ce niveau</button>
    </div>`;
  }
}

let PERF_TEST_TIMER=null;
function startPerfTestTimer(which){
  const b=document.getElementById('perfTestBody');
  let remaining=30;
  b.innerHTML=`<div class="card" style="text-align:center;padding:24px">
    <div class="sport-score" style="width:90px;height:90px;font-size:28px;margin:0 auto" id="perfTestClock">${remaining}</div>
    <p class="muted" style="margin-top:12px">Fais un maximum de ${which==='pompes'?'pompes':'squats'} !</p>
  </div>`;
  clearInterval(PERF_TEST_TIMER);
  PERF_TEST_TIMER=setInterval(()=>{
    remaining--;
    const clock=document.getElementById('perfTestClock');
    if(clock) clock.textContent=remaining;
    if(remaining<=0){
      clearInterval(PERF_TEST_TIMER);
      PERF_TEST_STATE.step = which==='pompes' ? 'count_pompes' : 'count_squats';
      renderPerfTestStep();
    }
  },1000);
}

function submitPerfTestCount(which){
  const val=+(document.getElementById('perfTestReps')?.value||0);
  if(which==='pompes'){
    PERF_TEST_STATE.pompes=val;
    PERF_TEST_STATE.step='between';
  } else {
    PERF_TEST_STATE.squats=val;
    PERF_TEST_STATE.evalResult=evaluatePerformanceTest({pompes:PERF_TEST_STATE.pompes,squats:PERF_TEST_STATE.squats});
    PERF_TEST_STATE.step='result';
  }
  renderPerfTestStep();
}

function skipPerfTest(){
  clearInterval(PERF_TEST_TIMER);
  closeSheet('sportPerfTestOverlay');
}

function applyPerfTestResult(){
  const sel=document.getElementById('sport_level');
  if(sel) sel.value=PERF_TEST_STATE.evalResult.level;
  // Enregistre aussi le détail du test dès maintenant (sera confirmé par saveSportSetup)
  DATA.sport.performanceTest={date:new Date().toISOString().split('T')[0],results:{pompes:PERF_TEST_STATE.pompes,squats:PERF_TEST_STATE.squats},...PERF_TEST_STATE.evalResult};
  closeSheet('sportPerfTestOverlay');
  toast('Niveau mis à jour : '+PERF_TEST_STATE.evalResult.level);
}

function saveSportSetup(){
  const profile=DATA.sport.profile;
  const objectives=DATA.sport.objectives;
  
  profile.level=document.getElementById('sport_level').value;
  profile.sessionsPerWeek=+document.getElementById('sport_sessions').value;
  profile.sessionDuration=+document.getElementById('sport_duration').value;
  
  const equipment=[];
  document.querySelectorAll('[name="sport_equipment"]:checked').forEach(cb=>equipment.push(cb.value));
  profile.equipment=equipment;
  
  profile.preferredDays=[
    document.getElementById('sport_day_1').checked?'lun':'',
    document.getElementById('sport_day_2').checked?'mar':'',
    document.getElementById('sport_day_3').checked?'mer':'',
    document.getElementById('sport_day_4').checked?'jeu':'',
    document.getElementById('sport_day_5').checked?'ven':'',
    document.getElementById('sport_day_6').checked?'sam':'',
    document.getElementById('sport_day_7').checked?'dim':''
  ].filter(Boolean);
  
  objectives.primary=document.getElementById('sport_goal').value;
  
  generateInitialProgram();
  DATA.sport.monthlyChallenge=generateMonthlyChallenge();
  
  closeSheet('sportOnboardingOverlay');
  saveState();
  toast('Programme créé!');
  renderSport();
}

function closeSessionScreen(){
  const el=document.getElementById('sessionScreen');
  if(el) el.classList.remove('open');
  document.body.style.overflow='';
}

function backToSportFromSession(){
  clearInterval(SESSION_CLOCK_INTERVAL);
  closeSessionScreen();
  if(typeof go==='function') go('sport');
  if(typeof renderSport==='function') renderSport();
}
window.backToSportFromSession=backToSportFromSession;

function openSession(sessionId){
  const program=DATA.sport.currentProgram;
  const session=program?.sessions?.find(s=>s.id===sessionId);
  if(!session) return;

  session.status='in_progress';
  if(!session.startTime) session.startTime=new Date().toISOString();
  saveState();

  const recovery=estimateRecovery();
  let screen=document.getElementById('sessionScreen');
  if(!screen){
    screen=document.createElement('div');
    screen.id='sessionScreen';
    screen.className='challenge-screen';
    document.body.appendChild(screen);
  }

  screen.innerHTML =
    '<div class="challenge-header">' +
      '<button class="challenge-back" type="button" onclick="backToSportFromSession()" aria-label="Retour au sport">←</button>' +
      '<h2>Programme</h2><div></div>' +
    '</div>' +
    '<div class="challenge-content">' +
      '<div class="card">' +
        '<div class="eyebrow">Séance du jour</div>' +
        '<h2 style="margin-top:4px">' + session.name + '</h2>' +
        '<div class="row" style="align-items:center;margin-top:8px"><p class="muted" style="margin:0">' + recovery.label + '</p><strong id="sessionElapsed" class="sport-chip green">0:00</strong></div>' +
      '</div>' +
      '<div class="card" style="margin-top:12px">' +
        '<div class="eyebrow">Exercices</div>' +
        '<div style="margin:12px 0 0;display:flex;flex-direction:column;gap:8px">' +
        session.exercises.map((ex,i) =>
          '<div class="exercise-item" data-exercise-idx="' + i + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:start;gap:10px">' +
              '<div><strong>' + ex.exerciseName + '</strong><small class="muted">' + ex.plannedSets + ' × ' + ex.plannedReps.join(' / ') + '</small></div>' +
              '<button class="btn btn-sm btn-ghost" onclick="toggleExerciseDetail(' + i + ')">+</button>' +
            '</div>' +
            '<div class="exercise-detail" id="ex_detail_' + i + '" style="display:none;margin-top:8px;padding:12px;background:var(--surface-alt);border-radius:12px">' +
              '<div class="row" style="margin-bottom:10px"><small class="muted">Repos conseillé : ' + (ex.plannedRestSeconds||60) + 's</small><button class="btn btn-ghost btn-sm" onclick="startRestTimer(' + i + ',' + (ex.plannedRestSeconds||60) + ')">⏱ Lancer le repos</button></div>' +
              '<div id="restTimer_' + i + '"></div>' +
              '<div class="field"><label>Répétitions réalisées</label><input type="text" id="ex_reps_' + i + '" placeholder="15, 14, 13"></div>' +
              '<div class="field"><label>Difficulté (1-10)</label><input type="number" id="ex_diff_' + i + '" min="1" max="10" value="5"></div>' +
              '<div class="field"><label>Retour</label><select id="ex_fb_' + i + '"><option value="">Choisir</option><option value="too_easy">Trop facile</option><option value="adapted">Adapté</option><option value="too_difficult">Trop difficile</option></select></div>' +
              '<button class="btn btn-primary btn-block btn-sm" onclick="recordExerciseFeedback(' + i + ',\'' + sessionId + '\')">Enregistrer</button>' +
            '</div>' +
          '</div>'
        ).join('') +
        '</div>' +
      '</div>' +
      '<button class="challenge-primary" style="margin-top:16px" onclick="finishSession(\'' + sessionId + '\')">Terminer la séance</button>' +
    '</div>';

  screen.classList.add('open');
  document.body.style.overflow='hidden';
  startSessionClock(session.startTime);
}

/* ===== Chrono global de la séance (temps écoulé depuis le démarrage) ===== */

let SESSION_CLOCK_INTERVAL=null;
function startSessionClock(startTimeIso){
  clearInterval(SESSION_CLOCK_INTERVAL);
  const start=new Date(startTimeIso).getTime();
  const render=()=>{
    const el=document.getElementById('sessionElapsed');
    if(!el){ clearInterval(SESSION_CLOCK_INTERVAL); return; }
    const elapsedSec=Math.max(0,Math.floor((Date.now()-start)/1000));
    const m=Math.floor(elapsedSec/60), s=elapsedSec%60;
    el.textContent=m+':'+String(s).padStart(2,'0');
  };
  render();
  SESSION_CLOCK_INTERVAL=setInterval(render,1000);
}

function stopSessionClock(){
  clearInterval(SESSION_CLOCK_INTERVAL);
}

/* ===== Minuteur de repos entre séries ===== */

const REST_TIMERS = {}; // idx -> intervalId, pour pouvoir arrêter/relancer sans conflit

function beepSound(){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value=880; gain.gain.value=0.15;
    osc.start(); osc.stop(ctx.currentTime+0.25);
  }catch(e){/* pas grave si l'audio n'est pas dispo */}
}

function startRestTimer(idx, seconds){
  const box=document.getElementById('restTimer_'+idx);
  if(!box) return;
  clearInterval(REST_TIMERS[idx]);
  let remaining=seconds;
  const render=()=>{
    const pct=Math.round((1-remaining/seconds)*100);
    box.innerHTML='<div class="row" style="align-items:center;gap:10px"><div class="sport-score" style="width:56px;height:56px;font-size:18px">'+remaining+'</div><div style="flex:1"><div class="sport-progress"><i style="width:'+pct+'%"></i></div><small class="muted" style="display:block;margin-top:4px">Repos en cours…</small></div><button class="btn btn-ghost btn-sm" onclick="stopRestTimer('+idx+')">Passer</button></div>';
  };
  render();
  REST_TIMERS[idx]=setInterval(()=>{
    remaining--;
    if(remaining<=0){
      clearInterval(REST_TIMERS[idx]);
      delete REST_TIMERS[idx];
      beepSound();
      box.innerHTML='<div class="row" style="align-items:center;gap:10px"><strong style="color:var(--primary)">✅ Repos terminé, c\'est reparti !</strong></div>';
      return;
    }
    render();
  },1000);
}

function stopRestTimer(idx){
  clearInterval(REST_TIMERS[idx]);
  delete REST_TIMERS[idx];
  const box=document.getElementById('restTimer_'+idx);
  if(box) box.innerHTML='';
}

function toggleExerciseDetail(idx){
  const detail=document.getElementById(`ex_detail_${idx}`);
  if(detail) detail.style.display=detail.style.display==='none'?'block':'none';
}

function recordExerciseFeedback(exerciseIdx,sessionId){
  const program=DATA.sport.currentProgram;
  const session=program?.sessions?.find(s=>s.id===sessionId);
  if(!session||!session.exercises[exerciseIdx]) return;
  
  const ex=session.exercises[exerciseIdx];
  const repsStr=document.getElementById(`ex_reps_${exerciseIdx}`).value;
  const difficulty=+document.getElementById(`ex_diff_${exerciseIdx}`).value;
  const feedback=document.getElementById(`ex_fb_${exerciseIdx}`).value;
  
  // Parser les reps (ex: "15, 14, 13")
  const repsArray=repsStr.split(',').map(r=>+r.trim()).filter(r=>!isNaN(r));
  ex.repsCompleted=repsArray;
  ex.difficulty=difficulty;
  ex.feedback=feedback;
  
  trackProgress(ex.exerciseId,repsArray[0]||0,difficulty);
  updateChallengeProgress(ex.exerciseId,repsArray.reduce((a,b)=>a+b,0));
  
  saveState();
  toast('Exercice enregistré');
}

function finishSession(sessionId){
  const program=DATA.sport.currentProgram;
  const session=program?.sessions?.find(s=>s.id===sessionId);
  if(!session) return;
  
  stopSessionClock();
  Object.keys(REST_TIMERS).forEach(idx=>stopRestTimer(idx));
  
  // Calculer le score avant l'archivage afin que l'historique, le coach et les stats
  // lisent exactement la même valeur.
  session.score=sportSessionScore(session)||0;
  const decision=completeSession(sessionId);
  if(!session.score) session.score=decision?.score||0;
  session.estimatedKcal=sportKcalForSession(session);
  
  saveState();
  closeSessionScreen();
  toast(decision?.weekAdvanced ? 'Séance complétée ! Nouvelle semaine générée par le coach.' : 'Séance complétée! Coach a analysé ta performance.');
  
  setTimeout(()=>{
    if(typeof go==='function') go('sport');
    renderSport();
  },500);
}

function closeWelcomeScreen(){
  const screen=document.getElementById('welcomeScreen');
  if(!screen)return;
  screen.classList.add('hidden');
  setTimeout(()=>screen.remove(),320);
  if(needsSetup())setTimeout(openSetup,180);
}
window.closeWelcomeScreen=closeWelcomeScreen;
function renderWelcomeScreen(){
  const screen=document.getElementById('welcomeScreen');
  if(!screen)return;
  const name=(DATA.profile&&DATA.profile.name||'').trim();
  const title=document.getElementById('welcomeTitle');
  if(name){
    title.innerHTML=`Bonjour, <strong>${name}</strong>`;
  }else{
    title.innerHTML='Bienvenue';
  }
  setTimeout(()=>closeWelcomeScreen(),3000);
}
window.addEventListener('load',()=>{applyTheme();renderAll();renderWelcomeScreen();});
window.addEventListener('resize',()=>renderWeightChart());



if(window.matchMedia){try{window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(DATA?.settings?.theme==='system')applyTheme();});}catch(e){}}
/* ===== Withings — connexion balance (Public API) ===== */
const WITHINGS_CONNECTOR = {
  endpoint: '/api/withings',
  async status(){
    const r=await fetch(this.endpoint+'?action=status',{credentials:'include'});
    if(!r.ok) throw new Error('status');
    return r.json();
  },
  connect(){ window.location.href=this.endpoint+'?action=connect'; },
  async sync(){
    const r=await fetch(this.endpoint+'?action=measurements',{credentials:'include'});
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||'sync');
    return d;
  },
  async disconnect(){
    const r=await fetch(this.endpoint+'?action=disconnect',{credentials:'include'});
    return r.json();
  }
};

function ensureWithingsUI(){
  // Withings is now managed only from Profil > Connexions externes.
  const oldBox=document.getElementById('withingsBox');
  if(oldBox)oldBox.remove();
}

async function refreshWithingsUI(){
  const statusEl=document.getElementById('withingsStatus'),btn=document.getElementById('withingsAction');
  if(!statusEl||!btn)return;
  try{
    const d=await WITHINGS_CONNECTOR.status();
    const dataEl=document.getElementById('withingsData');
    const disconnectBtn=document.getElementById('withingsDisconnect');
    if(d.connected){
      statusEl.textContent=d.lastSync?`Connectée · dernière synchro ${d.lastSync}`:'Connectée';
      btn.textContent='Synchroniser';
      btn.onclick=async()=>{btn.disabled=true;btn.textContent='…';try{await syncWithings();}catch(e){toast('Synchronisation impossible');}finally{btn.disabled=false;btn.textContent='Synchroniser';}};
      if(dataEl)dataEl.style.display='block';
      if(disconnectBtn)disconnectBtn.onclick=async()=>{
        disconnectBtn.disabled=true;
        try{
          await WITHINGS_CONNECTOR.disconnect();
          toast('Withings déconnecté');
          await refreshWithingsUI();
        }catch(e){toast('Déconnexion Withings impossible');}
        finally{disconnectBtn.disabled=false;}
      };
    }else{
      if(dataEl)dataEl.style.display='none';
      statusEl.textContent=d.configured?'Prête à être connectée':'Connexion Withings à configurer';
      btn.textContent='Connecter';
      btn.onclick=()=>WITHINGS_CONNECTOR.connect();
    }
  }catch(e){
    statusEl.textContent='Connexion serveur indisponible';
    btn.textContent='Configurer';
    btn.onclick=()=>toast('Le serveur Withings doit être configuré');
  }
}

async function refreshProfileWithingsUI(){
  const statusEl=document.getElementById('profileWithingsStatus'),btn=document.getElementById('profileWithingsAction'),extra=document.getElementById('profileWithingsExtra'),disconnectBtn=document.getElementById('profileWithingsDisconnect');
  if(!statusEl||!btn)return;
  btn.disabled=true;btn.textContent='…';
  try{
    const d=await WITHINGS_CONNECTOR.status();
    if(d.connected){
      statusEl.textContent=d.lastSync?`Connectée · dernière synchro ${d.lastSync}`:'Connectée';btn.textContent='Synchroniser';btn.disabled=false;
      if(extra)extra.style.display='flex';
      btn.onclick=async(e)=>{e.stopPropagation();btn.disabled=true;try{await syncWithings();await refreshProfileWithingsUI();}catch(err){toast('Synchronisation impossible')}finally{btn.disabled=false}};
      if(disconnectBtn)disconnectBtn.onclick=async(e)=>{e.stopPropagation();disconnectBtn.disabled=true;try{await WITHINGS_CONNECTOR.disconnect();toast('Withings déconnecté');await refreshProfileWithingsUI();await refreshWithingsUI();}catch(err){toast('Déconnexion Withings impossible')}finally{disconnectBtn.disabled=false}};
    }else{
      statusEl.textContent=d.configured?'Prête à être connectée':'Connexion Withings à configurer';btn.textContent=d.configured?'Connecter':'Configurer';btn.disabled=false;if(extra)extra.style.display='none';
      btn.onclick=(e)=>{e.stopPropagation();d.configured?WITHINGS_CONNECTOR.connect():toast('Le serveur Withings doit être configuré')};
    }
  }catch(e){statusEl.textContent='Connexion serveur indisponible';btn.textContent='Configurer';btn.disabled=false;if(extra)extra.style.display='none';btn.onclick=(ev)=>{ev.stopPropagation();toast('Le serveur Withings doit être configuré')}}
}

async function syncWithings(options={}){
  const silent=!!options.silent;
  let d;

  try{
    d=await WITHINGS_CONNECTOR.sync();
  }catch(e){
    console.error('Withings API error:',e);
    if(!silent) throw new Error('Impossible de récupérer les données Withings');
    return {measurements:[],added:0,error:e};
  }

  const measures=Array.isArray(d.measurements)?d.measurements:[];
  let added=0;

  for(const m of measures){
    if(!(Number(m.weight)>0)) continue;

    const date=m.date||TODAY;
    const exists=DATA.weights.some(x=>
      x.withingsId===m.id ||
      (
        x.date===date &&
        Math.abs(Number(x.weight)-Number(m.weight))<0.01 &&
        x.source==='withings'
      )
    );

    if(exists) continue;

    DATA.weights.push({
      date,
      weight:Number(m.weight),
      source:'withings',
      withingsId:m.id||null,
      bodyFat:m.bodyFat??null,
      fatFreeMass:m.fatFreeMass??null,
      fatMass:m.fatMass??null,
      muscleMass:m.muscleMass??null,
      hydration:m.hydration??null,
      boneMass:m.boneMass??null
    });
    added++;
  }

  if(added){
    DATA.weights.sort((a,b)=>String(a.date).localeCompare(String(b.date)));

    const last=DATA.weights[DATA.weights.length-1];
    if(last?.weight){
      DATA.profile.weightCurrent=Number(last.weight);
      if(!DATA.profile.startingWeight)DATA.profile.startingWeight=Number(last.weight);
    }

    try{saveState();}catch(e){console.error('Withings saveState error:',e);}
    try{renderAll();}catch(e){console.error('Withings renderAll error:',e);}
  }

  if(!silent){
    toast(
      added
        ? `${added} nouvelle${added>1?'s':''} pesée${added>1?'s':''} importée${added>1?'s':''}`
        : 'Aucune nouvelle pesée'
    );
  }

  return {...d,added};
}

const _renderAllOriginal=renderAll;
renderAll=function(){_renderAllOriginal();setTimeout(ensureWithingsUI,0);};

let __withingsAutoTimer=null;
function startWithingsAutoSync(){
  if(__withingsAutoTimer) return;
  __withingsAutoTimer=setInterval(async()=>{
    try{
      const s=await WITHINGS_CONNECTOR.status();
      if(s.connected) await syncWithings({silent:true});
    }catch(e){
      console.error('Withings auto sync:',e);
    }
  },2*60*1000);
}
startWithingsAutoSync();

function initSportCatalogLoop(){
  const rail=document.getElementById('sportCatalogRail');
  if(!rail){
    return;
  }
  if(rail.dataset.loopReady==='1'){
    updateSportCatalogDots();
    return;
  }
  const originals=Array.from(rail.children);
  if(!originals.length) return;
  originals.forEach((card,index)=>{
    card.dataset.cardIndex=String(index);
    card.dataset.clone='0';
  });
  const fragBefore=document.createDocumentFragment();
  const fragAfter=document.createDocumentFragment();
  const before=[];
  const after=[];
  originals.forEach((card,index)=>{
    const pre=card.cloneNode(true);
    pre.dataset.cardIndex=String(index);
    pre.dataset.clone='1';
    before.push(pre);
    fragBefore.appendChild(pre);
    const post=card.cloneNode(true);
    post.dataset.cardIndex=String(index);
    post.dataset.clone='1';
    after.push(post);
    fragAfter.appendChild(post);
  });
  rail.insertBefore(fragBefore, rail.firstChild);
  rail.appendChild(fragAfter);
  rail.dataset.loopReady='1';
  rail.dataset.handlingLoop='0';
  requestAnimationFrame(()=>{
    const firstOriginal=originals[0];
    const firstAfter=after[0];
    if(!firstOriginal || !firstAfter) return;
    const segmentWidth=Math.max(1, Math.round(firstAfter.offsetLeft - firstOriginal.offsetLeft));
    rail.dataset.segmentWidth=String(segmentWidth);
    rail.scrollLeft=firstOriginal.offsetLeft;
    updateSportCatalogDots();
  });
}

function scrollSportCatalog(direction){
  const rail=document.getElementById('sportCatalogRail');
  if(!rail) return;
  const amount=Math.max(rail.clientWidth*0.56,170)*direction;
  rail.scrollBy({left:amount,behavior:'smooth'});
  clearTimeout(window.__sportCatalogScrollTimer);
  window.__sportCatalogScrollTimer=setTimeout(()=>{updateSportCatalogDots();},220);
}

function handleSportCatalogScroll(){
  const rail=document.getElementById('sportCatalogRail');
  if(!rail) return;
  if(rail.dataset.handlingLoop==='1') return;
  const segmentWidth=Number(rail.dataset.segmentWidth||0);
  if(segmentWidth>0){
    const leftBound=segmentWidth*0.35;
    const rightBound=segmentWidth*1.65;
    if(rail.scrollLeft <= leftBound || rail.scrollLeft >= rightBound){
      rail.dataset.handlingLoop='1';
      if(rail.scrollLeft <= leftBound){
        rail.scrollLeft += segmentWidth;
      }else{
        rail.scrollLeft -= segmentWidth;
      }
      requestAnimationFrame(()=>{rail.dataset.handlingLoop='0'; updateSportCatalogDots();});
      return;
    }
  }
  clearTimeout(window.__sportCatalogScrollTimer);
  window.__sportCatalogScrollTimer=setTimeout(()=>{updateSportCatalogDots();},60);
}

function updateSportCatalogDots(){
  const rail=document.getElementById('sportCatalogRail');
  const dots=Array.from(document.querySelectorAll('#sportCatalogDots .sport-catalog-dot'));
  if(!rail||!dots.length) return;
  const cards=Array.from(rail.children);
  if(!cards.length) return;
  let bestCard=cards[0];
  let bestDistance=Infinity;
  const target=rail.getBoundingClientRect().left + rail.clientWidth/2;
  cards.forEach(card=>{
    const rect=card.getBoundingClientRect();
    const center=rect.left + rect.width/2;
    const distance=Math.abs(center-target);
    if(distance<bestDistance){bestDistance=distance;bestCard=card;}
  });
  const activeIndex=Number(bestCard?.dataset.cardIndex||0);
  dots.forEach((dot,index)=>dot.classList.toggle('active',index===activeIndex));
}

/* VitaTrack — Nutrition / Hydration / Weight module
 * Single source of truth for nutrition calculations and UI.
 * Core state/navigation helpers are provided by app.js; food data by data.js.
 */
let pickedFood=null;
let currentGuideQuery='';

/* ---------- Nutrition engine ---------- */
function activityFactor(){return {sedentary:1.2,light:1.375,moderate:1.55,active:1.725,very_active:1.9}[DATA.profile.activity]||1.55;}
function bmr(){const p=DATA.profile;if(!p.age||!p.height||!p.weightCurrent)return null;return p.sex==='femme'?10*p.weightCurrent+6.25*p.height-5*p.age-161:10*p.weightCurrent+6.25*p.height-5*p.age+5;}
function tdee(){const base=bmr();return base?base*activityFactor():null;}
function calorieTarget(){const base=tdee();if(!base)return null;const type=DATA.objective.type;let deficit=0;if(type==='fat_loss')deficit=Math.min(550,Math.max(250,base*0.18));if(type==='recomposition')deficit=Math.min(300,Math.max(100,base*0.08));if(type==='muscle_gain')deficit=-200;if(type==='maintain')deficit=0;if(type==='weight_target')deficit=DATA.objective.targetWeight && DATA.profile.weightCurrent>DATA.objective.targetWeight?Math.min(550,Math.max(250,base*0.18)):0;return Math.max(1400,Math.round(base-deficit));}
function proteinTarget(){const w=DATA.profile.weightCurrent;if(!w)return null;let mult=1.6;if(['fat_loss','recomposition'].includes(DATA.objective.type))mult=1.8;if(DATA.objective.type==='muscle_gain')mult=1.7;return Math.round(w*mult);}
function ensureTargets(){const k=calorieTarget(),p=proteinTarget();if(k&&!DATA.nutrition.manualCalories)DATA.nutrition.caloriesTarget=k;if(p&&!DATA.nutrition.manualProtein)DATA.nutrition.proteinTarget=p;return{k,p};}
function currentTargets(){ensureTargets();return{calories:DATA.nutrition.caloriesTarget,protein:DATA.nutrition.proteinTarget};}
function dayTotals(date=TODAY){const list=DATA.foodLog[date]||[];const base=list.reduce((a,f)=>({kcal:a.kcal+Number(f.kcal||0),protein:a.protein+Number(f.protein||0),carbs:a.carbs+Number(f.carbs??f.carb??0),fat:a.fat+Number(f.fat||0),sugar:a.sugar+Number(f.sugar||0),fiber:a.fiber+Number(f.fiber||0)}),{kcal:0,protein:0,carbs:0,fat:0,sugar:0,fiber:0});const drinks=(Array.isArray(DATA.drinkLog)?DATA.drinkLog:[]).filter(x=>x.date===date).reduce((s,x)=>s+Number(x.kcal||0),0);base.kcal+=drinks;return base;}
function waterTotal(date=TODAY){return (DATA.waterLog?.[date]||[]).reduce((s,x)=>s+Number(x.ml||0),0);}
function macroTargets(calories){return {carbs:Math.round((calories||2100)*0.48/4),fat:Math.round((calories||2100)*0.27/9),fiber:30};}
function macroPct(v,target){return target?Math.min(100,Math.max(0,v/target*100)):0;}
function lastNDays(n=7){return Array.from({length:n},(_,i)=>dateOffset(-(n-1-i)));}
function avgFor(key,days=7){const dates=lastNDays(days);const vals=dates.map(d=>dayTotals(d)[key]).filter(v=>v>0);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;}
function weightTrend(){const pts=DATA.weights.slice().sort((a,b)=>a.date.localeCompare(b.date));if(pts.length<2)return null;const recent=pts.filter(x=>x.date>=dateOffset(-6));const prior=pts.filter(x=>x.date<dateOffset(-6)).slice(-7);if(recent.length<2)return null;const avg=a=>a.reduce((s,x)=>s+x.weight,0)/a.length;const r=avg(recent);const p=prior.length?avg(prior):pts.length>1?pts[pts.length-2].weight:null;return p?{recent:r,previous:p,delta:r-p,points:recent.length}:null;}
function coachDecision(){
  const target=currentTargets();
  if(!target.calories)return{status:'setup',title:'Complète ton profil',text:'J’ai besoin de ton âge, sexe, taille et poids pour calculer ton point de départ.'};
  const avgK=avgFor('kcal'),avgP=avgFor('protein'),trend=weightTrend();
  if(!trend)return{status:'observe',title:'Je commence par observer',text:'Enregistre tes repas et quelques pesées. Je ne change pas encore ton objectif calorique avec si peu de données.',avgK,avgP,target};
  const weeklyRate=trend.delta/Math.max(0.01,trend.previous);
  let next=target.calories,status='keep';
  let reason='Ta progression est cohérente avec l’objectif.';
  if(DATA.objective.type==='fat_loss'||DATA.objective.type==='weight_target'){
    if(weeklyRate < -0.009){next+=100;status='up';reason='La perte observée est plus rapide que le rythme recherché. Je ralentis légèrement le déficit.';}
    else if(weeklyRate > -0.002){next-=100;status='down';reason='La tendance du poids est presque stable. Si l’adhérence alimentaire est bonne, je resserre légèrement l’objectif.';}
    else if(trend.delta<0){reason='Le poids baisse à un rythme raisonnable. Je conserve les calories.';}
    if(trend.delta>=0 && avgK!==null && avgK>target.calories*1.06){status='observe';reason='La moyenne alimentaire dépasse sensiblement la cible. Je préfère d’abord travailler la régularité avant de réduire davantage les calories.';next=target.calories;}
  }
  const daysSinceReview=DATA.nutrition.lastCoachReview?Math.floor((new Date(TODAY)-new Date(DATA.nutrition.lastCoachReview))/86400000):99;
  const shouldApply=status!=='observe'&&next!==target.calories&&daysSinceReview>=7;
  if(shouldApply){DATA.nutrition.caloriesTarget=Math.max(1400,next);DATA.nutrition.lastCoachReview=TODAY;DATA.coachDecisions.push({date:TODAY,from:target.calories,to:DATA.nutrition.caloriesTarget,reason,status});saveState();}
  const proteinNote=avgP&&target.protein?(avgP>=target.protein*0.9?'Ton apport en protéines est globalement satisfaisant.':'Ton apport en protéines est souvent inférieur à ta cible.'):'Ajoute quelques jours de repas pour que je puisse analyser tes protéines.';
  return{status,title:status==='up'?'Je ralentis légèrement le déficit':status==='down'?'Je resserre légèrement la cible':'Je conserve le cap',text:reason,proteinNote,avgK,avgP,trend,target,applied:shouldApply,next};
}
function weeklyReport(){const d=coachDecision();const avgK=avgFor('kcal'),avgP=avgFor('protein'),avgSugar=avgFor('sugar'),avgFiber=avgFor('fiber');return Object.assign({},d,{avgK,avgP,avgSugar,avgFiber});}

/* ---------- Hydration ---------- */
function openWaterSheet(){closeSheet('addMenuOverlay');setVal('waterQty','250');openSheet('waterSheetOverlay');}
function addWater(){
  const input=document.getElementById('waterQty');
  const ml=Math.round(Number(input?.value||250));
  if(!(ml>0)){toast('Indique une quantité d’eau');return;}
  addWaterAmount(ml);
  closeSheet('waterSheetOverlay');
}
function addWaterGlass(){
  addWaterAmount(250);
  toast('🥛 +1 verre d’eau');
}
function removeWaterGlass(){
  const list=Array.isArray(DATA.waterLog?.[TODAY])?DATA.waterLog[TODAY]:[];
  if(!list.length){toast('Aucun verre à enlever');return;}
  let remaining=250;
  while(remaining>0 && list.length){
    const last=list[list.length-1];
    const ml=Number(last.ml||0);
    if(ml<=remaining){remaining-=ml;list.pop();}
    else{last.ml=ml-remaining;remaining=0;}
  }
  DATA.waterLog[TODAY]=list;
  saveState();
  renderFood();
  toast('🥛 −1 verre d’eau');
}
function addWaterAmount(ml){
  if(!DATA.waterLog || typeof DATA.waterLog!=='object') DATA.waterLog={};
  if(!Array.isArray(DATA.waterLog[TODAY])) DATA.waterLog[TODAY]=[];
  DATA.waterLog[TODAY].push({id:'w'+Date.now()+Math.random().toString(36).slice(2,6),ml,time:new Date().toTimeString().slice(0,5)});
  try{saveState();}catch(e){console.error(e);toast('Impossible d’enregistrer l’eau');return;}
  renderFood();
}

/* ---------- Meal timing helpers ---------- */
function mealTypeForHour(hour){if(hour<10)return'Petit-déjeuner';if(hour<15)return'Déjeuner';if(hour<18)return'En-cas';if(hour<23)return'Dîner';return'Repas tardif';}
function localTimeMeta(){const d=new Date();return{time:d.toTimeString().slice(0,5),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'local',mealType:mealTypeForHour(d.getHours())};}

/* ---------- Home ---------- */

const DRINK_CATALOG={
  soft:[
    ['🥤 Coca-Cola','25 cl',105],['🥤 Coca-Cola Zero','25 cl',1],['🥤 Pepsi','25 cl',105],
    ['🥤 Orangina','25 cl',110],['🥤 Fanta Orange','25 cl',95],['🥤 Sprite','25 cl',80],
    ['🥤 Schweppes Tonic','25 cl',85],['🥤 Ice Tea sucré','25 cl',50]
  ],
  juice:[
    ['🧃 Jus d’orange','20 cl',90],['🧃 Jus de pomme','20 cl',90],['🧃 Nectar de fruits','20 cl',100]
  ],
  beer:[
    ['🍺 Bière blonde','25 cl',105],['🍺 Bière blonde','33 cl',140],['🍺 Bière blanche','25 cl',115],
    ['🍺 Bière ambrée','25 cl',120],['🍺 Bière IPA','25 cl',150],['🍺 Bière forte','25 cl',170],
    ['🍺 Bière sans alcool','25 cl',60],['🍺 Panaché','25 cl',80],['🍺 Monaco','25 cl',90]
  ],
  wine:[
    ['🍷 Vin rouge','10 cl',85],['🍷 Vin blanc sec','10 cl',80],['🍷 Vin rosé','10 cl',80],
    ['🥂 Champagne','10 cl',80],['🍷 Vin blanc moelleux','10 cl',110],['🍷 Vin liquoreux','10 cl',130],
    ['🍷 Porto','6 cl',95],['🍷 Muscat','10 cl',115]
  ],
  cider:[
    ['🍏 Cidre brut','25 cl',100],['🍏 Cidre demi-sec','25 cl',120],['🍏 Cidre doux','25 cl',140],
    ['🍎 Poiré','25 cl',110]
  ],
  spirit:[
    ['🥃 Whisky','4 cl',95],['🥃 Rhum','4 cl',90],['🥃 Vodka','4 cl',90],
    ['🥃 Gin','4 cl',90],['🥃 Tequila','4 cl',90],['🍷 Porto','6 cl',95]
  ],
  cocktail:[
    ['🍸 Gin tonic','25 cl',170],['🍹 Mojito','25 cl',180],['🍹 Piña colada','25 cl',300],
    ['🍹 Spritz','20 cl',150],['🍹 Kir','10 cl',110],['🍺 Picon bière','25 cl',170]
  ]
};
function toggleDrinkHistory(){const l=document.getElementById('drinkTodayList'),b=document.querySelector('.drink-history-toggle');if(!l||!b)return;const open=l.style.display!=='none';l.style.display=open?'none':'block';b.classList.toggle('open',!open);}
function openDrinkPicker(){const p=document.getElementById('drinkPicker');if(p)p.style.display='block';}
function closeDrinkPicker(){const p=document.getElementById('drinkPicker');if(p)p.style.display='none';const c=document.getElementById('drinkChoices');if(c){c.style.display='none';c.innerHTML='';}}
function showDrinkCategory(cat){const c=document.getElementById('drinkChoices');if(!c)return;const list=DRINK_CATALOG[cat]||[];c.innerHTML=list.map((x,i)=>`<button class="drink-choice" onclick="addDrink('${cat}',${i})"><span>${x[0]}</span><small>${x[1]} · ${x[2]} kcal</small></button>`).join('');c.style.display='grid';}
function addDrink(cat,i){const x=DRINK_CATALOG[cat]?.[i];if(!x)return;if(!Array.isArray(DATA.drinkLog))DATA.drinkLog=normaliseDrinkLog(DATA.drinkLog);DATA.drinkLog.push({date:TODAY,name:x[0],portion:x[1],kcal:Number(x[2])||0});saveState();renderAll();toast(x[0]+' ajouté');}
function removeDrink(i){if(!DATA.drinkLog)return;DATA.drinkLog.splice(i,1);saveState();renderAll();}
function renderDrinkLog(){const items=(DATA.drinkLog||[]).map((x,i)=>({...x,idx:i})).filter(x=>x.date===TODAY);const kcal=items.reduce((s,x)=>s+(+x.kcal||0),0);setText('drinkCountToday',items.length);setText('drinkCaloriesToday',Math.round(kcal));const list=document.getElementById('drinkTodayList');if(!list)return;list.innerHTML=items.length?items.map(x=>`<div class="drink-item"><div class="drink-item-main"><span>${x.name}</span><span class="drink-item-cal">${x.portion} · ${x.kcal} kcal</span></div><button class="drink-remove" onclick="removeDrink(${x.idx})">×</button></div>`).join(''):'';
}

function stepsForDate(date=TODAY){const entry=DATA.stepsLog?.[date];return Math.max(0,Math.round(Number(typeof entry==='object'?entry?.steps:entry)||0));}
function recentStepValues(days=7){const values=[];for(let i=1;i<=days;i++){const v=stepsForDate(dateOffset(-i));if(v>0)values.push(v);}return values;}
function median(values){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function objectiveStepTarget(){const type=DATA.objective?.type;return({fat_loss:9000,weight_target:9000,recomposition:8500,maintain:7500,muscle_gain:7000})[type]||8000;}
function stepsGoal(){
  const manual=Math.round(Number(DATA.settings?.stepsGoal)||0);
  if(manual>=1000)return Math.min(30000,manual);
  const objective=objectiveStepTarget(),history=recentStepValues(7),baseline=median(history);
  if(history.length<3||!baseline)return objective;
  // Progression douce : au maximum environ +10 % ou +750 pas par étape.
  const increment=Math.min(750,Math.max(250,Math.round(baseline*0.10/250)*250));
  let target=baseline<objective?Math.min(objective,baseline+increment):objective;
  target=Math.round(target/250)*250;
  return Math.max(5000,Math.min(12000,target));
}
function estimateStepCalories(steps=stepsForDate()){
  const weight=Number(DATA.profile?.weightCurrent)||0;
  if(!(weight>0)||!(steps>0))return null;
  const heightCm=Number(DATA.profile?.height)||0;
  const sex=DATA.profile?.sex;
  // Longueur de pas estimée depuis la taille ; valeur neutre si la taille manque.
  const strideM=heightCm>0?(heightCm/100)*(sex==='femme'?0.413:0.415):0.72;
  const distanceKm=steps*strideM/1000;
  // Coût énergétique net approximatif d'une marche usuelle : ~0,5 kcal/kg/km.
  const kcal=weight*distanceKm*0.5;
  return {kcal:Math.max(0,Math.round(kcal)),distanceKm};
}
function renderSteps(){
  const steps=stepsForDate(),goal=stepsGoal(),pct=Math.min(100,steps/goal*100),estimate=estimateStepCalories(steps),history=recentStepValues(7);
  setText('homeSteps',steps.toLocaleString('fr-FR'));
  setText('homeStepsGoal',goal.toLocaleString('fr-FR'));
  setBar('homeStepsBar',pct);
  setText('homeStepsCalories',estimate?`≈ ${estimate.kcal} kcal`:'—');
  setText('homeStepsDistance',estimate?`≈ ${estimate.distanceKm.toFixed(1).replace('.',',')} km`:'—');
  setText('homeStepsGoalType',DATA.settings?.stepsGoal?'Objectif personnalisé':(history.length>=3?'Objectif adaptatif':'Objectif de départ'));
  setText('homeStepsSource',steps?'Estimation calories · pas saisis manuellement':'Saisie locale · connexion Santé à venir');
}
function editSteps(){const current=stepsForDate();const raw=prompt('Nombre de pas aujourd’hui',String(current));if(raw===null)return;const cleaned=String(raw).replace(/[\s\u00a0]/g,'').replace(',','.');const steps=Math.round(Number(cleaned));if(!Number.isFinite(steps)||steps<0||steps>200000){toast('Indique un nombre de pas entre 0 et 200 000');return;}DATA.stepsLog=DATA.stepsLog||{};DATA.stepsLog[TODAY]={steps,source:'manual',updatedAt:new Date().toISOString()};saveState();renderSteps();if(typeof renderSport==='function')renderSport();if(typeof renderHome==='function')renderHome();toast('Nombre de pas enregistré');}
function vitaCoachSnapshot(date=TODAY){
  const totals=dayTotals(date),targets=currentTargets(),steps=stepsForDate(date),goal=stepsGoal(),stepEstimate=estimateStepCalories(steps);
  const sessions=(DATA.sport?.sessionHistory||[]).filter(s=>(s.completedDate||s.date)===date);
  const sportMinutes=sessions.reduce((sum,s)=>sum+Number(s.durationMinutes||s.targetDuration||0),0);
  const sportKcal=sessions.reduce((sum,s)=>sum+(typeof sportKcalForSession==='function'?Number(sportKcalForSession(s))||0:0),0);
  const latest=(DATA.weights||[]).slice().sort((a,b)=>b.date.localeCompare(a.date))[0]||null;
  const trend=weightTrend();
  const recovery=typeof estimateRecovery==='function'?estimateRecovery():null;
  return {
    date,totals,targets,steps,goal,stepEstimate,sessions,sportMinutes,sportKcal,latest,trend,recovery,
    caloriePct:targets.calories?totals.kcal/targets.calories:null,
    proteinPct:targets.protein?totals.protein/targets.protein:null,
    stepPct:goal?steps/goal:null
  };
}
function vitaCoachDecision(snapshot=vitaCoachSnapshot()){
  const s=snapshot,actions=[];
  const push=(priority,icon,title,text,type)=>actions.push({priority,icon,title,text,type});
  if(!s.targets.calories||!s.targets.protein){
    push(100,'🎯','Complète ton profil','Renseigne âge, taille, poids et objectif pour que VitaTrack puisse personnaliser tes priorités.','setup');
    return {status:'setup',title:'Coach en attente de ton profil',summary:'Complète ton profil pour obtenir des recommandations personnalisées.',actions:actions.slice(0,3),snapshot:s};
  }
  if(s.totals.kcal>0 && s.proteinPct!==null && s.proteinPct<0.7){
    const missing=Math.max(0,Math.round(s.targets.protein-s.totals.protein));
    push(94,'🥩','Priorité protéines',`Il te manque environ ${missing} g pour atteindre ta cible. Ajoute une source de protéines à ton prochain repas.`, 'protein');
  }
  if(s.totals.kcal>0 && s.caloriePct!==null && s.caloriePct>1.10){
    const over=Math.max(0,Math.round(s.totals.kcal-s.targets.calories));
    push(88,'🍽️','Reste simple pour la suite',`Tu es environ ${over} kcal au-dessus de la cible aujourd’hui. Évite de compenser brutalement : privilégie simplement des choix rassasiants et reviens au plan demain.`, 'calories_high');
  }
  if(s.steps>0 && s.stepPct!==null && s.stepPct<0.70){
    const remaining=Math.max(0,s.goal-s.steps);
    push(82,'👟','Complète ton activité',`Encore ${remaining.toLocaleString('fr-FR')} pas environ pour atteindre ton objectif. Une marche courte peut suffire à bien avancer.`, 'steps');
  } else if(!s.steps){
    push(48,'👟','Renseigne tes pas','Ajoute tes pas du jour pour que le Coach puisse évaluer ton niveau d’activité réel.', 'steps_missing');
  }
  if(s.recovery && /faible|basse|mauvaise|fatigu/i.test(String(s.recovery.label||'')) && !s.sessions.length){
    push(86,'🧘','Priorité récupération','Ta récupération semble limitée. Une séance légère, de la mobilité ou du repos sera plus utile qu’une séance intense.', 'recovery');
  } else if(s.sessions.length){
    push(35,'✅','Séance enregistrée',`${s.sessions.length} séance${s.sessions.length>1?'s':''} aujourd’hui · ${Math.round(s.sportMinutes)} min au total.`, 'sport_done');
  }
  if(s.trend && ['fat_loss','weight_target'].includes(DATA.objective.type)){
    if(s.trend.delta>0.2) push(58,'⚖️','Observe la tendance poids',`La tendance récente est de +${s.trend.delta.toFixed(1)} kg. Ne change rien sur une seule mesure : regarde surtout la régularité sur plusieurs jours.`, 'weight');
    else if(s.trend.delta<-.8) push(64,'⚖️','Perte assez rapide',`La tendance récente est de ${s.trend.delta.toFixed(1)} kg. Garde un œil sur l’énergie, la récupération et les protéines.`, 'weight_fast');
  }
  if(s.totals.kcal>0 && s.caloriePct!==null && s.caloriePct>=0.8 && s.caloriePct<=1.08 && s.proteinPct!==null && s.proteinPct>=0.85){
    push(30,'🎯','Nutrition bien engagée','Calories et protéines sont proches de leurs cibles. Inutile de compliquer la journée : garde ce rythme.', 'nutrition_good');
  }
  actions.sort((a,b)=>b.priority-a.priority);
  const top=actions.slice(0,3);
  let status='on_track',title='Garde le cap',summary='Ta journée est cohérente avec tes objectifs.';
  if(top.some(a=>a.priority>=90)){status='priority';title='Une priorité ressort aujourd’hui';summary=top[0].text;}
  else if(top.some(a=>a.priority>=80)){status='adjust';title='Petit ajustement utile';summary=top[0].text;}
  else if(top.length){summary=top[0].text;}
  return {status,title,summary,actions:top,snapshot:s};
}
function renderVitaCoach(snapshot=vitaCoachSnapshot()){
  const d=vitaCoachDecision(snapshot),box=document.getElementById('dailyCoachActions');
  setText('dailyCoachTitle',d.title);
  if(!box)return d;
  box.innerHTML=d.actions.length?d.actions.map(a=>`<div class="daily-coach-action"><span class="daily-coach-icon">${a.icon}</span><div><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.text)}</span></div></div>`).join(''):'<div class="daily-coach-empty">Continue simplement à enregistrer ta journée.</div>';
  return d;
}
function renderDailySummary(){
  const totals=dayTotals(),targets=currentTargets(),steps=stepsForDate(),goal=stepsGoal(),stepEstimate=estimateStepCalories(steps);
  const sessions=(DATA.sport?.sessionHistory||[]).filter(s=>(s.completedDate||s.date)===TODAY);
  const sportMinutes=sessions.reduce((sum,s)=>sum+Number(s.durationMinutes||s.targetDuration||0),0);
  const sportKcal=sessions.reduce((sum,s)=>sum+(typeof sportKcalForSession==='function'?Number(sportKcalForSession(s))||0:0),0);
  const calPct=targets.calories?totals.kcal/targets.calories:0,proteinPct=targets.protein?totals.protein/targets.protein:0,stepPct=goal?steps/goal:0;
  let nutritionLabel='À renseigner',nutritionDetail='Ajoute tes repas pour suivre tes apports.';
  if(totals.kcal>0&&targets.calories){
    nutritionLabel=calPct>=.8&&calPct<=1.1?'Dans la cible':calPct<.8?'En cours':'Au-dessus de la cible';
    nutritionDetail=`${Math.round(totals.kcal)} / ${targets.calories} kcal · ${Math.round(totals.protein)} / ${targets.protein||'—'} g protéines`;
  } else if(totals.kcal>0){ nutritionLabel='Enregistrée'; nutritionDetail=`${Math.round(totals.kcal)} kcal consommées aujourd’hui`; }
  let activityLabel=steps?'En cours':'À renseigner';
  if(steps&&stepPct>=1)activityLabel='Objectif atteint'; else if(steps&&stepPct>=.7)activityLabel='Bien avancée';
  const activityDetail=steps?`${steps.toLocaleString('fr-FR')} / ${goal.toLocaleString('fr-FR')} pas${stepEstimate?` · ≈ ${stepEstimate.distanceKm.toFixed(1).replace('.',',')} km`:''}`:'Aucun pas renseigné aujourd’hui.';
  const sportLabel=sessions.length?'Séance réalisée':'Aucune séance';
  const sportDetail=sessions.length?`${sessions.length} séance${sessions.length>1?'s':''} · ${Math.round(sportMinutes)} min · ≈ ${Math.round(sportKcal)} kcal`:'Aucune séance enregistrée aujourd’hui — le repos peut aussi faire partie du programme.';
  const tr=weightTrend();
  const latest=(DATA.weights||[]).slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
  const weightLabel=latest?`${latest.weight} kg`:'À renseigner';
  const weightDetail=tr?`Tendance récente : ${tr.delta>0?'+':''}${tr.delta.toFixed(1)} kg`:(latest?`Dernière pesée : ${formatDate(latest.date)}`:'Ajoute au moins deux pesées pour voir une tendance.');
  setText('dailyNutritionStatus',`Nutrition · ${nutritionLabel}`); setText('dailyNutritionDetail',nutritionDetail);
  setText('dailyActivityStatus',`Activité · ${activityLabel}`); setText('dailyActivityDetail',activityDetail);
  setText('dailySportStatus',`Sport · ${sportLabel}`); setText('dailySportDetail',sportDetail);
  setText('dailyWeightStatus',`Poids · ${weightLabel}`); setText('dailyWeightDetail',weightDetail);
  setText('dailyEnergyIn',`Apports : ${totals.kcal>0?Math.round(totals.kcal)+' kcal':'—'}`);
  const activityParts=[]; if(stepEstimate?.kcal)activityParts.push(`pas ≈ ${stepEstimate.kcal} kcal`); if(sportKcal>0)activityParts.push(`sport ≈ ${Math.round(sportKcal)} kcal`);
  setText('dailyEnergyOut',`Activité estimée : ${activityParts.length?activityParts.join(' · '):'—'}`);
  let complete=0; if(totals.kcal>0)complete++; if(steps>0)complete++; if(sessions.length)complete++; if(latest)complete++;
  let status=complete>=4?'Bien renseignée':complete>=2?'En cours':'À compléter';
  setText('dailySummaryStatus',status);
  let msg='Ajoute quelques données aujourd’hui pour obtenir un résumé plus utile.';
  if(totals.kcal>0||steps>0||sessions.length){
    const parts=[];
    if(targets.calories&&calPct>1.1)parts.push('tes apports dépassent actuellement la cible');
    else if(targets.calories&&calPct>=.8)parts.push('tes apports sont proches de la cible');
    if(steps>0&&stepPct>=1)parts.push('ton objectif de pas est atteint');
    else if(steps>0&&stepPct<.5)parts.push('l’activité quotidienne est encore faible par rapport à ton objectif');
    if(sessions.length)parts.push('ta séance du jour est enregistrée');
    if(proteinPct>0&&proteinPct<.7&&totals.kcal>0)parts.push('les protéines restent encore basses par rapport à la cible');
    msg=parts.length?parts.map((p,i)=>i? p.charAt(0).toLowerCase()+p.slice(1):p.charAt(0).toUpperCase()+p.slice(1)).join(' · ')+'.':'Ta journée est en cours : continue simplement à enregistrer ce que tu fais.';
  }
  setText('dailySummaryMessage',msg);
  renderVitaCoach(vitaCoachSnapshot());
}
function renderHome(){const p=DATA.profile,t=currentTargets(),today=dayTotals();document.getElementById('homeCalories').textContent=Math.round(today.kcal);document.getElementById('homeCaloriesGoal').textContent=t.calories?`${t.calories} kcal`:'—';document.getElementById('homeProtein').textContent=Math.round(today.protein)+' g';document.getElementById('homeProteinGoal').textContent=t.protein?`${t.protein} g`:'—';document.getElementById('homeRemaining').textContent=t.calories?Math.max(0,Math.round(t.calories-today.kcal))+' kcal restantes':'Configure ton profil';setBar('homeCalBar',t.calories?Math.min(100,today.kcal/t.calories*100):0);const tr=weightTrend();document.getElementById('homeWeight').textContent=p.weightCurrent?p.weightCurrent+' kg':'—';document.getElementById('homeTrend').textContent=tr?`${tr.delta>0?'+':''}${tr.delta.toFixed(1)} kg / période récente`:'Pas encore de données';setText('homeCurrentWeight',p.weightCurrent?p.weightCurrent+' kg':'—');setText('homeWeightGoal',DATA.objective.targetWeight?DATA.objective.targetWeight+' kg':'—');const ws=DATA.weights.slice().sort((a,b)=>b.date.localeCompare(a.date));setText('nutritionPreviousWeight',ws[1]?ws[1].weight+' kg':'—');renderWeeklyReport('weeklyReportHome');renderDrinkLog();renderSteps();renderDailySummary();const wl=waterTotal();const wine=DATA.wineLog?.[TODAY]||0;setText('nutritionWaterToday',wl?Math.round(wl)+' ml':'—');setText('nutritionWineToday',wine?wine:'—');}

/* ---------- Food ---------- */
function allFoods(){return FOOD_DB.concat(DATA.customFoods||[]);}
let selectedMealType=mealTypeForHour(new Date().getHours());
let externalFoodResults=[];
let foodSearchTimer=null;
let foodSearchRequest=null;
let foodSearchSeq=0;
function openFoodSheet(){pickedFood=null;externalFoodResults=[];if(foodSearchTimer)clearTimeout(foodSearchTimer);if(foodSearchRequest)foodSearchRequest.abort();selectedMealType=mealTypeForHour(new Date().getHours());document.getElementById('foodSearch').value='';document.getElementById('foodSearchResults').innerHTML='<div class="muted small">Recherche un aliment ou utilise le scanner code-barres.</div>';document.getElementById('foodPickedBox').style.display='none';document.getElementById('customFoodForm').style.display='none';renderMealTypeChooser();openSheet('foodSheetOverlay');}
function renderMealTypeChooser(){const box=document.getElementById('mealTypeChooser');if(!box)return;const types=['Petit-déjeuner','Déjeuner','Dîner','En-cas'];box.innerHTML=types.map(t=>`<button type="button" class="meal-chip ${selectedMealType===t?'active':''}" onclick="selectMealType('${t}')">${t}</button>`).join('');}
function selectMealType(type){selectedMealType=type;renderMealTypeChooser();toast(`Repas classé dans « ${type} »`);}
function normalizeFoodText(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function foodKey(food){return `${normalizeFoodText(food?.name)}|${Math.round(Number(food?.kcal)||0)}`;}
function localFoodMatches(query){const nq=normalizeFoodText(query);return allFoods().filter(f=>normalizeFoodText(f.name).includes(nq)).slice(0,10);}
function renderFoodSearchResults(query,locals,remote,state='ready'){
  const box=document.getElementById('foodSearchResults');if(!box)return;
  const localKeys=new Set(locals.map(foodKey));
  const remotes=(remote||[]).filter(f=>!localKeys.has(foodKey(f))).slice(0,10);
  const parts=[];
  if(locals.length){parts.push('<div class="muted small" style="padding:7px 2px 3px;font-weight:800">VitaTrack</div>');parts.push(locals.map(f=>`<div class="sr-item" onclick='pickFood(${JSON.stringify(f.name)})'><span>${escapeHtml(f.name)}</span><span class="muted">${Math.round(f.kcal)} kcal</span></div>`).join(''));}
  if(state==='loading')parts.push('<div class="muted small" style="padding:9px 2px">Recherche de produits en ligne…</div>');
  if(remotes.length){parts.push('<div class="muted small" style="padding:9px 2px 3px;font-weight:800">OpenFoodFacts · en ligne</div>');parts.push(remotes.map((f,i)=>`<div class="sr-item" onclick="pickRemoteFood(${externalFoodResults.indexOf(f)})"><span><strong>${escapeHtml(f.name)}</strong>${f.brand?`<span class="muted small" style="display:block">${escapeHtml(f.brand)}</span>`:''}</span><span class="muted">${Math.round(f.kcal)} kcal</span></div>`).join(''));}
  if(state==='offline')parts.push('<div class="muted small" style="padding:9px 2px">Recherche en ligne indisponible. Les aliments locaux restent accessibles.</div>');
  if(!parts.length)parts.push(`<div class="sr-item muted">Aucun résultat pour « ${escapeHtml(query)} ».</div>`);
  box.innerHTML=parts.join('');
}
function renderFoodSearch(){
  const input=document.getElementById('foodSearch');if(!input)return;const q=input.value.trim();
  if(foodSearchTimer)clearTimeout(foodSearchTimer);if(foodSearchRequest)foodSearchRequest.abort();externalFoodResults=[];
  const locals=q?localFoodMatches(q):[];
  if(!q){renderFoodSearchResults('',[],[]);document.getElementById('foodSearchResults').innerHTML='<div class="muted small">Recherche un aliment ou utilise le scanner code-barres.</div>';return;}
  if(q.length<2){renderFoodSearchResults(q,locals,[]);return;}
  renderFoodSearchResults(q,locals,[],'loading');
  const seq=++foodSearchSeq;foodSearchTimer=setTimeout(()=>searchOpenFoodFacts(q,seq,locals),450);
}
async function searchOpenFoodFacts(query,seq,locals){
  foodSearchRequest=new AbortController();
  const fields='code,product_name_fr,product_name,brands,nutriments';
  const url=`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=12&fields=${encodeURIComponent(fields)}`;
  try{
    const r=await fetch(url,{signal:foodSearchRequest.signal,headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const j=await r.json();if(seq!==foodSearchSeq||document.getElementById('foodSearch')?.value.trim()!==query)return;
    const seen=new Set();externalFoodResults=(j.products||[]).map(p=>{const n=p.nutriments||{};const name=(p.product_name_fr||p.product_name||'').trim();const kcal=Number(n['energy-kcal_100g']);if(!name||!Number.isFinite(kcal)||kcal<0)return null;return{name,brand:String(p.brands||'').split(',')[0].trim(),code:p.code||'',kcal,protein:Number(n.proteins_100g)||0,carbs:Number(n.carbohydrates_100g)||0,fat:Number(n.fat_100g)||0,sugar:Number(n.sugars_100g)||0,fiber:Number(n.fiber_100g)||0,giLabel:'',source:'openfoodfacts'};}).filter(f=>f&&!seen.has(foodKey(f))&&seen.add(foodKey(f)));
    renderFoodSearchResults(query,locals,externalFoodResults,'ready');
  }catch(e){if(e.name==='AbortError')return;if(seq!==foodSearchSeq)return;renderFoodSearchResults(query,locals,[],'offline');}
}
function rememberExternalFood(food){
  if(!food)return null;DATA.customFoods=DATA.customFoods||[];const key=foodKey(food);const existing=DATA.customFoods.find(f=>foodKey(f)===key)||FOOD_DB.find(f=>foodKey(f)===key);if(existing)return existing;
  const saved={name:food.name,kcal:Math.round(Number(food.kcal)||0),protein:Number(food.protein)||0,carbs:Number(food.carbs)||0,fat:Number(food.fat)||0,sugar:Number(food.sugar)||0,fiber:Number(food.fiber)||0,giLabel:food.giLabel||'',source:food.source||'openfoodfacts',barcode:food.code||''};DATA.customFoods.push(saved);saveState();return saved;
}
function pickRemoteFood(index){const food=externalFoodResults[index];if(!food)return;pickedFood=rememberExternalFood(food);showPickedFood();}
function showPickedFood(){if(!pickedFood)return;document.getElementById('foodPickedBox').style.display='block';document.getElementById('foodPickedName').textContent=pickedFood.name;document.getElementById('foodPickedKcal').textContent=`${Math.round(pickedFood.kcal)} kcal / 100 g`;document.getElementById('foodQty').value=100;renderPickedInfo();}
function pickFood(name){pickedFood=allFoods().find(f=>f.name===name);if(!pickedFood)return;showPickedFood();}
function renderPickedInfo(){if(!pickedFood)return;const box=document.getElementById('foodPickedInfo');box.innerHTML=`<div class="mini-stats"><span>🔥 ${pickedFood.kcal} kcal</span><span>🥩 ${pickedFood.protein} g protéines</span>${pickedFood.giLabel?`<span>🩸 IG ${pickedFood.giLabel}</span>`:''}</div>`;}
function toggleCustomFoodForm(){const f=document.getElementById('customFoodForm');f.style.display=f.style.display==='none'?'block':'none';}
function saveCustomFood(){const name=document.getElementById('cf_name').value.trim(),kcal=+document.getElementById('cf_kcal').value;if(!name||!kcal){toast('Nom et kcal sont nécessaires');return;}const food={name,kcal,protein:+document.getElementById('cf_protein').value||0,carbs:+document.getElementById('cf_carbs').value||0,fat:+document.getElementById('cf_fat').value||0,sugar:+document.getElementById('cf_sugar').value||0,fiber:+document.getElementById('cf_fiber').value||0,giLabel:document.getElementById('cf_gi').value||''};DATA.customFoods.push(food);saveState();toast('Aliment enregistré');document.getElementById('customFoodForm').style.display='none';pickFood(name);}
function confirmAddFood(){if(!pickedFood)return;const qty=+document.getElementById('foodQty').value;if(!(qty>0)){toast('Quantité invalide');return;}const r=qty/100;const meta=localTimeMeta();const e={id:'f'+Date.now(),name:pickedFood.name,qty,kcal:Math.round(pickedFood.kcal*r),protein:Math.round(pickedFood.protein*r*10)/10,carbs:Math.round((pickedFood.carbs||0)*r*10)/10,fat:Math.round((pickedFood.fat||0)*r*10)/10,sugar:Math.round((pickedFood.sugar||0)*r*10)/10,fiber:Math.round((pickedFood.fiber||0)*r*10)/10,time:meta.time,timezone:meta.timezone,mealType:selectedMealType||meta.mealType};if(!DATA.foodLog[TODAY])DATA.foodLog[TODAY]=[];DATA.foodLog[TODAY].push(e);saveState();closeSheet('foodSheetOverlay');toast('Ajouté à aujourd’hui');renderAll();}
function removeFood(id){DATA.foodLog[TODAY]=(DATA.foodLog[TODAY]||[]).filter(x=>x.id!==id);saveState();renderAll();}
function renderFood(){
  const t=currentTargets(),d=dayTotals(),list=(DATA.foodLog[TODAY]||[]).slice().sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  const rem=t.calories?Math.max(0,Math.round(t.calories-d.kcal)):null;
  const burned='—';
  const mt=macroTargets(t.calories||2100);
  setText('foodKcalTotal',Math.round(d.kcal));
  setText('foodGoalLabel',t.calories?`${t.calories} kcal`:'Objectif à calculer');
  setText('foodRemaining',rem===null?'—':rem+' kcal');
  setText('foodBurned',burned);
  setText('foodProteinTotal',Math.round(d.protein)+' g'); setText('foodProteinGoal',t.protein?`${t.protein} g`:'—');
  setText('foodWeight',DATA.profile.weightCurrent?DATA.profile.weightCurrent+' kg':'—');
  setText('nutritionCurrentWeight',DATA.profile.weightCurrent?DATA.profile.weightCurrent+' kg':'—');
  setText('nutritionWeightGoal',DATA.objective.targetWeight?DATA.objective.targetWeight+' kg':'—');
  setText('nutritionGoalLabel',goalLabel(DATA.objective.type)); setText('nutritionCalorieTarget',t.calories?t.calories+' kcal/j':'—');
  const bar=document.getElementById('foodBar'); if(bar)bar.style.width=t.calories?Math.min(100,d.kcal/t.calories*100)+'%':'0%'; const ring=document.getElementById('calorieRing'); if(ring){const ratio=t.calories?Math.max(0,Math.min(1,(t.calories-d.kcal)/t.calories)):0;ring.style.strokeDashoffset=(314.16*(1-ratio)).toFixed(2);}
  setText('macroCarbs',`${Math.round(d.carbs)} / ${mt.carbs} g`);setText('macroProtein',`${Math.round(d.protein)} / ${t.protein||'—'} g`);setText('macroFat',`${Math.round(d.fat)} / ${mt.fat} g`);setText('macroFiber',`${Math.round(d.fiber)} / ${mt.fiber} g`);
  setBar('macroCarbsBar',macroPct(d.carbs,mt.carbs));setBar('macroProteinBar',macroPct(d.protein,t.protein));setBar('macroFatBar',macroPct(d.fat,mt.fat));setBar('macroFiberBar',macroPct(d.fiber,mt.fiber));
  const water=waterTotal(),waterGoal=(DATA.nutrition.waterTarget||2)*1000;const glasses=water/250;setText('waterGlasses',`${glasses.toLocaleString('fr-FR',{maximumFractionDigits:1})} ${glasses===1?'verre':'verres'}`);setText('waterTotal',`${(water/1000).toFixed(2).replace('.',',')} L`);setText('waterGoal',`${(waterGoal/1000).toFixed(2).replace('.',',')} L`);setBar('waterBar',Math.min(100,water/waterGoal*100));
  const groups=[['Petit-déjeuner','☕'],['Déjeuner','🍽️'],['Dîner','🥗'],['En-cas','🍎']];
  const card=document.getElementById('foodListCard');
  card.innerHTML=groups.map(([type,icon])=>{const items=list.filter(f=>(f.mealType||'Repas')===type);const kcal=items.reduce((s,f)=>s+Number(f.kcal||0),0);const goal=Math.round((t.calories||2100)*({ 'Petit-déjeuner':.25,'Déjeuner':.33,'Dîner':.33,'En-cas':.09}[type]));const pct=goal?Math.min(100,Math.round(kcal/goal*100)):0;return `<button class="meal-row" onclick="openMealDetails('${type}')"><span class="meal-icon">${icon}</span><span class="meal-main"><strong>${type}</strong><small>${kcal} / ${goal} kcal</small><span class="meal-progress"><i style="width:${pct}%"></i></span></span><span class="meal-side"><small>${items.length?items[0].time:'—'}</small><b>${pct}%</b><span>⌄</span></span></button>`;}).join('');
  setText('nutritionCurrentWeight',DATA.profile.weightCurrent?DATA.profile.weightCurrent+' kg':'—');
}
function setBar(id,pct){const e=document.getElementById(id);if(e)e.style.width=Math.max(0,Math.min(100,pct))+'%';}
function openMealDetails(type){const items=(DATA.foodLog[TODAY]||[]).filter(f=>(f.mealType||'Repas')===type);document.getElementById('mealDetailsTitle').textContent=type;document.getElementById('mealDetailsBody').innerHTML=items.length?items.map(f=>`<div class="timeline-item"><div class="timeline-time">${f.time||'—'}</div><div class="timeline-dot"></div><div class="timeline-main"><div class="timeline-title">${escapeHtml(f.name)}</div><div class="timeline-meta">${f.qty} g · ${Math.round(f.kcal)} kcal · ${Math.round(f.protein)} g protéines</div></div><button class="item-del" onclick="removeFood('${f.id}');openMealDetails('${type}')">×</button></div>`).join(''):'<div class="muted small" style="padding:8px 0">Aucun aliment enregistré dans cette catégorie.</div>';openSheet('mealDetailsOverlay');}

function setText(id,value){const e=document.getElementById(id);if(e)e.textContent=value;}
function addFreeTextMeal(){
  const input=document.getElementById('freeMealText');
  const text=(input?.value||'').trim();
  if(!text){toast('Décris simplement ce que tu as mangé');return;}
  const lower=text.toLowerCase();
  const matches=[];
  for(const f of allFoods()){
    if(!lower.includes(f.name.toLowerCase())) continue;
    const before=lower.split(f.name.toLowerCase())[0].slice(-20);
    const m=before.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml)?\s*(?:de|du|des|d'|d’)?\s*$/i);
    let qty=m?parseFloat(m[1].replace(',','.')):100;
    if(m&&m[2]&&m[2].toLowerCase()==='kg')qty*=1000;
    matches.push({f,qty});
  }
  if(!matches.length){toast('Je ne reconnais pas encore cet aliment. Utilise la recherche ou le code-barres.');return;}
  const meta=localTimeMeta();
  if(!DATA.foodLog[TODAY])DATA.foodLog[TODAY]=[];
  matches.forEach(({f,qty},i)=>{
    const r=qty/100;
    DATA.foodLog[TODAY].push({id:'f'+Date.now()+i,name:f.name,qty,kcal:Math.round(f.kcal*r),protein:Math.round(f.protein*r*10)/10,carbs:Math.round((f.carbs||0)*r*10)/10,fat:Math.round((f.fat||0)*r*10)/10,sugar:Math.round((f.sugar||0)*r*10)/10,fiber:Math.round((f.fiber||0)*r*10)/10,time:meta.time,timezone:meta.timezone,mealType:selectedMealType||meta.mealType});
  });
  saveState();input.value='';closeSheet('foodSheetOverlay');toast(`${matches.length} aliment${matches.length>1?'s':''} ajouté${matches.length>1?'s':''}`);renderAll();
}


/* ---------- Add / scanners ---------- */
function stopCamera(id){const v=document.getElementById(id);if(v?.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null;}if(v)v.style.display='none';}
async function scanBarcode(){
  const video=document.getElementById('barcodeVideo'); if(!video)return;
  if(!('BarcodeDetector' in window)){toast('Scanner code-barres indisponible sur ce navigateur.');return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
    video.srcObject=stream;video.style.display='block';await video.play();toast('Cadre le code-barres dans la caméra');
    const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']});
    let running=true;
    const tick=async()=>{if(!running||!video.srcObject)return;try{const codes=await detector.detect(video);if(codes.length){running=false;const code=codes[0].rawValue;stopCamera('barcodeVideo');await lookupBarcode(code);return;}}catch(e){}requestAnimationFrame(tick);};
    tick();
  }catch(e){toast('Impossible d’ouvrir la caméra. Vérifie l’autorisation.');}
}
async function lookupBarcode(code){
  code=(code||'').trim();if(!code)return;
  const status=document.getElementById('plateStatus');if(status)status.textContent='Recherche du produit…';
  try{
    const r=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    const j=await r.json();const p=j.product;
    if(!p||j.status!==1){toast('Produit non trouvé');if(status)status.textContent='Produit non trouvé.';return;}
    const n=p.nutriments||{};
    const f={name:p.product_name_fr||p.product_name||'Produit scanné',code,kcal:Number(n['energy-kcal_100g']||0),protein:Number(n.proteins_100g||0),carbs:Number(n.carbohydrates_100g||0),fat:Number(n.fat_100g||0),sugar:Number(n.sugars_100g||0),fiber:Number(n.fiber_100g||0),giLabel:'',source:'openfoodfacts'};
    pickedFood=rememberExternalFood(f);showPickedFood();toast('Produit trouvé — indique la quantité');if(status)status.textContent='';
  }catch(e){toast('Recherche du code-barres impossible');if(status)status.textContent='Vérifie ta connexion internet.';}
}
async function scanPlate(){
  const video=document.getElementById('plateVideo'),status=document.getElementById('plateStatus');if(!video)return;
  try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});video.srcObject=stream;video.style.display='block';await video.play();if(status)status.textContent='Cadre ton assiette. La reconnaissance automatique de l’assiette sera ajoutée ensuite.';toast('Scanner de l’assiette prêt');}
  catch(e){toast('Impossible d’ouvrir la caméra. Vérifie l’autorisation.');}
}

/* ---------- Guide ---------- */
function openGuideFood(name){const f=allFoods().find(x=>x.name===name);if(!f)return;document.getElementById('guideTitle').textContent=f.name;document.getElementById('guideDetail').innerHTML=`<div class="guide-hero"><div class="num">${f.kcal}</div><span>kcal / 100 g</span></div><div class="mini-stats"><span>🥩 ${f.protein} g protéines</span><span>🍬 ${f.sugar??'—'} g sucres</span></div><div class="guide-gi"><strong>🩸 Glycémie</strong><div>${f.giLabel?`Indice glycémique indicatif : <b>${f.giLabel}</b>`:'Donnée non renseignée'}</div></div><div class="coach-note"><strong>🎯 Pour la perte de gras</strong><p>${foodAdvice(f)}</p></div>`;openSheet('guideSheetOverlay');}
function foodAdvice(f){if(f.kcal>=500&&f.protein<12)return'À consommer avec attention : très dense en calories et peu riche en protéines. Une petite portion peut vite peser dans la journée.';if(f.protein>=20&&f.kcal<=220)return'Très intéressant pour ton objectif : beaucoup de protéines pour une quantité de calories modérée.';if(f.kcal<=100)return'Facile à intégrer dans une journée de perte de gras, surtout si la portion reste adaptée à ton objectif.';return'Peut parfaitement trouver sa place dans une alimentation de perte de gras. La quantité et l’ensemble de ta journée comptent plus que le fait de classer un aliment comme « bon » ou « mauvais ». ';}
function renderGuide(){const q=currentGuideQuery.trim().toLowerCase();const featured=['Poulet (blanc, cuit)','Œuf entier','Riz basmati cuit','Pâtes cuites','Avoine (flocons)','Banane','Pomme','Fraises','Skyr nature','Fromage blanc 0%','Amandes','Saumon (cuit)','Thon (nature, conserve)','Lentilles cuites','Pois chiches cuits','Avocat','Brocoli (cuit)','Patate douce (cuite)','Pomme de terre (cuite)','Chocolat noir 70%','Pizza margherita','Frites'];const base=allFoods();const res=(q?base.filter(f=>f.name.toLowerCase().includes(q)):featured.map(n=>base.find(f=>f.name===n)).filter(Boolean));document.getElementById('guideList').innerHTML=res.map(f=>`<button class="guide-row" onclick='openGuideFood(${JSON.stringify(f.name)})'><div><strong>${escapeHtml(f.name)}</strong><div class="muted small">${f.kcal} kcal · ${f.protein} g prot.${f.giLabel?' · IG '+f.giLabel:''}</div></div><span>›</span></button>`).join('') || '<div class="muted small" style="padding:14px">Aucun aliment trouvé.</div>';}
function filterGuide(v){currentGuideQuery=v;renderGuide();}

/* ---------- Weight / weekly report ---------- */
function openWeightEntry(){const f=document.getElementById('weightEntryForm');if(!f)return;const h=document.getElementById('nutritionWeightHistory');if(h)h.style.display='none';const hidden=getComputedStyle(f).display==='none';f.style.display=hidden?'block':'none';if(f.style.display==='block')setTimeout(()=>document.getElementById('newWeight')?.focus(),50);}
function logWeight(){const w=+document.getElementById('newWeight').value;if(!(w>0)){toast('Indique un poids');return;}const waist=+document.getElementById('newWaist').value||null;const visceral=+document.getElementById('newVisceralFat').value||null;DATA.weights.push({date:TODAY,weight:w,waist,visceralFat:visceral});DATA.profile.weightCurrent=w;DATA.profile.waist=waist||DATA.profile.waist;DATA.profile.visceralFat=visceral||DATA.profile.visceralFat;if(!DATA.profile.startingWeight)DATA.profile.startingWeight=w;saveState();document.getElementById('newWeight').value='';document.getElementById('newWaist').value='';document.getElementById('newVisceralFat').value='';const form=document.getElementById('weightEntryForm');if(form)form.style.display='none';toast('Pesée enregistrée');renderAll();}
function renderWeightList(){const count=DATA.weights.length;setText('nutritionWeightHistoryCount',count?`${count} pesée${count>1?'s':''}`:'Aucune pesée');const targets=document.querySelectorAll('#weightListCard,#homeWeightListCard');targets.forEach(c=>{if(!c)return;if(!count){c.innerHTML=emptyState('⚖️','Aucune pesée enregistrée.');return;}const sorted=DATA.weights.map((x,i)=>({...x,idx:i})).sort((a,b)=>b.date.localeCompare(a.date));c.innerHTML=sorted.map(x=>`<div class="item-row"><div class="item-ico">⚖️</div><div class="item-main"><div class="item-title">${x.weight} kg${x.source==='withings'?'<span class="weight-source">Withings</span>':''}</div><div class="item-sub">${formatDate(x.date)}${x.waist?` · tour ${x.waist} cm`:''}${x.visceralFat?` · graisse viscérale ${x.visceralFat}`:''}</div></div><button class="item-del" onclick="removeWeight(${x.idx})" aria-label="Supprimer cette pesée">×</button></div>`).join('');});}
function removeWeight(i){DATA.weights.splice(i,1);saveState();renderAll();}
function formatDate(d){const [y,m,day]=d.split('-');return `${day}/${m}/${y}`;}
function renderWeightChart(){const svg=document.getElementById('homeWeightChart');if(!svg)return;const pts=DATA.weights.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(-12);if(pts.length<2){svg.innerHTML='<text x="10" y="70" fill="var(--ink-soft)" font-size="13">Ajoute au moins 2 pesées pour voir la tendance</text>';return;}const W=Math.max(300,svg.parentElement.clientWidth),H=150,pad=22;svg.setAttribute('width',W);svg.setAttribute('viewBox',`0 0 ${W} ${H}`);const vals=pts.map(x=>x.weight),min=Math.min(...vals)-.5,max=Math.max(...vals)+.5,x=i=>pad+i/(pts.length-1)*(W-pad*2),y=v=>H-pad-(v-min)/(max-min)*(H-pad*2),path=pts.map((p,i)=>(i?'L':'M')+x(i)+','+y(p.weight)).join(' ');svg.innerHTML=`<path d="${path}" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round"/>${pts.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.weight)}" r="4" fill="var(--primary)"/>`).join('')}`;}
function renderWeeklyReport(targetId='weeklyReportHome'){const r=weeklyReport();const el=document.getElementById(targetId);if(!el)return;const t=currentTargets();if(r.status==='setup'){el.innerHTML='<div class="card"><h2>Ton bilan</h2><p class="muted">Complète ton profil pour commencer.</p><button class="btn btn-primary btn-block" style="margin-top:12px" onclick="go(\'food\')">Compléter mon profil</button></div>';return;}el.innerHTML=`<div class="card"><div class="eyebrow">Bilan des 7 derniers jours</div><h2>${r.title}</h2><p>${r.text}</p><div class="report-grid"><div><strong>${r.avgK?Math.round(r.avgK):'—'}</strong><span>kcal moy./j</span></div><div><strong>${r.avgP?Math.round(r.avgP):'—'} g</strong><span>protéines moy./j</span></div><div><strong>${r.trend?r.trend.delta.toFixed(1):'—'} kg</strong><span>tendance poids</span></div><div><strong>${t.protein||'—'} g</strong><span>objectif protéines</span></div></div><div class="coach-note"><strong>💡 Conseil de la semaine</strong><p>${r.proteinNote}</p></div><div class="coach-note"><strong>🥗 À tester</strong><p>${weeklyFoodSuggestion()}</p></div><button class="btn btn-ghost btn-block" style="margin-top:12px" onclick="go(\'food\')">Voir ma nutrition</button></div>`;}
function weeklyFoodSuggestion(){const d=dayTotals();if(d.protein<proteinTarget()*0.7)return'Ajoute une source de protéines simple à un repas que tu manges déjà : skyr, fromage blanc, œufs, poulet, poisson ou légumineuses.';if(d.kcal>calorieTarget())return'Privilégie les aliments rassasiants et peu denses en calories : légumes, fruits entiers, pommes de terre, soupes, protéines maigres.';return'Garde les aliments que tu apprécies. Pour varier, compare leurs fiches dans le Guide nutritionnel et choisis une alternative qui te convient.';}

function renderNutritionCoach(){const r=weeklyReport();setText('nutritionCoachTitle',r.title);setText('nutritionCoachText',r.text);}


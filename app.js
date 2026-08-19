/* VitaTrack Nutrition V1 */
const STORAGE_KEY='vitatrack_state_v2';
let DATA=loadState();
let pickedFood=null;
let currentGuideQuery='';
const TODAY=todayStr();

function todayStr(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dateOffset(days){const d=new Date(); d.setDate(d.getDate()+days); return todayStr(d);}
function loadState(){try{const raw=localStorage.getItem(STORAGE_KEY); if(raw)return migrate(JSON.parse(raw));}catch(e){} return defaultData();}
function migrate(d){const def=defaultData(); const p=Object.assign({},def.profile,d.profile||{}); const oldGoal=p.goal;
  const objective=Object.assign({},def.objective,d.objective||{});
  if(!d.objective){if(oldGoal==='lose')objective.type='fat_loss'; else if(oldGoal==='gain')objective.type='muscle_gain'; else if(oldGoal==='maintain')objective.type='maintain';}
  p.visceralFat=p.visceralFat??null; return Object.assign({},def,d,{profile:p,objective,nutrition:Object.assign({},def.nutrition,d.nutrition||{}),waterLog:d.waterLog||{},drinkLog:d.drinkLog||[],settings:Object.assign({},def.settings,d.settings||{}),foodLog:d.foodLog||{},weights:d.weights||[],customFoods:d.customFoods||[],coachDecisions:d.coachDecisions||[],reports:d.reports||{}});
}
function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(DATA));}
function toast(msg){const el=document.getElementById('toast'); if(!el)return; el.textContent=msg; el.classList.add('show'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.remove('show'),2200);}

/* ---------- Nutrition engine ---------- */
function activityFactor(){return {sedentary:1.2,light:1.375,moderate:1.55,active:1.725,very_active:1.9}[DATA.profile.activity]||1.55;}
function bmr(){const p=DATA.profile;if(!p.age||!p.height||!p.weightCurrent)return null;return p.sex==='femme'?10*p.weightCurrent+6.25*p.height-5*p.age-161:10*p.weightCurrent+6.25*p.height-5*p.age+5;}
function tdee(){const base=bmr();return base?base*activityFactor():null;}
function calorieTarget(){const base=tdee();if(!base)return null;const type=DATA.objective.type;let deficit=0;if(type==='fat_loss')deficit=Math.min(550,Math.max(250,base*0.18));if(type==='recomposition')deficit=Math.min(300,Math.max(100,base*0.08));if(type==='muscle_gain')deficit=-200;if(type==='maintain')deficit=0;if(type==='weight_target')deficit=DATA.objective.targetWeight && DATA.profile.weightCurrent>DATA.objective.targetWeight?Math.min(550,Math.max(250,base*0.18)):0;return Math.max(1400,Math.round(base-deficit));}
function proteinTarget(){const w=DATA.profile.weightCurrent;if(!w)return null;let mult=1.6;if(['fat_loss','recomposition'].includes(DATA.objective.type))mult=1.8;if(DATA.objective.type==='muscle_gain')mult=1.7;return Math.round(w*mult);}
function ensureTargets(){const k=calorieTarget(),p=proteinTarget();if(k&&!DATA.nutrition.manualCalories)DATA.nutrition.caloriesTarget=k;if(p&&!DATA.nutrition.manualProtein)DATA.nutrition.proteinTarget=p;return{k,p};}
function currentTargets(){ensureTargets();return{calories:DATA.nutrition.caloriesTarget,protein:DATA.nutrition.proteinTarget};}
function dayTotals(date=TODAY){const list=DATA.foodLog[date]||[];const base=list.reduce((a,f)=>({kcal:a.kcal+Number(f.kcal||0),protein:a.protein+Number(f.protein||0),carbs:a.carbs+Number(f.carbs??f.carb??0),fat:a.fat+Number(f.fat||0),sugar:a.sugar+Number(f.sugar||0),fiber:a.fiber+Number(f.fiber||0)}),{kcal:0,protein:0,carbs:0,fat:0,sugar:0,fiber:0});const drinks=(DATA.drinkLog?.[date]||[]).reduce((s,x)=>s+Number(x.kcal||0),0);base.kcal+=drinks;return base;}
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

/* ---------- Navigation ---------- */
function go(screen){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));const el=document.getElementById('screen-'+screen);if(!el)return;el.classList.add('active');document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.screen===screen));const fab=document.getElementById('globalFab');fab.style.display='flex';fab.onclick=openAddMenu;window.scrollTo(0,0);renderAll();}
function openAddMenu(){openSheet('addMenuOverlay');}
function openAddMeal(){closeSheet('addMenuOverlay');openFoodSheet();}
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
function openWeighing(){closeSheet('addMenuOverlay');go('food');setTimeout(()=>document.getElementById('newWeight')?.focus(),100);}
function openTraining(){closeSheet('addMenuOverlay');toast('Le suivi des entraînements arrivera dans la prochaine étape.');}
function setSubtab(group,name){const c=document.getElementById('screen-'+group);c.querySelectorAll('.subtab').forEach(t=>t.classList.toggle('active',t.dataset.sub===name));c.querySelectorAll('.sub').forEach(s=>s.style.display=s.dataset.sub===name?'block':'none');if(name==='poids')renderWeightChart();if(name==='rapport')renderWeeklyReport();}
function scrollNutritionTo(id){go('food');setTimeout(()=>{const el=document.getElementById(id);if(!el)return;const details=el.closest('details');if(details)details.open=true;el.scrollIntoView({behavior:'smooth',block:'start'});},30);}
function openProfileSheet(){renderProfile();openSheet('profileSheetOverlay');}
function openWeightSheet(){go('food');setTimeout(()=>document.getElementById('newWeight')?.focus(),80);}
function mealTypeForHour(hour){if(hour<10)return'Petit-déjeuner';if(hour<15)return'Déjeuner';if(hour<18)return'En-cas';if(hour<23)return'Dîner';return'Repas tardif';}
function localTimeMeta(){const d=new Date();return{time:d.toTimeString().slice(0,5),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'local',mealType:mealTypeForHour(d.getHours())};}


/* ---------- Home ---------- */
const DRINK_DB={soda:{name:'Soda',icon:'🥤',kcal:84},wine:{name:'Vin',icon:'🍷',kcal:85},beer:{name:'Bière',icon:'🍺',kcal:140},juice:{name:'Jus de fruit',icon:'🧃',kcal:90},energy:{name:'Boisson énergisante',icon:'⚡',kcal:110},cocktail:{name:'Cocktail',icon:'🍹',kcal:180},spirit:{name:'Alcool fort',icon:'🥃',kcal:70},other:{name:'Autre boisson',icon:'🥛',kcal:0}};
function toggleDrinkEntry(){const el=document.getElementById('drinkEntry');if(el)el.style.display=el.style.display==='none'?'block':'none';}
function addDrink(type){const d=DRINK_DB[type];if(!d)return;let kcal=d.kcal;if(type==='other'){const raw=prompt('Nom de la boisson et calories pour 1 verre/portion (ex. Ice tea, 70 kcal)');if(!raw)return;const m=raw.match(/(.+?)[,;:]+\s*(\d+(?:\.\d+)?)\s*kcal/i);if(!m){toast('Indique par exemple : Ice tea, 70 kcal');return;}d={...d,name:m[1].trim(),kcal:Number(m[2])};kcal=d.kcal;}const n=Number(prompt(`Combien de ${d.name.toLowerCase()} ?`,'1'));if(!(n>0))return;DATA.drinkLog=DATA.drinkLog||{};const arr=DATA.drinkLog[TODAY]||[];const existing=arr.find(x=>x.type===type&&x.name===d.name&&x.kcalEach===d.kcal);if(existing){existing.qty+=n;}else{arr.push({type,name:d.name,icon:d.icon,qty:n,kcalEach:d.kcal});}DATA.drinkLog[TODAY]=arr;saveState();renderAll();toast(`${d.name} enregistré`);}
function renderDrinkLog(){const list=document.getElementById('nutritionDrinkList');if(!list)return;const arr=DATA.drinkLog?.[TODAY]||[];const total=arr.reduce((s,x)=>s+x.qty*x.kcalEach,0);setText('nutritionDrinkKcal',Math.round(total)+' kcal');if(!arr.length){list.innerHTML='<div class="small muted" style="padding:8px 0">Aucune boisson calorique enregistrée aujourd’hui.</div>';return;}list.innerHTML=arr.map((x,i)=>`<div class="drink-row"><div class="drink-row-main"><span>${x.icon}</span><div><div class="drink-row-name">${x.name}</div><div class="drink-row-count">${x.qty} ${x.qty>1?'verres/portions':'verre/portion'}</div></div></div><div class="drink-row-kcal">${Math.round(x.qty*x.kcalEach)} kcal</div></div>`).join('');}
function openWineLog(){addDrink('wine');}
function openWaterLog(){const amount=prompt('Combien de ml d’eau ajouter ?','250');if(amount===null)return;const n=Number(amount);if(!(n>0))return;DATA.waterLog=DATA.waterLog||{};if(!Array.isArray(DATA.waterLog[TODAY]))DATA.waterLog[TODAY]=[];DATA.waterLog[TODAY].push({ml:n,time:new Date().toISOString()});saveState();renderAll();toast('Eau enregistrée');}

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
function addDrink(cat,i){const x=DRINK_CATALOG[cat]?.[i];if(!x)return;DATA.drinkLog=DATA.drinkLog||[];DATA.drinkLog.push({date:TODAY,name:x[0],portion:x[1],kcal:x[2]});saveState();renderAll();toast(x[0]+' ajouté');}
function removeDrink(i){if(!DATA.drinkLog)return;DATA.drinkLog.splice(i,1);saveState();renderAll();}
function renderDrinkLog(){const items=(DATA.drinkLog||[]).map((x,i)=>({...x,idx:i})).filter(x=>x.date===TODAY);const kcal=items.reduce((s,x)=>s+(+x.kcal||0),0);setText('drinkCountToday',items.length);setText('drinkCaloriesToday',Math.round(kcal));const list=document.getElementById('drinkTodayList');if(!list)return;list.innerHTML=items.length?items.map(x=>`<div class="drink-item"><div class="drink-item-main"><span>${x.name}</span><span class="drink-item-cal">${x.portion} · ${x.kcal} kcal</span></div><button class="drink-remove" onclick="removeDrink(${x.idx})">×</button></div>`).join(''):'';
}

function renderHome(){const p=DATA.profile,t=currentTargets(),today=dayTotals();document.getElementById('homeCalories').textContent=Math.round(today.kcal);document.getElementById('homeCaloriesGoal').textContent=t.calories?`${t.calories} kcal`:'—';document.getElementById('homeProtein').textContent=Math.round(today.protein)+' g';document.getElementById('homeProteinGoal').textContent=t.protein?`${t.protein} g`:'—';document.getElementById('homeRemaining').textContent=t.calories?Math.max(0,Math.round(t.calories-today.kcal))+' kcal restantes':'Configure ton profil';const tr=weightTrend();document.getElementById('homeWeight').textContent=p.weightCurrent?p.weightCurrent+' kg':'—';document.getElementById('homeTrend').textContent=tr?`${tr.delta>0?'+':''}${tr.delta.toFixed(1)} kg / période récente`:'Pas encore de données';setText('homeCurrentWeight',p.weightCurrent?p.weightCurrent+' kg':'—');setText('homeWeightGoal',DATA.objective.targetWeight?DATA.objective.targetWeight+' kg':'—');const ws=DATA.weights.slice().sort((a,b)=>b.date.localeCompare(a.date));setText('nutritionPreviousWeight',ws[1]?ws[1].weight+' kg':'—');renderWeeklyReport('weeklyReportHome');renderDrinkLog();const wl=DATA.waterLog?.[TODAY]||0;const wine=DATA.wineLog?.[TODAY]||0;setText('nutritionWaterToday',wl?Math.round(wl)+' ml':'—');setText('nutritionWineToday',wine?wine:'—');}

/* ---------- Food ---------- */
function allFoods(){return FOOD_DB.concat(DATA.customFoods);}
let selectedMealType=mealTypeForHour(new Date().getHours());
function openFoodSheet(){pickedFood=null;selectedMealType=mealTypeForHour(new Date().getHours());document.getElementById('foodSearch').value='';document.getElementById('foodSearchResults').innerHTML='';document.getElementById('foodPickedBox').style.display='none';document.getElementById('customFoodForm').style.display='none';renderMealTypeChooser();openSheet('foodSheetOverlay');}
function renderMealTypeChooser(){const box=document.getElementById('mealTypeChooser');if(!box)return;const types=['Petit-déjeuner','Déjeuner','Dîner','En-cas'];box.innerHTML=types.map(t=>`<button type="button" class="meal-chip ${selectedMealType===t?'active':''}" onclick="selectMealType('${t}')">${t}</button>`).join('');}
function selectMealType(type){selectedMealType=type;renderMealTypeChooser();toast(`Repas classé dans « ${type} »`);}

function renderFoodSearch(){const q=document.getElementById('foodSearch').value.trim().toLowerCase();const box=document.getElementById('foodSearchResults');if(!q){box.innerHTML='<div class="muted small">Recherche un aliment ou utilise le scanner code-barres.</div>';return;}const res=allFoods().filter(f=>f.name.toLowerCase().includes(q)).slice(0,15);box.innerHTML=res.map(f=>`<div class="sr-item" onclick='pickFood(${JSON.stringify(f.name)})'><span>${f.name}</span><span class="muted">${f.kcal} kcal</span></div>`).join('')||'<div class="sr-item muted">Aucun résultat local.</div>';}
function pickFood(name){pickedFood=allFoods().find(f=>f.name===name);if(!pickedFood)return;document.getElementById('foodPickedBox').style.display='block';document.getElementById('foodPickedName').textContent=pickedFood.name;document.getElementById('foodPickedKcal').textContent=`${pickedFood.kcal} kcal / 100 g`;document.getElementById('foodQty').value=100;renderPickedInfo();}
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
    const f={name:p.product_name_fr||p.product_name||'Produit scanné',kcal:Number(n['energy-kcal_100g']||0),protein:Number(n.proteins_100g||0),carbs:Number(n.carbohydrates_100g||0),fat:Number(n.fat_100g||0),sugar:Number(n.sugars_100g||0),fiber:Number(n.fiber_100g||0),giLabel:''};
    DATA.customFoods=DATA.customFoods||[];DATA.customFoods.push(f);saveState();pickFood(f.name);toast('Produit trouvé — indique la quantité');if(status)status.textContent='';
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
function openWeightEntry(){const f=document.getElementById('weightEntryForm');if(!f)return;f.style.display=f.style.display==='none'?'block':'none';if(f.style.display==='block')setTimeout(()=>document.getElementById('newWeight')?.focus(),50);}
function logWeight(){const w=+document.getElementById('newWeight').value;if(!(w>0)){toast('Indique un poids');return;}const waist=+document.getElementById('newWaist').value||null;const visceral=+document.getElementById('newVisceralFat').value||null;DATA.weights.push({date:TODAY,weight:w,waist,visceralFat:visceral});DATA.profile.weightCurrent=w;DATA.profile.waist=waist||DATA.profile.waist;DATA.profile.visceralFat=visceral||DATA.profile.visceralFat;if(!DATA.profile.startingWeight)DATA.profile.startingWeight=w;saveState();document.getElementById('newWeight').value='';document.getElementById('newWaist').value='';document.getElementById('newVisceralFat').value='';const form=document.getElementById('weightEntryForm');if(form)form.style.display='none';toast('Pesée enregistrée');renderAll();}
function renderWeightList(){const targets=document.querySelectorAll('#weightListCard,#homeWeightListCard');targets.forEach(c=>{if(!c)return;if(!DATA.weights.length){c.innerHTML=emptyState('⚖️','Aucune pesée enregistrée.');return;}const sorted=DATA.weights.map((x,i)=>({...x,idx:i})).sort((a,b)=>b.date.localeCompare(a.date));c.innerHTML=sorted.map(x=>`<div class="item-row"><div class="item-ico">⚖️</div><div class="item-main"><div class="item-title">${x.weight} kg</div><div class="item-sub">${formatDate(x.date)}${x.waist?` · tour ${x.waist} cm`:''}${x.visceralFat?` · graisse viscérale ${x.visceralFat}`:''}</div></div><button class="item-del" onclick="removeWeight(${x.idx})">×</button></div>`).join('');});}
function removeWeight(i){DATA.weights.splice(i,1);saveState();renderAll();}
function formatDate(d){const [y,m,day]=d.split('-');return `${day}/${m}/${y}`;}
function renderWeightChart(){const svg=document.getElementById('homeWeightChart');if(!svg)return;const pts=DATA.weights.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(-12);if(pts.length<2){svg.innerHTML='<text x="10" y="70" fill="var(--ink-soft)" font-size="13">Ajoute au moins 2 pesées pour voir la tendance</text>';return;}const W=Math.max(300,svg.parentElement.clientWidth),H=150,pad=22;svg.setAttribute('width',W);svg.setAttribute('viewBox',`0 0 ${W} ${H}`);const vals=pts.map(x=>x.weight),min=Math.min(...vals)-.5,max=Math.max(...vals)+.5,x=i=>pad+i/(pts.length-1)*(W-pad*2),y=v=>H-pad-(v-min)/(max-min)*(H-pad*2),path=pts.map((p,i)=>(i?'L':'M')+x(i)+','+y(p.weight)).join(' ');svg.innerHTML=`<path d="${path}" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round"/>${pts.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.weight)}" r="4" fill="var(--primary)"/>`).join('')}`;}
function renderWeeklyReport(targetId='weeklyReportHome'){const r=weeklyReport();const el=document.getElementById(targetId);if(!el)return;const t=currentTargets();if(r.status==='setup'){el.innerHTML='<div class="card"><h2>Ton bilan</h2><p class="muted">Complète ton profil pour commencer.</p><button class="btn btn-primary btn-block" style="margin-top:12px" onclick="go(\'food\')">Compléter mon profil</button></div>';return;}el.innerHTML=`<div class="card"><div class="eyebrow">Bilan des 7 derniers jours</div><h2>${r.title}</h2><p>${r.text}</p><div class="report-grid"><div><strong>${r.avgK?Math.round(r.avgK):'—'}</strong><span>kcal moy./j</span></div><div><strong>${r.avgP?Math.round(r.avgP):'—'} g</strong><span>protéines moy./j</span></div><div><strong>${r.trend?r.trend.delta.toFixed(1):'—'} kg</strong><span>tendance poids</span></div><div><strong>${t.protein||'—'} g</strong><span>objectif protéines</span></div></div><div class="coach-note"><strong>💡 Conseil de la semaine</strong><p>${r.proteinNote}</p></div><div class="coach-note"><strong>🥗 À tester</strong><p>${weeklyFoodSuggestion()}</p></div><button class="btn btn-ghost btn-block" style="margin-top:12px" onclick="go(\'food\')">Voir ma nutrition</button></div>`;}
function weeklyFoodSuggestion(){const d=dayTotals();if(d.protein<proteinTarget()*0.7)return'Ajoute une source de protéines simple à un repas que tu manges déjà : skyr, fromage blanc, œufs, poulet, poisson ou légumineuses.';if(d.kcal>calorieTarget())return'Privilégie les aliments rassasiants et peu denses en calories : légumes, fruits entiers, pommes de terre, soupes, protéines maigres.';return'Garde les aliments que tu apprécies. Pour varier, compare leurs fiches dans le Guide nutritionnel et choisis une alternative qui te convient.';}

function renderNutritionCoach(){const r=weeklyReport();setText('nutritionCoachTitle',r.title);setText('nutritionCoachText',r.text);}

/* ---------- Profile ---------- */
function renderProfile(){const p=DATA.profile,t=currentTargets();setText('profileCalorieTarget',t.calories?t.calories+' kcal/j':'À calculer');setText('profileProteinTarget',t.protein?t.protein+' g/j':'À calculer');setVal('pf_name',p.name||'');setVal('pf_age',p.age||'');setVal('pf_sex',p.sex||'homme');setVal('pf_height',p.height||'');setVal('pf_weight',p.weightCurrent||'');setVal('pf_goal',DATA.objective.type||'fat_loss');setVal('pf_activity',p.activity||'moderate');setVal('pf_target',DATA.objective.targetWeight||'');setVal('pf_bodyfat_target',DATA.objective.targetBodyFat||'');setVal('pf_waist_target',DATA.objective.targetWaist||'');const theme=document.getElementById('themeToggle');if(theme)theme.textContent=DATA.settings.theme==='dark'?'Désactiver':'Activer';}
function saveProfile(){const p=DATA.profile;p.name=document.getElementById('pf_name').value.trim();p.age=+document.getElementById('pf_age').value||0;p.sex=document.getElementById('pf_sex').value;p.height=+document.getElementById('pf_height').value||0;const w=+document.getElementById('pf_weight').value||0;if(w&&!p.startingWeight)p.startingWeight=w;p.weightCurrent=w;saveState();ensureTargets();saveState();toast('Profil enregistré');renderAll();}
function saveGoals(){DATA.objective.type=document.getElementById('pf_goal').value;DATA.profile.activity=document.getElementById('pf_activity').value;const tw=+document.getElementById('pf_target').value;DATA.objective.targetWeight=tw>0?tw:null;const bf=+document.getElementById('pf_bodyfat_target').value;DATA.objective.targetBodyFat=bf>0?bf:null;const wa=+document.getElementById('pf_waist_target').value;DATA.objective.targetWaist=wa>0?wa:null;DATA.nutrition.manualCalories=false;DATA.nutrition.manualProtein=false;ensureTargets();saveState();toast('Objectif mis à jour');renderAll();}
function goalLabel(g){return{fat_loss:'Perte de gras',recomposition:'Recomposition',muscle_gain:'Prise de muscle',maintain:'Maintien',weight_target:'Atteindre un poids'}[g]||'—';}
function toggleTheme(){DATA.settings.theme=DATA.settings.theme==='dark'?'light':'dark';document.body.dataset.theme=DATA.settings.theme;saveState();renderAll();}

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
function importData(ev){const f=ev.target.files[0];if(!f)return;const r=new FileReader();r.onload=e=>{try{DATA=migrate(JSON.parse(e.target.result));saveState();document.body.dataset.theme=DATA.settings.theme||'light';renderAll();toast('Données importées');}catch(x){toast('Fichier invalide');}};r.readAsText(f);}
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
function showSportDay(date){const h=(DATA.sport.sessionHistory||[]).filter(s=>(s.completedDate||s.date)===date),mins=h.reduce((a,s)=>a+Number(s.targetDuration||0),0),k=h.reduce((a,s)=>a+sportKcalForSession(s),0),score=h.length?Math.round(h.reduce((a,s)=>a+(s.score||sportSessionScore(s)),0)/h.length):0;const e=document.getElementById('sportDayDetail');if(e)e.innerHTML=`<div class="eyebrow">${date}</div><h3>${h.length?'Activité réalisée':'Repos / aucune séance'}</h3><div class="sport-metrics"><div class="sport-metric"><strong>${h.length}</strong><small>séances</small></div><div class="sport-metric"><strong>${mins}</strong><small>minutes</small></div><div class="sport-metric"><strong>${k}</strong><small>kcal</small></div></div><p class="muted small">Score global : <strong>${score}%</strong></p>`}
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

function openSession(sessionId){
  const program=DATA.sport.currentProgram;
  const session=program?.sessions?.find(s=>s.id===sessionId);
  if(!session) return;
  
  session.status='in_progress';
  session.startTime=new Date().toISOString();
  saveState();
  
  const box=document.getElementById('sessionWorkArea');
  const recovery=estimateRecovery();
  
  box.innerHTML = '<div class="card">' +
    '<div class="eyebrow">Séance en cours</div>' +
    '<h2>' + session.name + '</h2>' +
    '<div class="row" style="align-items:center;margin-top:6px"><p class="muted" style="margin:0">' + recovery.label + '</p><strong id="sessionElapsed" class="sport-chip green">0:00</strong></div>' +
    '<div style="margin:16px 0 0;display:flex;flex-direction:column;gap:8px">' +
    session.exercises.map((ex,i) =>
      '<div class="exercise-item" data-exercise-idx="' + i + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:start">' +
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
    '</div><div style="margin-top:16px"><button class="btn btn-primary btn-block" onclick="finishSession(\'' + sessionId + '\')">Terminer la séance</button></div></div>';
  
  document.getElementById('sportContent').innerHTML=box.innerHTML;
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
  
  const decision=completeSession(sessionId);
  session.score=sportSessionScore(session)||decision?.score||0;
  session.estimatedKcal=sportKcalForSession(session);
  
  saveState();
  toast(decision?.weekAdvanced ? 'Séance complétée ! Nouvelle semaine générée par le coach.' : 'Séance complétée! Coach a analysé ta performance.');
  
  setTimeout(()=>{
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
window.addEventListener('load',()=>{document.body.dataset.theme=DATA.settings.theme||'light';renderAll();renderWelcomeScreen();});
window.addEventListener('resize',()=>renderWeightChart());


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
  const card=document.querySelector('.weigh-card');
  if(!card || card.querySelector('#withingsBox')) return;
  const box=document.createElement('div');
  box.id='withingsBox';
  box.style.cssText='margin-top:12px;padding-top:12px;border-top:1px solid var(--border)';
  box.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div><strong style="font-size:13px">⚖️ Balance Withings</strong><div id="withingsStatus" class="muted small" style="margin-top:3px">Connexion non configurée</div></div><button id="withingsAction" class="btn btn-ghost btn-sm" type="button">Connecter</button></div><div id="withingsData" style="display:none;margin-top:10px"></div>`;
  card.appendChild(box);
  refreshWithingsUI();
}

async function refreshWithingsUI(){
  const statusEl=document.getElementById('withingsStatus'),btn=document.getElementById('withingsAction');
  if(!statusEl||!btn)return;
  try{
    const d=await WITHINGS_CONNECTOR.status();
    if(d.connected){
      statusEl.textContent=d.lastSync?`Connectée · dernière synchro ${d.lastSync}`:'Connectée';
      btn.textContent='Synchroniser';
      btn.onclick=async()=>{btn.disabled=true;btn.textContent='…';try{await syncWithings();}catch(e){toast('Synchronisation impossible');}finally{btn.disabled=false;btn.textContent='Synchroniser';}};
    }else{
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

async function syncWithings(){
  const d=await WITHINGS_CONNECTOR.sync();
  const measures=d.measurements||[];
  let added=0;
  for(const m of measures){
    if(!(m.weight>0)) continue;
    const date=m.date||TODAY;
    const exists=DATA.weights.some(x=>x.withingsId===m.id || (x.date===date && Math.abs(Number(x.weight)-Number(m.weight))<0.01 && x.source==='withings'));
    if(exists) continue;
    DATA.weights.push({date,weight:m.weight,source:'withings',withingsId:m.id||null,bodyFat:m.bodyFat??null,muscleMass:m.muscleMass??null,hydration:m.hydration??null,visceralFat:m.visceralFat??null});
    added++;
  }
  if(added){
    DATA.weights.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const last=DATA.weights[DATA.weights.length-1];
    if(last?.weight){DATA.profile.weightCurrent=Number(last.weight);if(!DATA.profile.startingWeight)DATA.profile.startingWeight=Number(last.weight);}
    saveState(); renderAll();
  }
  toast(added?`${added} nouvelle${added>1?'s':''} pesée${added>1?'s':''} importée${added>1?'s':''}`:'Aucune nouvelle pesée');
  return d;
}

const _renderAllOriginal=renderAll;
renderAll=function(){_renderAllOriginal();setTimeout(ensureWithingsUI,0);};

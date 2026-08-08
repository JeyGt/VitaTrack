/* ===================== State ===================== */
const STORAGE_KEY = 'vitatrack_state_v1';
let DATA = loadState();
let pickedFood = null;
let pickedSport = null;
let pickedSleepQ = null;

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) return migrate(JSON.parse(raw));
  }catch(e){}
  return defaultData();
}
function migrate(d){
  const def = defaultData();
  const oldProfile = d.profile||{};
  const legacyGoal = oldProfile.goal;
  const mappedObjective = Object.assign({}, def.objective, d.objective||{});
  if(!d.objective){
    if(legacyGoal==='lose') mappedObjective.type='fat_loss';
    else if(legacyGoal==='gain') mappedObjective.type='muscle_gain';
    else if(legacyGoal==='maintain') mappedObjective.type='maintain';
    if(oldProfile.weightTarget) mappedObjective.targetWeight=oldProfile.weightTarget;
  }
  return Object.assign({}, def, d, {
    profile: Object.assign({}, def.profile, oldProfile),
    objective: mappedObjective,
    nutrition: Object.assign({}, def.nutrition, d.nutrition||{}),
    settings: Object.assign({}, def.settings, d.settings||{}),
    habits: { config: (d.habits&&d.habits.config&&d.habits.config.length)?d.habits.config:def.habits.config, logs:(d.habits&&d.habits.logs)||{} },
    foodLog: d.foodLog||{}, sportLog: d.sportLog||{}, water: d.water||{}, sleep: d.sleep||{}, steps: d.steps||{},
    weights: d.weights||[], customFoods: d.customFoods||[], favorites: d.favorites||[],
    customEntries: d.customEntries||[], coachDecisions:d.coachDecisions||[]
  });
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
}
function todayStr(){
  const t = new Date();
  return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
}
const TODAY = todayStr();

/* ===================== Toast ===================== */
let toastTimer=null;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove('show'), 2200);
}

/* ===================== Nutrition coach foundation ===================== */
function calcCalorieGoal(){
  const p = DATA.profile;
  if(!p.age || !p.height || !p.weightCurrent) return null;
  let bmr;
  if(p.sex==='femme') bmr = 10*p.weightCurrent + 6.25*p.height - 5*p.age - 161;
  else bmr = 10*p.weightCurrent + 6.25*p.height - 5*p.age + 5;
  const factors = {sedentary:1.2, light:1.375, moderate:1.55, active:1.725, very_active:1.9};
  const tdee = bmr * (factors[p.activity]||1.55);
  const type = DATA.objective?.type || 'fat_loss';
  let adj = 0;
  if(type==='fat_loss') adj = -400;
  if(type==='muscle_gain') adj = 200;
  return Math.max(1200, Math.round(tdee+adj));
}
function proteinGoal(){
  if(!DATA.profile.weightCurrent) return null;
  return Math.round(DATA.profile.weightCurrent*1.8);
}
function ensureNutritionTargets(){
  const kcal=calcCalorieGoal();
  const protein=proteinGoal();
  if(kcal) DATA.nutrition.caloriesTarget=kcal;
  if(protein) DATA.nutrition.proteinTarget=protein;
  return {kcal,protein};
}

/* ===================== Navigation ===================== */
function go(screen){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+screen).classList.add('active');
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active', b.dataset.screen===screen));
  const fab = document.getElementById('globalFab');
  fab.style.display = (screen==='food'||screen==='sport'||screen==='home') ? 'flex' : 'none';
  fab.onclick = screen==='sport' ? openSportSheet : openFoodSheet;
  window.scrollTo(0,0);
  renderAll();
}
function setSubtab(group, name){
  const container = group==='track' ? document.getElementById('screen-track') : document.getElementById('screen-profile');
  container.querySelectorAll('.subtab').forEach(t=>t.classList.toggle('active', t.dataset.sub===name));
  container.querySelectorAll('.sub').forEach(s=>s.style.display = (s.dataset.sub===name) ? 'block':'none');
  if(name==='poids') renderWeightChart();
}

/* ===================== Habits ===================== */
function renderHabits(){
  const log = DATA.habits.logs[TODAY] || {};
  const list = document.getElementById('habitList');
  list.innerHTML = DATA.habits.config.map(h=>{
    const done = !!log[h.id];
    return `<div class="habit-item ${done?'done':''}" onclick="toggleHabit('${h.id}')">
      <div class="habit-check"><svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></div>
      <div class="habit-label">${h.label}</div>
    </div>`;
  }).join('');
}
function toggleHabit(id){
  if(!DATA.habits.logs[TODAY]) DATA.habits.logs[TODAY] = {};
  const wasOn = !!DATA.habits.logs[TODAY][id];
  DATA.habits.logs[TODAY][id] = !wasOn;
  saveState();
  saveState();
  renderHabits();
  renderHome();
}

/* ===================== Home / rings ===================== */
function ringCirc(r){ return 2*Math.PI*r; }
function setRing(id, r, pct){
  const c = ringCirc(r);
  const el = document.getElementById(id);
  el.style.strokeDasharray = c;
  el.style.strokeDashoffset = c - (Math.min(pct,1)*c);
}
function renderHome(){
  document.getElementById('greetTitle').textContent = 'Bonjour, '+ (DATA.profile.name||'') ;
  const kcalGoal = calcCalorieGoal();
  const kcalToday = (DATA.foodLog[TODAY]||[]).reduce((a,f)=>a+f.kcal,0);
  const waterToday = DATA.water[TODAY]||0;
  const sportMinToday = (DATA.sportLog[TODAY]||[]).reduce((a,s)=>a+s.duration,0);

  setRing('ringCal', 86, kcalToday/Math.max(kcalGoal,1));
  setRing('ringWater', 64, waterToday/Math.max(DATA.settings.waterGoalMl,1));
  setRing('ringSport', 42, sportMinToday/Math.max(DATA.settings.sportGoalMin,1));
  document.getElementById('kcalCenter').textContent = kcalToday;

  document.getElementById('statWeight').textContent = DATA.profile.weightCurrent || '–';
  document.getElementById('statSteps').textContent = (DATA.steps[TODAY]||0).toLocaleString('fr-FR');

  renderHabits();
}

/* ===================== Food ===================== */
function openFoodSheet(){
  pickedFood = null;
  document.getElementById('foodSearch').value='';
  document.getElementById('foodSearchResults').innerHTML='';
  document.getElementById('foodPickedBox').style.display='none';
  document.getElementById('customFoodForm').style.display='none';
  openSheet('foodSheetOverlay');
}
function allFoods(){ return FOOD_DB.concat(DATA.customFoods); }
function renderFoodSearch(){
  const q = document.getElementById('foodSearch').value.trim().toLowerCase();
  const box = document.getElementById('foodSearchResults');
  if(!q){ box.innerHTML=''; return; }
  const results = allFoods().filter(f=>f.name.toLowerCase().includes(q)).slice(0,12);
  box.innerHTML = results.map((f,i)=>`<div class="sr-item" onclick='pickFood(${JSON.stringify(f.name)})'><span>${f.name}</span><span class="muted">${f.kcal} kcal/100g</span></div>`).join('') || `<div class="sr-item muted">Aucun résultat</div>`;
}
function pickFood(name){
  pickedFood = allFoods().find(f=>f.name===name);
  if(!pickedFood) return;
  document.getElementById('foodPickedBox').style.display='block';
  document.getElementById('foodPickedName').textContent = pickedFood.name;
  document.getElementById('foodPickedKcal').textContent = pickedFood.kcal+' kcal/100g';
  document.getElementById('foodQty').value = 100;
}
function toggleCustomFoodForm(){
  const f = document.getElementById('customFoodForm');
  f.style.display = f.style.display==='none' ? 'block':'none';
}
function saveCustomFood(){
  const name = document.getElementById('cf_name').value.trim();
  const kcal = parseFloat(document.getElementById('cf_kcal').value)||0;
  if(!name || !kcal){ toast('Renseigne au moins un nom et des kcal'); return; }
  const food = {
    name, kcal,
    protein: parseFloat(document.getElementById('cf_protein').value)||0,
    carbs: parseFloat(document.getElementById('cf_carbs').value)||0,
    fat: parseFloat(document.getElementById('cf_fat').value)||0
  };
  DATA.customFoods.push(food);
  saveState();
  toast('Aliment créé');
  document.getElementById('customFoodForm').style.display='none';
  pickFood(name);
}
function confirmAddFood(){
  if(!pickedFood) return;
  const qty = parseFloat(document.getElementById('foodQty').value)||0;
  if(qty<=0){ toast('Quantité invalide'); return; }
  const ratio = qty/100;
  const entry = {
    id: 'f'+Date.now(), name: pickedFood.name, qty,
    kcal: Math.round(pickedFood.kcal*ratio),
    protein: Math.round(pickedFood.protein*ratio*10)/10,
    carbs: Math.round(pickedFood.carbs*ratio*10)/10,
    fat: Math.round(pickedFood.fat*ratio*10)/10,
    time: new Date().toTimeString().slice(0,5)
  };
  if(!DATA.foodLog[TODAY]) DATA.foodLog[TODAY]=[];
  DATA.foodLog[TODAY].push(entry);
  saveState();
  closeSheet('foodSheetOverlay');
  toast('Aliment ajouté');
  renderAll();
}
function removeFood(id){
  DATA.foodLog[TODAY] = (DATA.foodLog[TODAY]||[]).filter(f=>f.id!==id);
  saveState();
  renderAll();
}
function renderFood(){
  const kcalGoal = calcCalorieGoal();
  const list = DATA.foodLog[TODAY]||[];
  const total = list.reduce((a,f)=>a+f.kcal,0);
  const protein = list.reduce((a,f)=>a+f.protein,0);
  const carbs = list.reduce((a,f)=>a+f.carbs,0);
  const fat = list.reduce((a,f)=>a+f.fat,0);
  document.getElementById('foodKcalTotal').textContent = total;
  document.getElementById('foodBar').style.width = Math.min(100,(total/Math.max(kcalGoal,1))*100)+'%';
  document.getElementById('foodGoalLabel').textContent = 'Objectif : '+kcalGoal+' kcal';
  document.getElementById('macroSummary').textContent = `P ${Math.round(protein)}g · G ${Math.round(carbs)}g · L ${Math.round(fat)}g`;

  const card = document.getElementById('foodListCard');
  if(!list.length){
    card.innerHTML = emptyState('🍽️','Aucun aliment enregistré aujourd\'hui.');
    return;
  }
  card.innerHTML = list.slice().reverse().map(f=>`
    <div class="item-row">
      <div class="item-ico">🍽️</div>
      <div class="item-main"><div class="item-title">${f.name}</div><div class="item-sub">${f.qty} g · ${f.time}</div></div>
      <div class="item-val">${f.kcal} kcal</div>
      <button class="item-del" onclick="removeFood('${f.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6"/></svg></button>
    </div>`).join('');
}

/* ===================== Sport ===================== */
function openSportSheet(){
  pickedSport = null;
  document.getElementById('sportDuration').value = 30;
  document.getElementById('sportKcalEstimate').textContent = '–';
  const chips = document.getElementById('sportChips');
  chips.innerHTML = SPORT_DB.map(s=>`<button class="chip" data-name="${s.name}" onclick='selectSport(${JSON.stringify(s.name)})'>${s.icon} ${s.name}</button>`).join('');
  openSheet('sportSheetOverlay');
}
function selectSport(name){
  pickedSport = SPORT_DB.find(s=>s.name===name);
  document.querySelectorAll('#sportChips .chip').forEach(c=>c.classList.toggle('active', c.dataset.name===name));
  updateSportEstimate();
}
function updateSportEstimate(){
  if(!pickedSport) return;
  const dur = parseFloat(document.getElementById('sportDuration').value)||0;
  const kcal = Math.round(pickedSport.met * DATA.profile.weightCurrent * (dur/60));
  document.getElementById('sportKcalEstimate').textContent = kcal+' kcal';
}
document.addEventListener('input', e=>{ if(e.target && e.target.id==='sportDuration') updateSportEstimate(); });
function confirmAddSport(){
  if(!pickedSport){ toast('Choisis une activité'); return; }
  const dur = parseFloat(document.getElementById('sportDuration').value)||0;
  if(dur<=0){ toast('Durée invalide'); return; }
  const kcal = Math.round(pickedSport.met * DATA.profile.weightCurrent * (dur/60));
  const entry = {id:'s'+Date.now(), type:pickedSport.name, icon:pickedSport.icon, duration:dur, kcal, time:new Date().toTimeString().slice(0,5)};
  if(!DATA.sportLog[TODAY]) DATA.sportLog[TODAY]=[];
  DATA.sportLog[TODAY].push(entry);
  saveState();
  closeSheet('sportSheetOverlay');
  toast('Séance ajoutée');
  renderAll();
}
function removeSport(id){
  DATA.sportLog[TODAY] = (DATA.sportLog[TODAY]||[]).filter(s=>s.id!==id);
  saveState();
  renderAll();
}
function renderSport(){
  const list = DATA.sportLog[TODAY]||[];
  const totalMin = list.reduce((a,s)=>a+s.duration,0);
  const totalKcal = list.reduce((a,s)=>a+s.kcal,0);
  const goal = DATA.settings.sportGoalMin;
  document.getElementById('sportMinTotal').textContent = totalMin;
  document.getElementById('sportBar').style.width = Math.min(100,(totalMin/Math.max(goal,1))*100)+'%';
  document.getElementById('sportGoalLabel').textContent = 'Objectif : '+goal+' min';
  document.getElementById('sportKcalLabel').textContent = totalKcal+' kcal brûlées';

  const card = document.getElementById('sportListCard');
  if(!list.length){ card.innerHTML = emptyState('🏃','Aucune séance enregistrée aujourd\'hui.'); return; }
  card.innerHTML = list.slice().reverse().map(s=>`
    <div class="item-row">
      <div class="item-ico">${s.icon||'🏃'}</div>
      <div class="item-main"><div class="item-title">${s.type}</div><div class="item-sub">${s.duration} min · ${s.time}</div></div>
      <div class="item-val">${s.kcal} kcal</div>
      <button class="item-del" onclick="removeSport('${s.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6"/></svg></button>
    </div>`).join('');
}

/* ===================== Steps ===================== */
function openStepsSheet(){
  document.getElementById('stepsInput').value = DATA.steps[TODAY]||'';
  openSheet('stepsSheetOverlay');
}
function confirmSteps(){
  const v = parseInt(document.getElementById('stepsInput').value)||0;
  DATA.steps[TODAY] = v;
  saveState();
  closeSheet('stepsSheetOverlay');
  renderAll();
  toast('Pas enregistrés');
}

/* ===================== Water ===================== */
function addWater(){
  DATA.water[TODAY] = (DATA.water[TODAY]||0) + DATA.settings.waterCupMl;
  saveState();
  renderAll();
}
function removeWater(){
  DATA.water[TODAY] = Math.max(0,(DATA.water[TODAY]||0) - DATA.settings.waterCupMl);
  saveState();
  renderAll();
}
function renderWater(){
  const v = DATA.water[TODAY]||0;
  const goal = DATA.settings.waterGoalMl;
  document.getElementById('waterLabel').textContent = v+' / '+goal+' ml';
  document.getElementById('waterCupsLabel').textContent = Math.round(v/DATA.settings.waterCupMl)+' verres';
  document.getElementById('waterBar').style.width = Math.min(100,(v/Math.max(goal,1))*100)+'%';
}

/* ===================== Sleep ===================== */
function setSleepQ(q){
  pickedSleepQ = q;
  document.querySelectorAll('[data-q]').forEach(c=>c.classList.toggle('active', parseInt(c.dataset.q)===q));
}
function saveSleep(){
  const hours = parseFloat(document.getElementById('sleepHours').value)||0;
  DATA.sleep[TODAY] = {hours, quality: pickedSleepQ||2};
  saveState();
  toast('Sommeil enregistré');
}
function loadSleepForm(){
  const s = DATA.sleep[TODAY];
  document.getElementById('sleepHours').value = s ? s.hours : '';
  if(s){ setSleepQ(s.quality); }
}

/* ===================== Weight ===================== */
function logWeight(){
  const w = parseFloat(document.getElementById('newWeight').value);
  if(!w){ toast('Indique un poids'); return; }
  const waist = document.getElementById('newWaist').value;
  DATA.weights.push({date:TODAY, weight:w, waist: waist||null});
  DATA.profile.weightCurrent = w;
  saveState();
  document.getElementById('newWeight').value='';
  document.getElementById('newWaist').value='';
  toast('Pesée enregistrée');
  renderAll();
}
function removeWeight(idx){
  DATA.weights.splice(idx,1);
  saveState();
  renderAll();
}
function renderWeightList(){
  const card = document.getElementById('weightListCard');
  if(!DATA.weights.length){ card.innerHTML = emptyState('⚖️','Aucune pesée enregistrée.'); return; }
  const sorted = DATA.weights.map((w,i)=>({...w, idx:i})).sort((a,b)=>b.date.localeCompare(a.date));
  card.innerHTML = sorted.map(w=>`
    <div class="item-row">
      <div class="item-ico">⚖️</div>
      <div class="item-main"><div class="item-title">${w.weight} kg</div><div class="item-sub">${formatDate(w.date)}${w.waist?(' · taille '+w.waist+'cm'):''}</div></div>
      <button class="item-del" onclick="removeWeight(${w.idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6"/></svg></button>
    </div>`).join('');
  const last = sorted[0], prev = sorted[1];
  document.getElementById('weightDeltaLabel').textContent = (last&&prev) ? ((last.weight-prev.weight>=0?'+':'')+(Math.round((last.weight-prev.weight)*10)/10)+' kg') : '';
}
function formatDate(d){
  const [y,m,day] = d.split('-');
  return day+'/'+m+'/'+y;
}
function renderWeightChart(){
  const svg = document.getElementById('weightChart');
  const days = DATA.settings.chartDays||30;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-days);
  const pts = DATA.weights.filter(w=>new Date(w.date)>=cutoff).sort((a,b)=>a.date.localeCompare(b.date));
  if(pts.length<2){
    svg.innerHTML = `<text x="10" y="70" fill="var(--ink-soft)" font-size="13">Ajoute au moins 2 pesées pour voir la courbe</text>`;
    return;
  }
  const W = Math.max(300, svg.parentElement.clientWidth), H=140, pad=24;
  svg.setAttribute('width', W);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const weights = pts.map(p=>p.weight);
  const min = Math.min(...weights)-0.5, max = Math.max(...weights)+0.5;
  const x = i => pad + (i/(pts.length-1))*(W-pad*2);
  const y = v => H-pad - ((v-min)/(max-min))*(H-pad*2);
  const path = pts.map((p,i)=>(i===0?'M':'L')+x(i)+','+y(p.weight)).join(' ');
  const areaPath = path + ` L${x(pts.length-1)},${H-pad} L${x(0)},${H-pad} Z`;
  svg.innerHTML = `
    <defs><linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${areaPath}" fill="url(#wgrad)" stroke="none"/>
    <path d="${path}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.weight)}" r="3.5" fill="var(--primary)"/>`).join('')}
  `;
}

/* ===================== Profile ===================== */
function renderProfile(){
  const p = DATA.profile;
  document.getElementById('avatarLetter').textContent = (p.name||'?').charAt(0).toUpperCase();
  document.getElementById('profName').textContent = p.name||'–';
  document.getElementById('profSub').textContent = `${p.age||'–'} ans · ${p.height||'–'} cm · ${goalLabel(DATA.objective.type)}`;
  document.getElementById('pf_name').value = p.name||'';
  document.getElementById('pf_age').value = p.age||'';
  document.getElementById('pf_sex').value = p.sex||'homme';
  document.getElementById('pf_height').value = p.height||'';
  document.getElementById('pf_weight').value = p.weightCurrent||'';
  document.getElementById('pf_goal').value = DATA.objective.type||'fat_loss';
  document.getElementById('pf_activity').value = p.activity||'moderate';
  document.getElementById('pf_target').value = DATA.objective.targetWeight||'';
  document.getElementById('pf_bodyfat_target').value = DATA.objective.targetBodyFat||'';
  document.getElementById('pf_waist_target').value = DATA.objective.targetWaist||'';
  document.getElementById('st_steps').value = DATA.settings.dailyStepGoal;
  document.getElementById('st_sport').value = DATA.settings.sportGoalMin;
  document.getElementById('st_water').value = DATA.settings.waterGoalMl;
  document.getElementById('st_cup').value = DATA.settings.waterCupMl;
  document.getElementById('themeToggle').textContent = DATA.settings.theme==='dark' ? 'Désactiver' : 'Activer';
  const targets = ensureNutritionTargets();
  const kcalEl = document.getElementById('profileCalorieTarget');
  const proteinEl = document.getElementById('profileProteinTarget');
  if(kcalEl) kcalEl.textContent = targets.kcal ? targets.kcal+' kcal/j' : 'À calculer';
  if(proteinEl) proteinEl.textContent = targets.protein ? targets.protein+' g/j' : 'À calculer';
}
function goalLabel(g){ return {fat_loss:'Perte de gras',recomposition:'Recomposition',muscle_gain:'Prise de muscle',maintain:'Maintien',weight_target:'Atteindre un poids'}[g] || '–'; }
function saveProfile(){
  DATA.profile.name = document.getElementById('pf_name').value.trim() || 'Toi';
  DATA.profile.age = parseInt(document.getElementById('pf_age').value)||0;
  DATA.profile.sex = document.getElementById('pf_sex').value;
  DATA.profile.height = parseInt(document.getElementById('pf_height').value)||0;
  const weight = parseFloat(document.getElementById('pf_weight').value)||0;
  if(!DATA.profile.startingWeight && weight) DATA.profile.startingWeight = weight;
  DATA.profile.weightCurrent = weight;
  saveState();
  ensureNutritionTargets();
  saveState();
  toast('Profil enregistré');
  renderAll();
}
function saveGoals(){
  DATA.objective.type = document.getElementById('pf_goal').value;
  DATA.profile.activity = document.getElementById('pf_activity').value;
  const target = parseFloat(document.getElementById('pf_target').value);
  DATA.objective.targetWeight = Number.isFinite(target) && target>0 ? target : null;
  const bodyFatTarget = parseFloat(document.getElementById('pf_bodyfat_target').value);
  const waistTarget = parseFloat(document.getElementById('pf_waist_target').value);
  DATA.objective.targetBodyFat = Number.isFinite(bodyFatTarget) && bodyFatTarget>0 ? bodyFatTarget : null;
  DATA.objective.targetWaist = Number.isFinite(waistTarget) && waistTarget>0 ? waistTarget : null;
  DATA.settings.dailyStepGoal = parseInt(document.getElementById('st_steps').value)||10000;
  DATA.settings.sportGoalMin = parseInt(document.getElementById('st_sport').value)||30;
  DATA.settings.waterGoalMl = parseInt(document.getElementById('st_water').value)||2000;
  DATA.settings.waterCupMl = parseInt(document.getElementById('st_cup').value)||250;
  ensureNutritionTargets();
  saveState();
  toast('Objectifs mis à jour');
  renderAll();
}
function toggleTheme(){
  DATA.settings.theme = DATA.settings.theme==='dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', DATA.settings.theme);
  saveState();
  renderProfile();
}

/* ===================== Export / import / reset ===================== */
function exportData(){
  const blob = new Blob([JSON.stringify(DATA,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'vitatrack_'+TODAY+'.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Export terminé');
}
function importData(ev){
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const parsed = JSON.parse(e.target.result);
      DATA = migrate(parsed);
      saveState();
      document.body.setAttribute('data-theme', DATA.settings.theme||'light');
      renderAll();
      toast('Données importées');
    }catch(err){ toast('Fichier invalide'); }
  };
  reader.readAsText(file);
}
function resetToday(){
  if(!confirm('Réinitialiser toutes les données du jour ?')) return;
  delete DATA.foodLog[TODAY]; delete DATA.sportLog[TODAY]; delete DATA.water[TODAY];
  delete DATA.sleep[TODAY]; delete DATA.steps[TODAY]; delete DATA.habits.logs[TODAY];
  saveState();
  renderAll();
  toast('Journée réinitialisée');
}

/* ===================== Sheets ===================== */
function openSheet(id){ document.getElementById(id).classList.add('open'); }
function closeSheet(id){ document.getElementById(id).classList.remove('open'); }
function closeSheetIfBg(ev,id){ if(ev.target.id===id) closeSheet(id); }

/* ===================== Helpers ===================== */
function emptyState(icon, text){
  return `<div class="empty-state"><div style="font-size:30px;">${icon}</div><p>${text}</p></div>`;
}

/* ===================== Render all ===================== */
function renderAll(){
  ensureNutritionTargets();
  renderHome();
  renderFood();
  renderSport();
  renderWater();
  loadSleepForm();
  renderWeightList();
  renderProfile();
}

/* ===================== Init ===================== */
window.addEventListener('load', ()=>{
  document.body.setAttribute('data-theme', DATA.settings.theme||'light');
  renderAll();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  }
});
window.addEventListener('resize', ()=>{
  if(document.querySelector('[data-sub="poids"]').style.display==='block') renderWeightChart();
});

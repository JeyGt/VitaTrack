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
  return Object.assign({}, def, d, {
    profile: Object.assign({}, def.profile, d.profile||{}),
    settings: Object.assign({}, def.settings, d.settings||{}),
    habits: { config: (d.habits&&d.habits.config&&d.habits.config.length)?d.habits.config:def.habits.config, logs:(d.habits&&d.habits.logs)||{} },
    foodLog: d.foodLog||{}, sportLog: d.sportLog||{}, water: d.water||{}, sleep: d.sleep||{}, steps: d.steps||{},
    weights: d.weights||[], customFoods: d.customFoods||[], favorites: d.favorites||[],
    xp: d.xp||0, unlockedBadges: d.unlockedBadges||[], customEntries: d.customEntries||[]
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

/* ===================== XP / Badges ===================== */
function addXp(n){
  DATA.xp += n;
  saveState();
  renderXp();
  checkBadges();
}
function levelInfo(){
  const lvl = Math.floor(DATA.xp/100)+1;
  const inLevel = DATA.xp%100;
  return {lvl, inLevel};
}
function renderXp(){
  const {lvl, inLevel} = levelInfo();
  document.getElementById('xpLabel').textContent = 'Niv. '+lvl;
  document.getElementById('lvlNum').textContent = lvl;
  document.getElementById('xpDetail').textContent = inLevel+' / 100 XP';
  document.getElementById('xpBar').style.width = inLevel+'%';
}
function checkBadges(){
  BADGE_DB.forEach(b=>{
    if(!DATA.unlockedBadges.includes(b.id) && b.check(DATA)){
      DATA.unlockedBadges.push(b.id);
      toast('🎉 Badge débloqué : '+b.name);
    }
  });
  saveState();
  renderBadges();
}
function habitStreak(d){
  let streak=0;
  let cur = new Date();
  while(true){
    const key = cur.getFullYear()+'-'+String(cur.getMonth()+1).padStart(2,'0')+'-'+String(cur.getDate()).padStart(2,'0');
    const log = d.habits.logs[key];
    if(log && Object.values(log).some(v=>v)){
      streak++;
      cur.setDate(cur.getDate()-1);
    } else break;
  }
  return streak;
}
function renderBadges(){
  const grid = document.getElementById('badgeGrid');
  grid.innerHTML = BADGE_DB.map(b=>{
    const unlocked = DATA.unlockedBadges.includes(b.id);
    return `<div class="badge-tile ${unlocked?'unlocked':''}"><div class="ico">${b.icon}</div><div class="nm">${b.name}</div></div>`;
  }).join('');
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

/* ===================== Calorie / macro calc ===================== */
function calcCalorieGoal(){
  const p = DATA.profile;
  let bmr;
  if(p.sex==='femme') bmr = 10*p.weightCurrent + 6.25*p.height - 5*p.age - 161;
  else bmr = 10*p.weightCurrent + 6.25*p.height - 5*p.age + 5;
  const factors = {sedentary:1.2, light:1.375, moderate:1.55, active:1.725, very_active:1.9};
  const tdee = bmr * (factors[p.activity]||1.55);
  const adj = {gain:300, lose:-500, maintain:0}[p.goal] || 0;
  return Math.round(tdee+adj);
}
function proteinGoal(){ return Math.round(DATA.profile.weightCurrent*1.8); }

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
  if(!wasOn) addXp(5); else { saveState(); renderXp(); checkBadges(); }
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

/* ===================== Food helpers / meal intelligence ===================== */
function localTimeNow(){
  const d=new Date();
  return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
}
function mealTypeForHour(hour){
  if(hour<10) return 'Petit-déjeuner';
  if(hour<15) return 'Déjeuner';
  if(hour<18) return 'Collation';
  if(hour<23) return 'Dîner';
  return 'Repas tardif';
}
function currentMealType(){ return mealTypeForHour(new Date().getHours()); }
function normalizeText(v){
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/œ/g,'oe');
}
function foodMatchFromText(text){
  const n=normalizeText(text);
  const aliases={
    'poulet':'Poulet (blanc, cuit)','riz':'Riz blanc cuit','riz blanc':'Riz blanc cuit','riz complet':'Riz complet cuit',
    'pates':'Pâtes cuites','pasta':'Pâtes cuites','pain':'Pain blanc','pain complet':'Pain complet','avoine':'Avoine (flocons)',
    'flocons avoine':'Avoine (flocons)','banane':'Banane','pomme':'Pomme','yaourt':'Yaourt nature','yaourt nature':'Yaourt nature',
    'fromage blanc':'Fromage blanc 0%','lait':'Lait demi-écrémé','amandes':'Amandes','beurre cacahuete':'Beurre de cacahuète',
    'saumon':'Saumon (cuit)','thon':'Thon (nature, conserve)','boeuf':'Bœuf haché 5%','lentilles':'Lentilles cuites',
    'pois chiches':'Pois chiches cuits','avocat':'Avocat','brocoli':'Brocoli (cuit)','patate douce':'Patate douce (cuite)',
    'pomme de terre':'Pomme de terre (cuite)','huile olive':'Huile d\'olive','tofu':'Tofu','whey':'Whey (poudre)',
    'chocolat noir':'Chocolat noir 70%','miel':'Miel','quinoa':'Quinoa cuit'
  };
  const hits=[];
  Object.keys(aliases).sort((a,b)=>b.length-a.length).forEach(alias=>{
    if(n.includes(alias)){
      const food=allFoods().find(f=>f.name===aliases[alias]);
      if(food && !hits.some(h=>h.food.name===food.name)){
        const safeAlias=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const before=new RegExp('(\\d+(?:[.,]\\d+)?)\\s*(kg|g|ml)\\b[^\\n,;]*'+safeAlias,'i').exec(n);
        const after=new RegExp(safeAlias+'[^\\n,;]*(\\d+(?:[.,]\\d+)?)\\s*(kg|g|ml)\\b','i').exec(n);
        let qty=100;
        if(before){ qty=parseFloat(before[1].replace(',','.'))||100; if(before[2].toLowerCase()==='kg') qty*=1000; }
        else if(after){ qty=parseFloat(after[1].replace(',','.'))||100; if(after[2].toLowerCase()==='kg') qty*=1000; }
        hits.push({food,qty});
      }
    }
  });
  return hits;
}
function addFreeTextMeal(){
  const input=document.getElementById('mealDescription');
  const text=(input.value||'').trim();
  if(!text){ toast('Décris simplement ce que tu as mangé'); return; }
  const hits=foodMatchFromText(text);
  const now=new Date();
  const time=localTimeNow();
  const type=mealTypeForHour(now.getHours());
  const mealId='m'+Date.now();
  if(!DATA.foodLog[TODAY]) DATA.foodLog[TODAY]=[];
  if(hits.length){
    hits.forEach((h,i)=>{
      const ratio=h.qty/100;
      DATA.foodLog[TODAY].push({
        id:mealId+'-'+i, mealId, name:h.food.name, qty:h.qty,
        kcal:Math.round(h.food.kcal*ratio), protein:Math.round((h.food.protein||0)*ratio*10)/10,
        carbs:Math.round((h.food.carbs||0)*ratio*10)/10, fat:Math.round((h.food.fat||0)*ratio*10)/10,
        time, mealType:type, note:text, source:'texte', timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'local'
      });
    });
    toast(`${type} ajouté · ${hits.length} aliment${hits.length>1?'s':''} reconnu${hits.length>1?'s':''}`);
  } else {
    DATA.foodLog[TODAY].push({id:mealId, mealId, name:text, qty:null, kcal:0, protein:0, carbs:0, fat:0, time, mealType:type, note:text, source:'note', timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'local'});
    toast(`${type} enregistré · ajoute les aliments pour calculer les calories`);
  }
  input.value='';
  saveState();
  closeSheet('foodSheetOverlay');
  renderAll();
}

/* ===================== Food ===================== */
function openFoodSheet(){
  pickedFood = null;
  document.getElementById('foodSearch').value='';
  if(document.getElementById('mealDescription')) document.getElementById('mealDescription').value='';
  if(document.getElementById('autoMealTypeLabel')) document.getElementById('autoMealTypeLabel').textContent=currentMealType().toLowerCase();
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
  checkBadges();
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
    time: localTimeNow(),
    mealType: currentMealType(),
    source: 'recherche',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone||'local'
  };
  if(!DATA.foodLog[TODAY]) DATA.foodLog[TODAY]=[];
  DATA.foodLog[TODAY].push(entry);
  saveState();
  closeSheet('foodSheetOverlay');
  toast('Aliment ajouté');
  addXp(5);
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
  const total = list.reduce((a,f)=>a+(Number(f.kcal)||0),0);
  const protein = list.reduce((a,f)=>a+(Number(f.protein)||0),0);
  const carbs = list.reduce((a,f)=>a+(Number(f.carbs)||0),0);
  const fat = list.reduce((a,f)=>a+(Number(f.fat)||0),0);
  document.getElementById('foodKcalTotal').textContent = Math.round(total);
  document.getElementById('foodBar').style.width = Math.min(100,(total/Math.max(kcalGoal,1))*100)+'%';
  document.getElementById('foodGoalLabel').textContent = 'Objectif : '+kcalGoal+' kcal';
  document.getElementById('macroSummary').textContent = `Protéines ${Math.round(protein)}g`;

  const card = document.getElementById('foodListCard');
  if(!list.length){
    card.innerHTML = emptyState('🍽️','Rien enregistré aujourd\'hui. Ajoute simplement ce que tu as mangé.');
    return;
  }
  const groups={};
  list.forEach(f=>{ const key=f.mealType||mealTypeForHour(parseInt((f.time||'12:00').split(':')[0],10)); (groups[key] ||= []).push(f); });
  const order=['Petit-déjeuner','Déjeuner','Collation','Dîner','Repas tardif'];
  card.innerHTML = order.filter(k=>groups[k]).map(k=>{
    const items=groups[k];
    const groupKcal=Math.round(items.reduce((a,f)=>a+(Number(f.kcal)||0),0));
    return `<div style="padding:4px 0 10px;"><div class="row" style="margin-bottom:5px;"><strong>${k}</strong><span class="muted small">${groupKcal?groupKcal+' kcal':'à compléter'}</span></div>`+
      items.map(f=>`<div class="item-row">
        <div class="item-ico">🍽️</div>
        <div class="item-main"><div class="item-title">${escapeHtml(f.name)}</div><div class="item-sub">${f.qty?escapeHtml(String(f.qty))+' g · ':''}${escapeHtml(f.time||'')} · ${f.source==='note'?'note libre':'enregistré'}</div></div>
        <div class="item-val">${f.kcal?Math.round(f.kcal)+' kcal':'—'}</div>
        <button class="item-del" onclick="removeFood('${f.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6"/></svg></button>
      </div>`).join('')+'</div>';
  }).join('');
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
  addXp(10);
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
  addXp(2);
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
  addXp(5);
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
  addXp(8);
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
  document.getElementById('profSub').textContent = `${p.age||'–'} ans · ${p.height||'–'} cm · ${goalLabel(p.goal)}`;
  document.getElementById('pf_name').value = p.name||'';
  document.getElementById('pf_age').value = p.age||'';
  document.getElementById('pf_sex').value = p.sex||'homme';
  document.getElementById('pf_height').value = p.height||'';
  document.getElementById('pf_weight').value = p.weightCurrent||'';
  document.getElementById('pf_goal').value = p.goal||'maintain';
  document.getElementById('pf_activity').value = p.activity||'moderate';
  document.getElementById('pf_target').value = p.weightTarget||'';
  document.getElementById('st_steps').value = DATA.settings.dailyStepGoal;
  document.getElementById('st_sport').value = DATA.settings.sportGoalMin;
  document.getElementById('st_water').value = DATA.settings.waterGoalMl;
  document.getElementById('st_cup').value = DATA.settings.waterCupMl;
  document.getElementById('themeToggle').textContent = DATA.settings.theme==='dark' ? 'Désactiver' : 'Activer';
}
function goalLabel(g){ return {gain:'Prise de masse', lose:'Perte de poids', maintain:'Maintien'}[g] || '–'; }
function saveProfile(){
  DATA.profile.name = document.getElementById('pf_name').value.trim() || 'Toi';
  DATA.profile.age = parseInt(document.getElementById('pf_age').value)||0;
  DATA.profile.sex = document.getElementById('pf_sex').value;
  DATA.profile.height = parseInt(document.getElementById('pf_height').value)||0;
  DATA.profile.weightCurrent = parseFloat(document.getElementById('pf_weight').value)||0;
  saveState();
  toast('Profil enregistré');
  renderAll();
}
function saveGoals(){
  DATA.profile.goal = document.getElementById('pf_goal').value;
  DATA.profile.activity = document.getElementById('pf_activity').value;
  DATA.profile.weightTarget = parseFloat(document.getElementById('pf_target').value)||0;
  DATA.settings.dailyStepGoal = parseInt(document.getElementById('st_steps').value)||10000;
  DATA.settings.sportGoalMin = parseInt(document.getElementById('st_sport').value)||30;
  DATA.settings.waterGoalMl = parseInt(document.getElementById('st_water').value)||2000;
  DATA.settings.waterCupMl = parseInt(document.getElementById('st_cup').value)||250;
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
function escapeHtml(v){ return String(v??"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function emptyState(icon, text){
  return `<div class="empty-state"><div style="font-size:30px;">${icon}</div><p>${text}</p></div>`;
}

/* ===================== Render all ===================== */
function renderAll(){
  renderHome();
  renderFood();
  renderSport();
  renderWater();
  loadSleepForm();
  renderWeightList();
  renderProfile();
  renderBadges();
  renderXp();
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

/* VitaTrack Sport — interface unifiée : exercices, séances et exécution */


(function(){
  const S = { q:"", difficulty:[], equipment:[], duration:[], body:[], type:[], zone:[], goal:[], favorite:false, openFamilies:new Set() };
  const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const E = () => window.EXERCISES || window.VITATRACK_EXERCISES || window.EXERCISES_CATALOG?.exercises || [];
  const favoriteIds = () => {
    if(typeof DATA==='undefined' || !DATA?.sport) return new Set();
    if(!Array.isArray(DATA.sport.favoriteExercises)) DATA.sport.favoriteExercises=[];
    return new Set(DATA.sport.favoriteExercises);
  };
  const isFavorite = id => favoriteIds().has(id);
  const labels = {
    facile:"Facile", moyen:"Moyen", difficile:"Difficile", variable:"Variable",
    none:"Sans matériel", halteres:"Haltères", barre:"Barre", elastiques:"Élastiques",
    kettlebell:"Kettlebell", machine:"Machine", trx:"TRX", banc:"Banc",
    court:"Court", long:"Long",
    renforcement:"Renforcement", calisthenie:"Calisthénie", hiit:"HIIT", cardio:"Cardio",
    mobilite:"Mobilité", recuperation:"Récupération",
    "flechisseurs-hanche":"Fléchisseurs de hanche", "corps complet":"Corps complet", tronc:"Tronc", pectoraux:"Pectoraux", dos:"Dos",
    epaules:"Épaules", bras:"Bras", abdominaux:"Abdos", jambes:"Jambes", fessiers:"Fessiers",
    biceps:"Biceps", triceps:"Triceps", quadriceps:"Quadriceps", obliques:"Obliques", lombaires:"Lombaires", mollets:"Mollets",
    "ischio-jambiers":"Ischio-jambiers", "avant-bras":"Avant-bras", "arriere-epaules":"Arrière d’épaules", "haut-dos":"Haut du dos", "haut-pectoraux":"Haut des pectoraux", hanches:"Hanches", chevilles:"Chevilles", "flechisseurs-hanche":"Fléchisseurs de hanche", "corps complet":"Corps complet"
  };
  const VARIANT_FAMILIES = new Set(['pushups','vertical_pushups','dips','bench_press','chest_fly','pullups','rows','deadlift','biceps','triceps','shoulder_press','shoulder_isolation','abs_flexion','leg_raises','planks','squats','lunges','hip_extension','glute_isolation','hamstrings','burpees','handstand','lsit','levers','planche_skill','single_leg_squat']);
  const label = v => labels[v] || v;
  const filterIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6.2 7.1v5.4l-3.6 1.8v-7.2L4 5z"/></svg>`;
  const zoneIcons = {
    cardio:`<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 26.2S6.2 20.6 6.2 13.2c0-3.7 4.3-5.4 9.8-1.6 5.5-3.8 9.8-2.1 9.8 1.6 0 7.4-9.8 13-9.8 13Z"/><path d="M8.6 16h4l1.8-3.7 3.1 7 1.7-3.3h4.2"/></svg>`,
    jambes:`<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M12.2 6.1c.4 4.3.1 8.2-1.1 12l-1.8 7.1"/><path d="M19.8 6.1c-.4 4.3-.1 8.2 1.1 12l1.8 7.1"/><path d="M9.3 25.2c2.1.1 3.5.8 4.3 2.3M22.7 25.2c-2.1.1-3.5.8-4.3 2.3"/><path d="M11.5 17.9h9"/></svg>`,
    bras:`<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8.1 23.4c3.3-.8 5.1-2.9 5.8-6.4.3-1.6 1.5-2.7 3-2.7 1.3 0 2.4.8 2.9 2l.7 1.8c.4.9 1.2 1.4 2.1 1.4H25c-.4 4.2-3.8 6.5-9.1 6.5h-5.2c-1.4 0-2.6-1.1-2.6-2.6Z"/><path d="M14.3 15.1 12 10.3l2.9-2.1 2.8 4.6"/></svg>`,
    dos:`<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M12.1 6.6c1 1 2.3 1.5 3.9 1.5s2.9-.5 3.9-1.5"/><path d="m11 8.5-2.1 4.8 2 12.2h10.2l2-12.2L21 8.5"/><path d="M16 8.8v16.7"/><path d="M12.6 12.4c.8 1.1 2 1.7 3.4 1.7s2.6-.6 3.4-1.7"/></svg>`,
    abdos:`<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11.2 6.1c1.3.9 2.9 1.4 4.8 1.4s3.5-.5 4.8-1.4l1.7 4.1-1.7 15.6h-9.6L9.5 10.2l1.7-4.1Z"/><path d="M13.2 11.2h5.6M13 15.3h6M13 19.4h6M16 9.1v15"/></svg>`,
    pectoraux:`<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11.3 6.4c1.3.9 2.8 1.3 4.7 1.3s3.4-.4 4.7-1.3l2.8 2.2-1.7 15.8H10.2L8.5 8.6l2.8-2.2Z"/><path d="M10.4 12.2c2-1.4 3.9-1.6 5.6-.1 1.7-1.5 3.6-1.3 5.6.1"/><path d="M16 11.3v5.3"/></svg>`,
    fullbody:`<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="6.1" r="2.4"/><path d="M16 8.8v8.2M10.8 12.5 16 9.8l5.2 2.7M12.5 26.1 16 17l3.5 9.1M10.2 20.2l4.2-5M21.8 20.2l-4.2-5"/></svg>`,
    mobilite:`<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="21.2" cy="6.4" r="2.2"/><path d="m19.6 9.3-4 4.5-5.2 1.8M15.6 13.8l4 4 5 1M15.6 13.8l-.8 7.4-4.8 5M19.6 17.8l.8 8"/></svg>`
  };
  const smallIcons = {
    burn:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c2.5 3.4 4.8 5.6 4.8 9.1A4.8 4.8 0 1 1 7.2 12c0-2.2 1.2-4.2 3.2-6 .1 2 .7 3 1.6 3.8C12.7 8 12.8 5.8 12 3Z"/></svg>`,
    muscle:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17c2.2-.8 3.4-2.5 3.8-5 .2-1.2 1.1-2 2.3-2 .9 0 1.7.5 2 1.3l.7 1.7c.3.7.9 1 1.6 1H20c0 3.8-2.9 6-7.2 6H6c-1.1 0-2-.9-2-2v-1Z"/><path d="M8.5 11 7 7.3 9.3 5.7l2.1 3.5"/></svg>`,
    endurance:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21S4 16.3 4 10.5C4 7.2 8 5.6 12 8.8c4-3.2 8-1.6 8 1.7C20 16.3 12 21 12 21Z"/><path d="M6.5 13h3l1.4-2.8 2.3 5.2 1.6-2.4h2.7"/></svg>`,
    none:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m7 17 10-10"/></svg>`,
    halteres:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4M6 8v8M9 10v4M15 10v4M18 8v8M21 10v4M9 12h6"/></svg>`,
    barre:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 11v2M5 8v8M8 10v4M16 10v4M19 8v8M22 11v2M8 12h8"/></svg>`
  };
  const zoneDefs = [
    ['cardio','Cardio'],['jambes','Jambes'],['bras','Bras'],['dos','Dos'],
    ['abdos','Abdos'],['pectoraux','Pectoraux'],['fullbody','Full body'],['mobilite','Mobilité']
  ];
  const goalDefs = [
    ['perte_poids','Perte de poids','burn'],['prise_muscle','Prise de muscle','muscle'],['endurance','Endurance','endurance']
  ];
  const zoneBodyMap = {
    jambes:['jambes','quadriceps','fessiers','ischio-jambiers'],
    bras:['bras','biceps','triceps'],
    dos:['dos'],
    abdos:['abdominaux','tronc'],
    pectoraux:['pectoraux'],
    fullbody:['corps complet']
  };
  function zoneMatches(x,z){
    const body=x.body_area||[], types=x.types||[];
    if(z==='cardio')return types.includes('cardio')||types.includes('hiit');
    if(z==='mobilite')return types.includes('mobilite')||types.includes('recuperation');
    return (zoneBodyMap[z]||[]).some(v=>body.includes(v));
  }
  function goalMatches(x,g){
    const types=x.types||[];
    if(g==='perte_poids')return types.includes('hiit')||types.includes('cardio');
    if(g==='prise_muscle')return types.includes('renforcement')||types.includes('calisthenie');
    if(g==='endurance')return types.includes('cardio')||types.includes('hiit');
    return true;
  }
  const zoneTile=(id,text)=>`<button class="exercise-zone-tile ${S.zone.includes(id)?'active':''}" onclick="exerciseZoneToggle('${id}')" aria-pressed="${S.zone.includes(id)?'true':'false'}"><span class="exercise-zone-icon">${zoneIcons[id]||''}</span><span>${text}</span></button>`;
  const goalChip=(id,text,icon)=>`<button class="exercise-filter exercise-filter-icon ${S.goal.includes(id)?'active':''}" onclick="exerciseGoalToggle('${id}')" aria-pressed="${S.goal.includes(id)?'true':'false'}"><span>${smallIcons[icon]||''}</span>${text}</button>`;
  function screen(){
    let el = document.getElementById("exerciseScreen");
    if(!el){
      el = document.createElement("div");
      el.id = "exerciseScreen";
      el.className = "exercise-screen";
      document.body.appendChild(el);
    }
    return el;
  }
  function filtered(){
    const q = S.q.trim().toLowerCase();
    return E().filter(x=>{
      const familyText=x.family?.label||x.familyLabel||'';
      if(q && !(`${x.name} ${familyText} ${(x.muscles||[]).join(" ")} ${(x.types||[]).join(" ")}`.toLowerCase().includes(q))) return false;
      if(S.favorite && !isFavorite(x.id)) return false;
      if(S.difficulty.length && !S.difficulty.includes(x.difficulty)) return false;
      if(S.equipment.length && !S.equipment.some(v=>(x.equipment||[]).includes(v))) return false;
      if(S.duration.length && !S.duration.includes(x.duration)) return false;
      if(S.body.length && !S.body.some(v=>(x.body_area||[]).includes(v))) return false;
      if(S.type.length && !S.type.some(v=>(x.types||[]).includes(v))) return false;
      if(S.zone.length && !S.zone.some(z=>zoneMatches(x,z))) return false;
      if(S.goal.length && !S.goal.some(g=>goalMatches(x,g))) return false;
      return true;
    });
  }
  function chips(items,key){
    return items.map(([v,t])=>`<button class="exercise-filter ${S[key].includes(v)?"active":""}" onclick="exerciseToggle('${key}','${v}')">${t}</button>`).join("");
  }
  function exerciseCard(x){
    const muscleText=(x.muscles||[]).map(label).join(" · ");
    const eq=(x.equipment||[]).length?x.equipment:['none'];
    const equipmentText=eq.map(label).join(" / ");
    return `<div class="exercise-card exercise-family-card" role="button" tabindex="0" aria-label="Commencer ${escapeHtml(x.name)}" onclick="exerciseStartIndividual(event,'${escapeHtml(x.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){exerciseStartIndividual(event,'${escapeHtml(x.id)}')}">
      <div class="exercise-card-icon">💪</div>
      <div class="exercise-card-main">
        <strong>${escapeHtml(x.name)}</strong>
        <small>${escapeHtml(muscleText)}</small>
        <div class="exercise-card-tags">
          <span class="exercise-card-tag">${escapeHtml(label(x.difficulty))}</span>
          <span class="exercise-card-tag">${escapeHtml(equipmentText)}</span>
          <span class="exercise-card-tag">${escapeHtml(label(x.duration))}</span>
        </div>
      </div>
      <button type="button" class="exercise-fav ${isFavorite(x.id)?"active":""}" aria-label="${isFavorite(x.id)?"Retirer des favoris":"Ajouter aux favoris"}" aria-pressed="${isFavorite(x.id)?"true":"false"}" onclick="exerciseFavorite(event,'${escapeHtml(x.id)}')">${isFavorite(x.id)?"♥":"♡"}</button>
    </div>`;
  }
  function familyGroups(list){
    const map=new Map();
    list.forEach(x=>{
      const fam=x.family || {id:x.familyId||'other_exercises',label:x.familyLabel||'Autres exercices',order:x.familyOrder||800};
      if(!map.has(fam.id))map.set(fam.id,{...fam,items:[]});
      map.get(fam.id).items.push(x);
    });
    return [...map.values()]
      .map(g=>({...g,items:g.items.sort((a,b)=>(Number(a.familyRank??100)-Number(b.familyRank??100))||(Number(a.difficultyScore||a.diff||3)-Number(b.difficultyScore||b.diff||3))||String(a.name).localeCompare(String(b.name),'fr'))}))
      .sort((a,b)=>(a.order||999)-(b.order||999)||String(a.label).localeCompare(String(b.label),'fr'));
  }
  const filtersActive=()=>S.favorite||S.difficulty.length||S.equipment.length||S.duration.length||S.body.length||S.type.length||S.goal.length;
  const activeFilterCount=()=>S.difficulty.length+S.equipment.length+S.goal.length+(S.favorite?1:0);
  function familyMarkup(list){
    const groups=familyGroups(list);
    if(!groups.length)return `<div class="exercise-empty">Aucun exercice ne correspond à ces filtres.</div>`;
    return groups.map(g=>{
      const forcedOpen=!!S.q.trim();
      const open=forcedOpen || S.openFamilies.has(g.id);
      const count=g.items.length;
      const favCount=g.items.filter(x=>isFavorite(x.id)).length;
      const scores=g.items.map(x=>Number(x.difficultyScore||x.diff||3)).filter(Number.isFinite);
      const range=scores.length&&Math.min(...scores)!==Math.max(...scores)&&VARIANT_FAMILIES.has(g.id)?'Du plus accessible au plus avancé':'';
      const noun=VARIANT_FAMILIES.has(g.id)?(count>1?'variantes':'variante'):(count>1?'exercices':'exercice');
      return `<section class="exercise-family ${open?'open':''}">
        <button type="button" class="exercise-family-head" onclick="exerciseToggleFamily('${escapeHtml(g.id)}')" aria-expanded="${open?'true':'false'}">
          <span class="exercise-family-head-main">
            <strong>${escapeHtml(g.label)}</strong>
            <small>${count} ${noun}${favCount?` · ♥ ${favCount}`:''}${range?` · ${range}`:''}</small>
          </span>
          <span class="exercise-family-chevron" aria-hidden="true">⌄</span>
        </button>
        <div class="exercise-family-body">${g.items.map(exerciseCard).join('')}</div>
      </section>`;
    }).join('');
  }
  function resultsMarkup(list){
    const groups=familyGroups(list);
    return `<div class="exercise-results-topline"><div class="exercise-results-count">${list.length} exercice${list.length>1?"s":""} · ${groups.length} famille${groups.length>1?'s':''}</div>${!S.q.trim()&&groups.length>1?`<button type="button" class="exercise-family-all" onclick="exerciseToggleAllFamilies()">${groups.every(g=>S.openFamilies.has(g.id))?'Tout fermer':'Tout ouvrir'}</button>`:''}</div>${familyMarkup(list)}`;
  }
  function renderResults(){
    const el = screen();
    const list = filtered();
    const results = el.querySelector(".exercise-results");
    if(!results) return;
    results.innerHTML = resultsMarkup(list);
  }
  function equipmentFilterOptions(){
    const order=['none','halteres','barre','kettlebell','elastiques','machine','banc','trx'];
    const available=new Set(E().flatMap(x=>Array.isArray(x.equipment)?x.equipment:[]));
    return order.filter(v=>available.has(v)).map(v=>[v,label(v)]);
  }
  function quickUpdate(mutator){
    const sc=screen().scrollTop;
    mutator();
    render();
    requestAnimationFrame(()=>{ screen().scrollTop = sc; });
  }
  function render(){
    const el=screen(), list=filtered(), activeCount=activeFilterCount();
    el.innerHTML=`
      <div class="exercise-header">
        <button class="exercise-back" onclick="closeExerciseLibrary()" aria-label="Retour">←</button>
        <input class="exercise-search" value="${escapeHtml(S.q)}" placeholder="Rechercher un exercice ou une famille…" oninput="exerciseSetSearch(this.value)">
        <button class="exercise-filter-open ${filtersActive()?"active":""}" onclick="exerciseFiltersToggle()" aria-label="Filtrer les exercices" aria-pressed="${filtersActive()?"true":"false"}">${filterIcon}${activeCount?`<span class="exercise-filter-badge">${activeCount}</span>`:''}</button>
      </div>
      <div class="exercise-quick-zones-section">
        <div class="exercise-quick-zones-head">
          <span>Zones du corps</span>
          ${S.zone.length?`<button type="button" class="exercise-quick-zones-clear" onclick="exerciseClearZones()">Effacer</button>`:''}
        </div>
        <div class="exercise-zone-grid">
          ${zoneDefs.map(([id,text])=>zoneTile(id,text)).join('')}
        </div>
      </div>
      <div class="exercise-results">${resultsMarkup(list)}</div>
      <div id="exerciseFilterBackdrop" class="exercise-filter-backdrop" onclick="exerciseFiltersToggle()"></div>
      <div id="exerciseFilterSheet" class="exercise-filter-panel" role="dialog" aria-modal="true" aria-label="Filtres des exercices">
        <div class="exercise-filter-handle" aria-hidden="true"></div>
        <div class="exercise-filter-head">
          <h2>Filtres</h2>
          <button type="button" class="exercise-filter-close" onclick="exerciseFiltersToggle()" aria-label="Fermer les filtres">×</button>
        </div>
        <div class="exercise-filter-scroll">
          <section class="exercise-filter-section exercise-favorite-section">
            <div class="exercise-filter-title">Affichage</div>
            <button type="button" class="exercise-favorite-only ${S.favorite?'active':''}" onclick="exerciseFavoriteFilter()" aria-pressed="${S.favorite?'true':'false'}">
              <span class="exercise-favorite-only-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 20.4S4.5 16 4.5 10.5C4.5 7.4 8.3 5.8 12 8.8c3.7-3 7.5-1.4 7.5 1.7 0 5.5-7.5 9.9-7.5 9.9Z"/></svg></span>
              <span class="exercise-favorite-only-copy"><strong>Favoris uniquement</strong><small>${favoriteIds().size} exercice${favoriteIds().size!==1?'s':''} enregistré${favoriteIds().size!==1?'s':''}</small></span>
              <span class="exercise-favorite-only-check" aria-hidden="true">✓</span>
            </button>
          </section>
          <section class="exercise-filter-section">
            <div class="exercise-filter-title">Objectif</div>
            <div class="exercise-filters exercise-filters-wrap">
              ${goalDefs.map(([id,text,icon])=>goalChip(id,text,icon)).join('')}
            </div>
          </section>
          <section class="exercise-filter-section">
            <div class="exercise-filter-title">Matériel</div>
            <div class="exercise-filters exercise-filters-wrap">
              ${equipmentFilterOptions().map(([v,t])=>`<button class="exercise-filter exercise-filter-icon ${S.equipment.includes(v)?"active":""}" onclick="exerciseToggle('equipment','${v}')" aria-pressed="${S.equipment.includes(v)?'true':'false'}"><span>${smallIcons[v]||''}</span>${t}</button>`).join('')}
            </div>
          </section>
          <section class="exercise-filter-section">
            <div class="exercise-filter-title">Difficulté</div>
            <div class="exercise-filters exercise-filters-wrap difficulty-filter-row">
              <button class="exercise-filter difficulty-chip ${S.difficulty.includes('facile')?'active':''}" onclick="exerciseToggle('difficulty','facile')"><span class="difficulty-stars">★</span>Débutant</button>
              <button class="exercise-filter difficulty-chip ${S.difficulty.includes('moyen')?'active':''}" onclick="exerciseToggle('difficulty','moyen')"><span class="difficulty-stars">★★</span>Intermédiaire</button>
              <button class="exercise-filter difficulty-chip ${S.difficulty.includes('difficile')?'active':''}" onclick="exerciseToggle('difficulty','difficile')"><span class="difficulty-stars">★★★</span>Avancé</button>
            </div>
          </section>
        </div>
        <div class="exercise-filter-actions"><button class="exercise-filter-reset" onclick="exerciseFiltersReset()"><span aria-hidden="true">↻</span> Réinitialiser</button><button class="exercise-filter-results" onclick="exerciseFiltersToggle()">Voir les résultats <span>${list.length}</span> <b aria-hidden="true">→</b></button></div>
      </div>`;
    el.classList.add("open");
    document.body.style.overflow="hidden";
  }
  window.openExerciseLibrary = render;
  window.closeExerciseLibrary = ()=>{screen().classList.remove("open");document.body.style.overflow="";};
  window.exerciseSetSearch = v=>{S.q = v;renderResults();};
  window.exerciseToggleFamily=id=>{
    if(S.openFamilies.has(id))S.openFamilies.delete(id);else S.openFamilies.add(id);
    renderResults();
  };
  window.exerciseToggleAllFamilies=()=>{
    const ids=familyGroups(filtered()).map(g=>g.id);
    const allOpen=ids.length&&ids.every(id=>S.openFamilies.has(id));
    if(allOpen)ids.forEach(id=>S.openFamilies.delete(id));else ids.forEach(id=>S.openFamilies.add(id));
    renderResults();
  };
  function reopenExerciseFilters(scrollTop=0){
    const panel=document.getElementById("exerciseFilterSheet"),back=document.getElementById("exerciseFilterBackdrop");
    panel?.classList.add("open","filter-refresh");back?.classList.add("open");
    requestAnimationFrame(()=>{const scroll=panel?.querySelector('.exercise-filter-scroll');if(scroll)scroll.scrollTop=scrollTop;});
  }
  function updateExerciseFilter(mutator,resetScroll=false){
    const scrollTop=resetScroll?0:(document.querySelector('#exerciseFilterSheet .exercise-filter-scroll')?.scrollTop||0);
    mutator();render();reopenExerciseFilters(scrollTop);
  }
  window.exerciseToggle = (k,v)=>updateExerciseFilter(()=>{const i=S[k].indexOf(v);if(i>=0)S[k].splice(i,1);else S[k].push(v);});
  window.exerciseZoneToggle = v=>quickUpdate(()=>{const i=S.zone.indexOf(v);if(i>=0)S.zone.splice(i,1);else S.zone.push(v);});
  window.exerciseClearZones = ()=>quickUpdate(()=>{S.zone=[];});
  window.exerciseGoalToggle = v=>updateExerciseFilter(()=>{const i=S.goal.indexOf(v);if(i>=0)S.goal.splice(i,1);else S.goal.push(v);});
  window.exerciseFavorite = (ev,id)=>{
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    if(typeof DATA==='undefined' || !DATA?.sport)return;
    const list=Array.isArray(DATA.sport.favoriteExercises)?DATA.sport.favoriteExercises:(DATA.sport.favoriteExercises=[]);
    const i=list.indexOf(id);
    if(i>=0) list.splice(i,1); else list.push(id);
    DATA.sport.favoriteExercises=[...new Set(list)];
    if(typeof saveState==='function') saveState();
    render();
  };
  window.exerciseStartIndividual = (ev,id)=>{
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    if(typeof window.openExerciseRun!=='function'){
      if(typeof toast==='function')toast('Impossible de lancer cet exercice');
      return;
    }
    let opened=false;
    try{opened=window.openExerciseRun(id)!==false;}catch(err){console.error('VitaTrack exercice individuel:',err);}
    const runnerOpen=document.getElementById('vtFluidRunner')?.classList.contains('open')||document.getElementById('exerciseRunScreen')?.classList.contains('open')||document.getElementById('vtRunScreen')?.classList.contains('open');
    if(opened||runnerOpen){
      screen().classList.remove('open');
      document.getElementById('exerciseFilterSheet')?.classList.remove('open');
      document.getElementById('exerciseFilterBackdrop')?.classList.remove('open');
      document.body.style.overflow='hidden';
    }else if(typeof toast==='function')toast('Impossible de lancer cet exercice');
  };
  window.toggleSportFavorite = id=>window.exerciseFavorite(null,id);
  window.exerciseFavoriteFilter = ()=>updateExerciseFilter(()=>{S.favorite=!S.favorite;});
  window.exerciseFiltersReset = ()=>updateExerciseFilter(()=>{S.difficulty=[];S.equipment=[];S.duration=[];S.body=[];S.type=[];S.zone=[];S.goal=[];S.favorite=false;},true);
  window.exerciseFiltersToggle = ()=>{const panel=document.getElementById("exerciseFilterSheet"),back=document.getElementById("exerciseFilterBackdrop");if(!panel)return;const open=!panel.classList.contains("open");if(open)panel.classList.remove("filter-refresh");panel.classList.toggle("open",open);back?.classList.toggle("open",open);};
})();


/* ============================================================
   Bibliothèque de séances
   ============================================================ */

(function(){
  const W = window.VITATRACK_WORKOUTS || [];
  let activeType = "Tous", activeLevel = "Tous";
  const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const E = id => (window.EXERCISES||window.VITATRACK_EXERCISES||window.EXERCISES_CATALOG?.exercises||[]).find(x=>x.id===id);
  const customWorkouts = () => Array.isArray(window.DATA?.sport?.customWorkouts)?window.DATA.sport.customWorkouts:[];
  const all = () => [...W,...customWorkouts()];
  window.sportAllWorkouts = all;
  window.getSportWorkoutById = id => all().find(x=>x.id===id)||null;
  function screen(){
    let el=document.getElementById("workoutScreen");
    if(!el){el=document.createElement("div");el.id="workoutScreen";el.className="workout-screen";document.body.appendChild(el);}
    return el;
  }
  function card(w){
    return `<div class="workout-card">
      <div class="workout-card-top">
        <div class="workout-icon">${w.icon||"🏋️"}</div>
        <div class="workout-main">
          <strong>${escapeHtml(w.title)}</strong>
          <small>${escapeHtml(w.desc||"")}</small>
          <div class="workout-meta">
            <span class="workout-tag green">${escapeHtml(w.cat||"")}</span>
            <span class="workout-tag">${escapeHtml(w.level||"")}</span>
            <span class="workout-tag">${w.time||"—"} min</span>
          </div>
        </div>
      </div>
      <div class="workout-ex-list">
        ${(w.ex||[]).map(a=>`<div class="workout-ex-line"><span>${escapeHtml(E(a[0])?.name||a[0])}</span><span>${a[1]} × ${escapeHtml(a[2])}</span></div>`).join("")}
      </div>
      <button class="workout-start" onclick="startWorkout('${escapeHtml(w.id)}')">Commencer</button>
      ${String(w.id||'').startsWith('custom-')?`<button class="workout-start" style="margin-top:7px;background:transparent;color:var(--ink-soft);border:1px solid var(--border)" onclick="deleteCustomWorkout('${escapeHtml(w.id)}')">Supprimer</button>`:''}
    </div>`;
  }
  const filtersActive=()=>activeType!=="Tous"||activeLevel!=="Tous";
  const filterIcon=`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6.2 7.1v5.4l-3.6 1.8v-7.2L4 5z"/></svg>`;
  function render(){
    const el=screen();
    const list=all().filter(w=>(activeType==="Tous"||w.cat===activeType)&&(activeLevel==="Tous"||w.level===activeLevel));
    const types=["Tous","Full body","Haut du corps","Bas du corps","Tronc","HIIT","Cardio","Mobilité","Express","Calisthénie","Renforcement"];
    const levels=["Tous","Débutant","Intermédiaire","Avancé","Tous niveaux"];
    el.innerHTML=`<div class="workout-header"><button class="workout-back" onclick="closeWorkoutLibrary()">←</button><h2>Entraînements</h2><div class="workout-header-actions"><button class="workout-filter-open ${filtersActive()?"active":""}" onclick="workoutFiltersToggle()" aria-label="Filtrer les entraînements" aria-pressed="${filtersActive()?"true":"false"}">${filterIcon}</button><button class="workout-add" onclick="openWorkoutBuilder()" aria-label="Créer un entraînement">+</button></div></div>
    <div class="workout-content">
      <p class="workout-intro">Choisis une séance prête à l’emploi ou compose la tienne avec les exercices de la bibliothèque.</p>
      <div class="workout-tabs"><button class="workout-tab active">Séances</button><button class="workout-tab" onclick="openWorkoutBuilder()">Créer mon entraînement</button></div>
      ${list.map(card).join("")||'<div class="workout-card">Aucune séance ne correspond aux filtres.</div>'}
    </div>
    <div id="workoutFilterBackdrop" class="exercise-filter-backdrop" onclick="workoutFiltersToggle()"></div>
    <div id="workoutFilterSheet" class="exercise-filter-panel workout-filter-panel">
      <div class="exercise-filter-title">Type d’entraînement</div>
      <div class="exercise-filters">${types.map(t=>`<button class="workout-chip ${t===activeType?"active":""}" onclick="setWorkoutType('${t}')">${t}</button>`).join("")}</div>
      <div class="exercise-filter-title">Niveau</div>
      <div class="exercise-filters">${levels.map(t=>`<button class="workout-chip ${t===activeLevel?"active":""}" onclick="setWorkoutLevel('${t}')">${t}</button>`).join("")}</div>
      <div class="exercise-filter-actions"><button class="exercise-filter-reset" onclick="resetWorkoutFilters()">Réinitialiser</button><button class="exercise-filter-results" onclick="workoutFiltersToggle()">Voir les résultats (${list.length})</button></div>
    </div>`;
    el.classList.add("open");document.body.style.overflow="hidden";
  }
  function reopenFilters(){
    document.getElementById("workoutFilterSheet")?.classList.add("open");
    document.getElementById("workoutFilterBackdrop")?.classList.add("open");
  }
  window.openWorkoutLibrary=render;
  window.closeWorkoutLibrary=()=>{screen().classList.remove("open");document.body.style.overflow="";};
  window.workoutFiltersToggle=()=>{
    const panel=document.getElementById("workoutFilterSheet"),back=document.getElementById("workoutFilterBackdrop");
    if(!panel)return;
    const open=!panel.classList.contains("open");
    panel.classList.toggle("open",open);back?.classList.toggle("open",open);
  };
  window.setWorkoutType=v=>{activeType=v;render();reopenFilters();};
  window.setWorkoutLevel=v=>{activeLevel=v;render();reopenFilters();};
  window.resetWorkoutFilters=()=>{activeType="Tous";activeLevel="Tous";render();reopenFilters();};
  window.openWorkoutBuilder=()=>{
    const el=screen(); window.__workoutBuilder=[];
    el.innerHTML=`<div class="workout-header"><button class="workout-back" onclick="openWorkoutLibrary()">←</button><h2>Créer</h2><div></div></div>
    <div class="workout-content"><div class="workout-builder">
      <label>Nom de l'entraînement</label><input id="wbName" placeholder="Ma séance">
      <div id="wbItems"></div>
      <select id="wbExercise"><option value="">+ Ajouter un exercice…</option>${(window.EXERCISES||window.VITATRACK_EXERCISES||window.EXERCISES_CATALOG?.exercises||[]).map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join("")}</select>
      <button class="workout-add-ex" onclick="wbAddExercise()">+ Ajouter l'exercice</button>
      <button class="workout-save" onclick="wbSave()">Enregistrer</button>
    </div></div>`;
    el.classList.add("open");document.body.style.overflow="hidden";
  };
  window.wbAddExercise=()=>{
    const id=document.getElementById("wbExercise")?.value;if(!id)return;
    window.__workoutBuilder.push({id,sets:3,reps:"10"});
    window.wbRender();
  };
  window.wbRender=()=>{
    const out=document.getElementById("wbItems");if(!out)return;
    out.innerHTML=window.__workoutBuilder.map((x,i)=>`<div class="builder-ex"><div class="builder-ex-name">${escapeHtml(E(x.id)?.name||x.id)}</div><input type="number" min="1" value="${x.sets}" onchange="__workoutBuilder[${i}].sets=Math.max(1,+this.value||1)"><input value="${escapeHtml(x.reps)}" onchange="__workoutBuilder[${i}].reps=this.value"><button onclick="__workoutBuilder.splice(${i},1);wbRender()">×</button></div>`).join("");
  };
  window.wbSave=()=>{
    const name=document.getElementById("wbName")?.value.trim();
    if(!name||!window.__workoutBuilder?.length)return alert("Ajoute un nom et au moins un exercice.");
    const w={id:"custom-"+Date.now(),title:name,cat:"Mes entraînements",level:"Personnalisé",time:Math.max(10,window.__workoutBuilder.length*5),icon:"✦",desc:"Entraînement personnalisé créé à partir de la bibliothèque.",eq:"Personnalisé",ex:window.__workoutBuilder.map(x=>[x.id,+x.sets,String(x.reps)])};
    DATA.sport=DATA.sport||{};DATA.sport.customWorkouts=Array.isArray(DATA.sport.customWorkouts)?DATA.sport.customWorkouts:[];DATA.sport.customWorkouts.push(w);if(typeof saveState==='function')saveState();render();
  };
  window.deleteCustomWorkout=id=>{
    const list=Array.isArray(DATA?.sport?.customWorkouts)?DATA.sport.customWorkouts:[];
    const w=list.find(x=>x.id===id);if(!w)return;
    if(!confirm(`Supprimer « ${w.title||'cet entraînement'} » ?`))return;
    DATA.sport.customWorkouts=list.filter(x=>x.id!==id);
    if(typeof saveState==='function')saveState();
    render();
  };
})();


/* ============================================================
   Exécution Sport
   Le runner fluide V4 ci-dessous est désormais l’unique moteur d’exécution.
   Les anciens runners V1/V3 ont été retirés pour éviter les redéfinitions
   de openExerciseRun/startWorkout et les conflits d’état.
   ============================================================ */


/* ============================================================
   VitaTrack Sport — Runner fluide v4 (prototype testable)
   Chrono global + countdown + swipe + formats Classique/HIIT/Tabata/EMOM/AMRAP
   ============================================================ */
(function(){
  let R=null, runnerTick=null, countdownTick=null, pendingWorkoutId=null, pendingFormat='classic';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const catalog=()=>window.VITATRACK_EXERCISES_V3||window.EXERCISES||window.VITATRACK_EXERCISES||window.EXERCISES_CATALOG?.exercises||[];
  const E=id=>catalog().find(x=>x.id===id)||null;
  const shell=(id,cls)=>{let el=document.getElementById(id);if(!el){el=document.createElement('div');el.id=id;el.className=cls;document.body.appendChild(el)}return el};
  const kindOf=x=>typeof window.sportPerformanceKind==='function'?window.sportPerformanceKind(x):(x?.measure==='time'?'time':x?.measure==='distance'?'distance':'reps');
  const history=()=>typeof window.getSportHistory==='function'?(window.getSportHistory()||[]):[];
  const today=()=>new Date().toISOString().slice(0,10);
  const num=(id,fallback=0)=>{const n=Number(String(document.getElementById(id)?.value??'').replace(',','.'));return Number.isFinite(n)?n:fallback};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function fmtClock(sec){sec=Math.max(0,Math.floor(Number(sec)||0));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`}
  function beep(){try{if(navigator.vibrate)navigator.vibrate(70);const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=820;g.gain.value=.055;o.start();o.stop(c.currentTime+.12)}catch(e){}}
  function stopAll(){if(runnerTick){clearInterval(runnerTick);runnerTick=null}if(countdownTick){clearInterval(countdownTick);countdownTick=null}}
  function elapsed(){return R?.startedAt?Math.max(0,(Date.now()-R.startedAt)/1000):0}
  function parsePlan(v){
    const s=String(v??'').trim().toLowerCase(),m=s.match(/[\d]+(?:[.,]\d+)?/),n=Number(m?.[0]?.replace(',','.'))||0;
    if(/\bmin\b/.test(s))return{kind:'time',seconds:Math.max(1,Math.round(n*60)),reps:0,text:String(v)};
    if(/\bs\b|sec|seconde/.test(s))return{kind:'time',seconds:Math.max(1,Math.round(n)),reps:0,text:String(v)};
    return{kind:'reps',seconds:0,reps:Math.max(1,Math.round(n||10)),text:String(v||10)};
  }
  function currentItem(){return R?.items?.[R.exerciseIndex]||null}
  function targetFor(item,setIdx=0){
    if(!item)return parsePlan(10);
    const raw=Array.isArray(item.targets)&&item.targets.length?(item.targets[setIdx]??item.targets[item.targets.length-1]):item.targetText;
    const p=parsePlan(raw),set=item.prescription?.sets?.[setIdx]||item.prescription?.sets?.[item.prescription?.sets?.length-1]||null;
    if(p.kind==='time')return{...p,targetLoadKg:Number(set?.targetLoadKg)||0,targetDistanceKm:Number(set?.targetDistanceKm)||0};
    if(item.kind==='time')return{kind:'time',seconds:item.targetSeconds||p.seconds||30,reps:0,text:raw||`${item.targetSeconds||30} s`,targetLoadKg:Number(set?.targetLoadKg)||0};
    return{kind:item.kind,reps:p.reps||item.targetReps||10,seconds:0,text:raw||String(item.targetReps||10),targetLoadKg:Number(set?.targetLoadKg)||0,targetDistanceKm:Number(set?.targetDistanceKm)||0};
  }
  function resultForIndex(i){const item=R.items[i];return R.results[i]||(R.results[i]={exerciseId:item.id,exerciseName:item.name,performanceKind:item.kind,prescription:item.prescription?JSON.parse(JSON.stringify(item.prescription)):null,plannedTargets:item.prescription?.sets?item.prescription.sets.map(x=>({...x})):[],plannedSets:item.sets,plannedRestSeconds:item.rest,plannedReps:[...(item.targets||[])],repsCompleted:[],durationsSeconds:[],performanceSets:[]})}
  function allExerciseEntries(activity){return activity?.type==='exercise'?[activity]:(activity?.exercises||[])}
  function previousBest(exerciseId,kind){
    let best=null,last=null;
    history().forEach(a=>allExerciseEntries(a).filter(e=>e.exerciseId===exerciseId).forEach(e=>{
      const sets=(e.performanceSets||[]).length?e.performanceSets:[e];
      sets.forEach(s=>{
        const reps=Number(s.reps??(e.repsCompleted||[])[0])||0,kg=Number(s.loadKg??e.loadKg)||0,dur=Number(s.durationSeconds??e.durationSeconds)||0,dist=Number(s.distanceKm??e.distanceKm)||0;
        let score=0,label='';
        if(kind==='load_reps'){score=kg*1000+reps;label=kg?`${reps} reps × ${kg.toLocaleString('fr-FR',{maximumFractionDigits:2})} kg`:`${reps} reps`;}
        else if(kind==='time'){score=dur;label=`${fmtClock(dur)}`;}
        else if(kind==='distance'){score=dist;label=`${dist.toLocaleString('fr-FR',{maximumFractionDigits:2})} km${dur?` · ${fmtClock(dur)}`:''}`;}
        else {score=reps;label=`${reps} reps`;}
        if(score>0){last={score,label,reps,kg,dur,dist};if(!best||score>best.score)best={score,label,reps,kg,dur,dist};}
      });
    }));
    return{best,last};
  }
  function techniqueHTML(x){
    if(!x)return'';
    const t=x.technique||{},rows=[];
    if(t.setup)rows.push(`<div><b>Placement</b><span>${esc(t.setup)}</span></div>`);
    if(t.execution||x.instr)rows.push(`<div><b>Exécution</b><span>${esc(t.execution||x.instr)}</span></div>`);
    if(t.breathing)rows.push(`<div><b>Respiration</b><span>${esc(t.breathing)}</span></div>`);
    const mistakes=Array.isArray(t.mistakes)&&t.mistakes.length?t.mistakes:(Array.isArray(x.mistakes)?x.mistakes:[]);
    if(mistakes.length)rows.push(`<div><b>À éviter</b><span>${mistakes.slice(0,3).map(esc).join(' · ')}</span></div>`);
    const secondary=x.muscleGroups?.secondary||x.secondary_muscles||x.musclesSec||[];
    if(Array.isArray(secondary)&&secondary.length)rows.push(`<div><b>Secondaires</b><span>${secondary.slice(0,5).map(esc).join(' · ')}</span></div>`);
    const prog=x.progression||x.variants||{},variantRows=[];
    const names=ids=>(Array.isArray(ids)?ids:[]).map(id=>E(id)?.name||id).filter(Boolean);
    const easier=names(prog.easier),harder=names(prog.harder),alt=names(prog.alternatives||prog.alt);
    if(easier.length)variantRows.push(`<div><b>Plus facile</b><span>${easier.slice(0,2).map(esc).join(' · ')}</span></div>`);
    if(harder.length)variantRows.push(`<div><b>Plus difficile</b><span>${harder.slice(0,2).map(esc).join(' · ')}</span></div>`);
    if(alt.length)variantRows.push(`<div><b>Alternative</b><span>${alt.slice(0,2).map(esc).join(' · ')}</span></div>`);
    if(!rows.length&&!variantRows.length)return'';
    return `<details class="vt-live-technique"><summary>ⓘ Technique & variantes</summary><div class="vt-tech-grid">${rows.join('')}${variantRows.length?`<div class="vt-tech-sep"></div>${variantRows.join('')}`:''}</div></details>`;
  }
  function itemFromWorkoutTuple(a){
    const x=E(a[0]);if(!x)return null;const p=parsePlan(a[2]);let kind=kindOf(x);if(p.kind==='time')kind='time';
    return{id:x.id,name:x.name,exercise:x,sets:Math.max(1,Number(a[1])||1),targets:Array.from({length:Math.max(1,Number(a[1])||1)},()=>String(a[2]??10)),targetText:String(a[2]??10),targetReps:p.reps,targetSeconds:p.seconds,kind,rest:60};
  }
  function itemsFromWorkout(w){return (w?.ex||[]).map(itemFromWorkoutTuple).filter(Boolean)}
  function itemFromProgramExercise(ex){
    const x=E(ex.exerciseId);if(!x)return null;
    const prescription=typeof window.prescriptionFromLegacy==='function'?window.prescriptionFromLegacy(x,ex):null;
    const targets=prescription?.targets?.length?[...prescription.targets]:(Array.isArray(ex.plannedReps)&&ex.plannedReps.length?[...ex.plannedReps]:[10]);
    const p=parsePlan(targets[0]);let kind=prescription?.metric||kindOf(x);if(p.kind==='time')kind='time';
    return{id:ex.exerciseId,name:ex.exerciseName||x?.name||ex.exerciseId,exercise:x,sets:Math.max(1,Number(prescription?.setCount)||Number(ex.plannedSets)||targets.length||1),targets,targetText:String(targets[0]??10),targetReps:p.reps,targetSeconds:p.seconds,kind,rest:Number(prescription?.restSeconds??ex.plannedRestSeconds)||0,prescription,programExercise:ex};
  }
  function newRunner(base){
    stopAll();R={...base,exerciseIndex:0,setIndex:0,intervalIndex:0,minuteIndex:0,roundsDone:0,extraExercises:0,results:base.items.map(()=>null),startedAt:null,stage:'intro',workStartedAt:null,workDeadline:null,restDeadline:null,formatDeadline:null,swipeStartX:null,swipeDx:0,feedbackQueue:[],feedbackAfter:null,feedbackExerciseIndex:null};
    renderIntro();
  }
  function runnerShell(){return shell('vtFluidRunner','vt-fluid-runner')}
  function topBar(title){return `<div class="vt-live-top"><button class="vt-live-icon" onclick="vtQuitRunner()">←</button><div class="vt-live-top-center"><strong>${esc(title)}</strong><span>${esc(formatLabel(R?.format))}</span></div><div class="vt-live-global">${R?.startedAt?fmtClock(elapsed()):'0:00'}</div></div>`}
  function formatLabel(f){return({classic:'Classique',hiit:'HIIT',tabata:'Tabata',emom:'EMOM',amrap:'AMRAP'})[f]||'Classique'}
  function introMeta(){
    if(R.format==='hiit')return `${R.config.work}s effort · ${R.config.rest}s repos · ${R.config.rounds} tours`;
    if(R.format==='tabata')return '20 s effort · 10 s repos · 8 intervalles';
    if(R.format==='emom')return `${R.config.minutes} min · départ chaque minute`;
    if(R.format==='amrap')return `${R.config.minutes} min · maximum de tours`;
    return `${R.items.reduce((n,x)=>n+x.sets,0)} séries · repos automatique`;
  }
  function renderIntro(){
    const el=runnerShell();let adapt='';
    if(R.source==='program')adapt=`<div class="vt-live-adapt"><button onclick="vtProgramAdjust('15 min max')">15 min max</button><button onclick="vtProgramAdjust('Pas de matériel')">Sans matériel</button><button onclick="vtProgramAdjust('Plus facile')">Plus facile</button><button onclick="vtProgramAdjust('Gêne / blessure')">Gêne</button></div>`;
    el.innerHTML=`${topBar(R.title)}<div class="vt-live-body"><div class="vt-live-kicker">PRÊT À COMMENCER</div><h1>${esc(R.title)}</h1><p class="vt-live-lead">${esc(introMeta())}</p>${adapt}<div class="vt-live-list">${R.items.slice(0,8).map((it,i)=>`<div><span>${i+1}</span><strong>${esc(it.name)}</strong><small>${esc(targetFor(it,0).text)}${R.format==='classic'?` · ${it.sets} série${it.sets>1?'s':''}`:''}</small></div>`).join('')}</div><button class="vt-live-start" onclick="vtRunnerStart()">Démarrer la séance</button><button class="vt-live-ghost" onclick="vtQuitRunner()">Annuler</button></div>`;
    el.classList.add('open');document.body.style.overflow='hidden';
  }
  window.vtProgramAdjust=label=>{
    if(!R||R.source!=='program'||typeof window.sportQuickAdjust!=='function')return;
    const id=R.sourceId;window.sportQuickAdjust(label,id);setTimeout(()=>window.openSession(id),80);
  };
  window.vtRunnerStart=()=>{
    if(!R)return;R.startedAt=Date.now();
    if(R.source==='program'){const s=DATA.sport?.currentProgram?.sessions?.find(x=>x.id===R.sourceId);if(s){s.status='in_progress';if(!s.startTime)s.startTime=new Date().toISOString();if(typeof saveState==='function')saveState();}}
    startTick();startCountdown();
  };
  function startTick(){if(runnerTick)clearInterval(runnerTick);runnerTick=setInterval(tick,200);tick()}
  function tick(){
    if(!R)return;const g=document.querySelector('#vtFluidRunner .vt-live-global');if(g)g.textContent=fmtClock(elapsed());updateOverallProgress();
    if(R.stage==='work'){
      if(R.format==='amrap'&&R.formatDeadline&&Date.now()>=R.formatDeadline){finishRunner();return}
      if(R.workDeadline){const rem=Math.max(0,(R.workDeadline-Date.now())/1000);const t=document.getElementById('vtLiveWorkClock');if(t)t.textContent=fmtClock(Math.ceil(rem));const b=document.getElementById('vtLiveWorkBar');if(b){const total=Math.max(1,(R.workDeadline-R.workStartedAt)/1000);b.style.width=`${clamp((1-rem/total)*100,0,100)}%`}if(rem<=0){completeWork(true);return}}
      if(R.format==='emom'&&R.minuteDeadline){const rem=Math.max(0,(R.minuteDeadline-Date.now())/1000);const t=document.getElementById('vtLiveMinuteClock');if(t)t.textContent=fmtClock(Math.ceil(rem));if(rem<=0){completeWork(true);return}}
      if(R.format==='amrap'){const t=document.getElementById('vtFormatRemaining');if(t)t.textContent=fmtClock(Math.ceil(Math.max(0,(R.formatDeadline-Date.now())/1000)))}
    }
    if(R.stage==='rest'&&R.restDeadline){const rem=Math.max(0,(R.restDeadline-Date.now())/1000);const t=document.getElementById('vtLiveRestClock');if(t)t.textContent=fmtClock(Math.ceil(rem));const b=document.getElementById('vtLiveRestBar');if(b){const total=Math.max(1,R.restSeconds||1);b.style.width=`${clamp((1-rem/total)*100,0,100)}%`}if(rem<=0){R.restDeadline=null;beep();startCountdown();}}
  }
  function startCountdown(){
    if(!R)return;if(countdownTick)clearInterval(countdownTick);R.stage='countdown';let n=3;const el=runnerShell();
    el.innerHTML=`${topBar(R.title)}<div class="vt-countdown-wrap"><div class="vt-countdown-progress">${progressHTML()}</div><div class="vt-live-kicker">${esc(stageLabel())}</div><div class="vt-countdown-label">${esc(currentItem()?.name||'')}</div><strong id="vtCountdownNumber">3</strong><span>Prépare-toi · ${esc(targetDisplay(currentItem(),R.setIndex))}</span></div>`;
    beep();countdownTick=setInterval(()=>{n--;const box=document.getElementById('vtCountdownNumber');if(n>0){if(box)box.textContent=n;beep();return}if(n===0){if(box)box.textContent='GO';beep();return}clearInterval(countdownTick);countdownTick=null;beginWork();},700);
  }
  function workTarget(){return targetFor(currentItem(),R.setIndex)}
  function beginWork(){
    if(!R)return;R.stage='work';R.workStartedAt=Date.now();R.workDeadline=null;R.minuteDeadline=null;
    const t=workTarget();
    if(R.format==='amrap'&&!R.formatDeadline)R.formatDeadline=Date.now()+R.config.minutes*60000;
    if(R.format==='hiit')R.workDeadline=Date.now()+R.config.work*1000;
    else if(R.format==='tabata')R.workDeadline=Date.now()+20000;
    else if(R.format==='emom')R.minuteDeadline=Date.now()+60000;
    else if(R.format==='classic'&&t.kind==='time')R.workDeadline=Date.now()+Math.max(1,t.seconds)*1000;
    renderWork();
  }
  function stageLabel(){
    if(R.format==='classic')return `Exercice ${R.exerciseIndex+1}/${R.items.length} · Série ${R.setIndex+1}/${currentItem().sets}`;
    if(R.format==='hiit')return `Intervalle ${R.intervalIndex+1}/${R.items.length*R.config.rounds}`;
    if(R.format==='tabata')return `Intervalle ${R.intervalIndex+1}/8`;
    if(R.format==='emom')return `Minute ${R.minuteIndex+1}/${R.config.minutes}`;
    return `Tour ${R.roundsDone+1} · Exercice ${R.exerciseIndex+1}/${R.items.length}`;
  }
  function overallProgress(){
    if(!R)return{done:0,total:1,pct:0,label:'0 %'};
    if(R.format==='classic'){
      const total=Math.max(1,R.items.reduce((n,it)=>n+(Number(it.sets)||1),0));
      const done=R.results.reduce((n,res)=>n+(res?.performanceSets?.length||0),0);
      return{done,total,pct:clamp(done/total*100,0,100),label:`${done}/${total} séries`};
    }
    if(R.format==='hiit'){
      const total=Math.max(1,R.items.length*R.config.rounds),done=Math.min(total,R.intervalIndex||0);
      return{done,total,pct:clamp(done/total*100,0,100),label:`${done}/${total} intervalles`};
    }
    if(R.format==='tabata'){
      const total=8,done=Math.min(total,R.intervalIndex||0);
      return{done,total,pct:clamp(done/total*100,0,100),label:`${done}/${total} intervalles`};
    }
    if(R.format==='emom'){
      const total=Math.max(1,Number(R.config.minutes)||1),done=Math.min(total,R.minuteIndex||0);
      return{done,total,pct:clamp(done/total*100,0,100),label:`${done}/${total} min`};
    }
    const total=Math.max(1,(Number(R.config.minutes)||1)*60),remaining=R.formatDeadline?Math.max(0,(R.formatDeadline-Date.now())/1000):total,done=Math.max(0,total-remaining);
    return{done,total,pct:clamp(done/total*100,0,100),label:`Tour ${R.roundsDone+1}`};
  }
  function progressHTML(){
    const p=overallProgress();
    return `<div class="vt-live-progress"><div><span>Progression</span><b id="vtLiveOverallLabel">${esc(p.label)}</b></div><div class="vt-live-progress-track"><i id="vtLiveOverallBar" style="width:${p.pct}%"></i></div></div>`;
  }
  function updateOverallProgress(){
    const p=overallProgress(),bar=document.getElementById('vtLiveOverallBar'),label=document.getElementById('vtLiveOverallLabel');
    if(bar)bar.style.width=`${p.pct}%`;if(label)label.textContent=p.label;
  }
  function targetDisplay(item,setIdx=0){
    const t=targetFor(item,setIdx),load=Number(t.targetLoadKg)||0;
    return `${t.text||`${t.reps||0} reps`}${item?.kind==='load_reps'&&load?` · ${load.toLocaleString('fr-FR',{maximumFractionDigits:2})} kg`:''}`;
  }
  function nextStepInfo(){
    if(!R)return null;
    const item=currentItem();if(!item)return null;
    if(R.format==='classic'){
      if(R.setIndex+1<item.sets)return{label:'PROCHAINE SÉRIE',title:item.name,meta:`Série ${R.setIndex+2}/${item.sets} · ${targetDisplay(item,R.setIndex+1)}`};
      const next=R.items[R.exerciseIndex+1];
      if(next)return{label:'PROCHAIN EXERCICE',title:next.name,meta:`${next.sets} série${next.sets>1?'s':''} · ${targetDisplay(next,0)}`};
      return{label:'ENSUITE',title:'Fin de la séance',meta:'Bilan et progression'};
    }
    if(R.format==='hiit'||R.format==='tabata'){
      const total=R.format==='tabata'?8:R.items.length*R.config.rounds,nextIndex=(R.intervalIndex+1)%R.items.length,next=R.items[nextIndex];
      return R.intervalIndex+1>=total?{label:'ENSUITE',title:'Fin du bloc',meta:'Bilan de la séance'}:{label:'PROCHAIN INTERVALLE',title:next?.name||'',meta:R.format==='tabata'?'20 s effort':'Nouvel effort'};
    }
    if(R.format==='emom'){
      const next=R.items[(R.minuteIndex+1)%R.items.length];return R.minuteIndex+1>=R.config.minutes?{label:'ENSUITE',title:'Fin du bloc',meta:'Bilan de la séance'}:{label:'PROCHAINE MINUTE',title:next?.name||'',meta:`Minute ${R.minuteIndex+2}/${R.config.minutes}`};
    }
    const next=R.items[(R.exerciseIndex+1)%R.items.length];return{label:'ENSUITE',title:next?.name||item.name,meta:'Continuer le tour'};
  }
  function nextStepHTML(){const n=nextStepInfo();return n?`<div class="vt-live-next"><span>${esc(n.label)}</span><strong>${esc(n.title)}</strong><small>${esc(n.meta)}</small></div>`:''}
  function renderWork(){
    const item=currentItem(),x=item.exercise||E(item.id),t=workTarget(),prev=previousBest(item.id,item.kind),tech=techniqueHTML(x);let main='';
    const timed=R.format==='hiit'||R.format==='tabata'||(R.format==='classic'&&t.kind==='time');
    if(timed){main=`<div class="vt-live-timer"><small>${R.format==='classic'?'TEMPS RESTANT':'EFFORT'}</small><strong id="vtLiveWorkClock">${fmtClock(R.format==='hiit'?R.config.work:R.format==='tabata'?20:t.seconds)}</strong><div><i id="vtLiveWorkBar"></i></div></div>`;}
    else if(R.format==='emom'){main=`<div class="vt-live-timer"><small>MINUTE EN COURS</small><strong id="vtLiveMinuteClock">1:00</strong><div><i></i></div></div>`;}
    else if(R.format==='amrap'){main=`<div class="vt-live-timer"><small>AMRAP RESTANT</small><strong id="vtFormatRemaining">${fmtClock(Math.ceil((R.formatDeadline-Date.now())/1000))}</strong><div><i style="width:100%"></i></div></div>`;}
    const showReps=item.kind==='reps'||item.kind==='load_reps'||R.format==='emom'||R.format==='amrap'||R.format==='hiit'||R.format==='tabata';
    const repsDefault=t.reps||item.targetReps||10,targetLoad=Number(t.targetLoadKg)||0,loadPrev=targetLoad||(prev.last?.kg||prev.best?.kg||'');
    const performance=`<div class="vt-live-performance">${showReps?`<label><span>Répétitions réalisées</span><input id="vtLiveReps" type="number" inputmode="numeric" min="0" step="1" value="${repsDefault}"></label>`:''}${item.kind==='load_reps'?`<label><span>Charge</span><div class="vt-live-input-unit"><input id="vtLiveLoad" type="number" inputmode="decimal" min="0" step="0.25" value="${loadPrev}"><b>kg</b></div></label>`:''}${item.kind==='distance'?`<label><span>Distance</span><div class="vt-live-input-unit"><input id="vtLiveDistance" type="number" inputmode="decimal" min="0" step="0.01" placeholder="${t.targetDistanceKm||'0,00'}"><b>km</b></div></label><label><span>Durée</span><div class="vt-live-input-unit"><input id="vtLiveDuration" type="number" inputmode="decimal" min="0" step="0.5" placeholder="30"><b>min</b></div></label>`:''}</div>`;
    const targetLabel=(t.text||`${t.reps} reps`)+(item.kind==='load_reps'&&targetLoad?` · ${targetLoad.toLocaleString('fr-FR',{maximumFractionDigits:2})} kg`:'');
    const historyBits=[prev.last?`<span>Dernière fois <b>${esc(prev.last.label)}</b></span>`:'',prev.best?`<span>Record <b>${esc(prev.best.label)}</b></span>`:''].filter(Boolean).join('');
    const historyHTML=historyBits?`<div class="vt-live-history">${historyBits}</div>`:'';
    const el=runnerShell();el.innerHTML=`${topBar(R.title)}<div class="vt-live-body">${progressHTML()}<div class="vt-live-kicker">${esc(stageLabel())}</div><h1 class="vt-live-exercise">${esc(item.name)}</h1><div class="vt-live-muscles">${esc((x?.muscles||x?.target_muscles||[]).join(' · '))}</div><div class="vt-live-objective"><span>OBJECTIF</span><strong>${esc(targetLabel)}</strong></div>${historyHTML}${main}${performance}${tech}${nextStepHTML()}<div class="vt-swipe" id="vtSwipeTrack"><div class="vt-swipe-fill" id="vtSwipeFill"></div><div class="vt-swipe-thumb" id="vtSwipeThumb">→</div><span>Glisser pour terminer</span></div><button class="vt-live-ghost compact" onclick="vtCompleteRunnerStep()">Valider sans glisser</button></div>`;
    installSwipe();
  }
  function readSet(){
    const item=currentItem(),t=workTarget(),set={format:R.format};
    const actualElapsed=R.workStartedAt?Math.max(0,(Date.now()-R.workStartedAt)/1000):0;
    if(item.kind==='distance'){set.distanceKm=Math.max(0,num('vtLiveDistance',0));set.durationSeconds=Math.max(0,Math.round(num('vtLiveDuration',0)*60));}
    else if(item.kind==='time'||(R.format==='hiit'||R.format==='tabata')){set.durationSeconds=Math.max(1,Math.round(actualElapsed));if(document.getElementById('vtLiveReps'))set.reps=Math.max(0,Math.round(num('vtLiveReps',t.reps||0)));}
    else {set.reps=Math.max(0,Math.round(num('vtLiveReps',t.reps||0)));if(item.kind==='load_reps')set.loadKg=Math.max(0,num('vtLiveLoad',0));}
    return set;
  }
  function storeSet(set){
    const item=currentItem(),res=resultForIndex(R.exerciseIndex);res.performanceSets.push(set);if(set.reps!=null)res.repsCompleted.push(set.reps);if(set.durationSeconds)res.durationsSeconds.push(set.durationSeconds);if(set.distanceKm)res.distanceKm=(res.distanceKm||0)+set.distanceKm;res.maxLoadKg=Math.max(0,...res.performanceSets.map(s=>Number(s.loadKg)||0)||0)||null;res.totalLoadVolume=res.performanceSets.reduce((n,s)=>n+(Number(s.reps)||0)*(Number(s.loadKg)||0),0)||null;
  }
  function exerciseResultSummary(index){
    const item=R?.items?.[index],res=R?.results?.[index];if(!item||!res)return'';const sets=res.performanceSets||[];
    if(item.kind==='load_reps'){const reps=sets.reduce((n,x)=>n+(Number(x.reps)||0),0),kg=Math.max(0,...sets.map(x=>Number(x.loadKg)||0));return `${sets.length} série${sets.length>1?'s':''} · ${reps} reps${kg?` · jusqu’à ${kg.toLocaleString('fr-FR',{maximumFractionDigits:2})} kg`:''}`;}
    if(item.kind==='time'){const sec=sets.reduce((n,x)=>n+(Number(x.durationSeconds)||0),0);return `${sets.length} série${sets.length>1?'s':''} · ${fmtClock(sec)}`;}
    if(item.kind==='distance'){const km=sets.reduce((n,x)=>n+(Number(x.distanceKm)||0),0);return `${km.toLocaleString('fr-FR',{maximumFractionDigits:2})} km`;}
    const reps=sets.reduce((n,x)=>n+(Number(x.reps)||0),0);return `${sets.length} série${sets.length>1?'s':''} · ${reps} reps`;
  }
  function applyExerciseFeedback(index,rpe,feedback){
    const res=R?.results?.[index];if(!res)return;res.difficulty=rpe||null;res.feedback=feedback||null;res.feedbackSkipped=false;(res.performanceSets||[]).forEach(set=>{if(rpe)set.rpe=rpe});
  }
  function renderExerciseFeedback(index,after){
    if(!R)return;const item=R.items[index],res=R.results[index];if(!item||!res){after?.();return}R.stage='feedback';R.feedbackExerciseIndex=index;R.feedbackAfter=after;const el=runnerShell();
    el.innerHTML=`${topBar(R.title)}<div class="vt-live-body">${progressHTML()}<div class="vt-summary-icon">✓</div><div class="vt-live-kicker">EXERCICE TERMINÉ</div><h1 class="vt-summary-title">${esc(item.name)}</h1><p class="vt-live-lead">${esc(exerciseResultSummary(index))}</p><div class="vt-live-feel"><span>COMMENT TU L’AS TROUVÉ ?</span><div>${[['Facile',3,'too_easy'],['Bien',6,'adapted'],['Difficile',8,'too_difficult'],['Échec',10,'failed']].map(([l,v,f])=>`<button onclick="vtSubmitExerciseFeedback(${v},'${f}')">${l}</button>`).join('')}</div></div><button class="vt-live-ghost compact" onclick="vtSkipExerciseFeedback()">Passer</button></div>`;
  }
  function runFeedbackAfter(){const fn=R?.feedbackAfter;if(R){R.feedbackAfter=null;R.feedbackExerciseIndex=null}if(typeof fn==='function')fn()}
  window.vtSubmitExerciseFeedback=(rpe,feedback)=>{if(!R)return;applyExerciseFeedback(R.feedbackExerciseIndex,Number(rpe)||null,feedback);runFeedbackAfter()};
  window.vtSkipExerciseFeedback=()=>{if(!R)return;const res=R.results?.[R.feedbackExerciseIndex];if(res)res.feedbackSkipped=true;runFeedbackAfter()};
  function promptRemainingFeedback(done){
    if(!R){done?.();return}const indexes=R.results.map((res,i)=>res&&res.performanceSets?.length&&!res.difficulty&&!res.feedbackSkipped?i:null).filter(i=>i!=null);if(!indexes.length){done?.();return}
    let pos=0;const next=()=>{if(pos>=indexes.length){done?.();return}const idx=indexes[pos++];renderExerciseFeedback(idx,next)};next();
  }
  window.vtCompleteRunnerStep=()=>completeWork(false);
  function completeWork(auto=false){
    if(!R||R.stage!=='work')return;R.stage='transition';const set=readSet();storeSet(set);beep();
    if(R.format==='classic'){
      const item=currentItem();if(R.setIndex+1<item.sets){R.setIndex++;startRest(item.rest);return}
      const finishedIndex=R.exerciseIndex;
      if(R.exerciseIndex+1<R.items.length){renderExerciseFeedback(finishedIndex,()=>{R.exerciseIndex++;R.setIndex=0;startRest(item.rest)});return}
      renderExerciseFeedback(finishedIndex,()=>finishRunner());return;
    }
    if(R.format==='hiit'||R.format==='tabata'){
      R.intervalIndex++;const total=R.format==='tabata'?8:R.items.length*R.config.rounds;if(R.intervalIndex>=total){finishRunner();return}R.exerciseIndex=R.intervalIndex%R.items.length;startRest(R.format==='tabata'?10:R.config.rest);return;
    }
    if(R.format==='emom'){
      const used=Math.max(0,(Date.now()-R.workStartedAt)/1000),rest=Math.max(0,60-used);R.minuteIndex++;if(R.minuteIndex>=R.config.minutes){finishRunner();return}R.exerciseIndex=R.minuteIndex%R.items.length;startRest(rest);return;
    }
    if(R.format==='amrap'){
      R.exerciseIndex++;if(R.exerciseIndex>=R.items.length){R.exerciseIndex=0;R.roundsDone++;}if(Date.now()>=R.formatDeadline){finishRunner();return}R.stage='work';R.workStartedAt=Date.now();renderWork();return;
    }
  }
  function startRest(seconds){
    R.stage='rest';R.restSeconds=Math.max(0,Math.round(seconds||0));R.restDeadline=Date.now()+R.restSeconds*1000;const next=currentItem(),sameClassic=R.format==='classic'&&R.setIndex>0,restLabel=sameClassic?'PROCHAINE SÉRIE':'PROCHAIN EXERCICE',restMeta=next?(sameClassic?`Série ${R.setIndex+1}/${next.sets} · ${targetDisplay(next,R.setIndex)}`:`${next.sets} série${next.sets>1?'s':''} · ${targetDisplay(next,0)}`):'';const el=runnerShell();
    el.innerHTML=`${topBar(R.title)}<div class="vt-rest-wrap">${progressHTML()}<div class="vt-live-kicker">RÉCUPÉRATION</div><strong id="vtLiveRestClock">${fmtClock(R.restSeconds)}</strong><div class="vt-rest-bar"><i id="vtLiveRestBar"></i></div><div class="vt-rest-next"><span>${esc(restLabel)}</span><b>${esc(next?.name||'')}</b><small>${esc(restMeta)}</small></div><div class="vt-rest-actions"><button onclick="vtRestAdd30()">+30 s</button><button onclick="vtSkipRunnerRest()">Passer</button></div></div>`;
    if(R.restSeconds<=0)startCountdown();
  }
  window.vtRestAdd30=()=>{if(!R||R.stage!=='rest')return;R.restSeconds+=30;R.restDeadline+=30000};
  window.vtSkipRunnerRest=()=>{if(!R||R.stage!=='rest')return;R.restDeadline=null;startCountdown()};
  function runnerSummaryStats(){
    const sets=R.results.filter(Boolean).flatMap(r=>r.performanceSets||[]),reps=sets.reduce((n,s)=>n+(Number(s.reps)||0),0),volume=sets.reduce((n,s)=>n+(Number(s.reps)||0)*(Number(s.loadKg)||0),0),distance=sets.reduce((n,s)=>n+(Number(s.distanceKm)||0),0);return{sets:sets.length,reps,volume,distance};
  }
  function newRecords(){
    const out=[];R.results.forEach((res,i)=>{if(!res)return;const item=R.items[i],before=previousBest(item.id,item.kind).best,sets=res.performanceSets||[];let score=0,label='';if(item.kind==='load_reps'){const kg=Math.max(0,...sets.map(s=>Number(s.loadKg)||0)),reps=Math.max(0,...sets.filter(s=>(Number(s.loadKg)||0)===kg).map(s=>Number(s.reps)||0));score=kg*1000+reps;label=`${reps} reps × ${kg.toLocaleString('fr-FR',{maximumFractionDigits:2})} kg`;}else if(item.kind==='time'){score=Math.max(0,...sets.map(s=>Number(s.durationSeconds)||0));label=fmtClock(score);}else if(item.kind==='distance'){score=sets.reduce((n,s)=>n+(Number(s.distanceKm)||0),0);label=`${score.toLocaleString('fr-FR',{maximumFractionDigits:2})} km`;}else{score=Math.max(0,...sets.map(s=>Number(s.reps)||0));label=`${score} reps`;}if(score>0&&(!before||score>before.score))out.push(`${item.name} · ${label}`)});return out;
  }
  function saveRunner(){
    const durationMinutes=Math.max(1,Math.round(elapsed()/60));
    if(R.source==='program'){
      const program=DATA.sport?.currentProgram,session=program?.sessions?.find(s=>s.id===R.sourceId);if(session){R.results.forEach((res,i)=>{if(!res)return;const dst=session.exercises?.find(e=>e.exerciseId===R.items[i].id)||session.exercises?.[i];if(dst)Object.assign(dst,res)});session.durationMinutes=durationMinutes;session.status='in_progress';session.score=typeof sportSessionScore==='function'?sportSessionScore(session):session.score;session.estimatedKcal=typeof sportKcalForSession==='function'?sportKcalForSession(session):session.estimatedKcal;if(typeof completeSession==='function')R.coachDecision=completeSession(R.sourceId);else if(typeof saveState==='function')saveState();}
    }else if(R.source==='individual'){
      const res=R.results[0]||resultForIndex(0),set=res.performanceSets[0]||{},entry={id:'exercise_'+Date.now(),type:'exercise',exerciseId:R.items[0].id,exerciseName:R.items[0].name,date:today(),mode:R.items[0].kind,difficulty:res.difficulty||set.rpe||null,feedback:res.feedback||null,status:'completed',performanceSets:res.performanceSets,repsCompleted:res.repsCompleted,durationsSeconds:res.durationsSeconds,distanceKm:res.distanceKm||null,loadKg:set.loadKg||null,durationSeconds:set.durationSeconds||null,challengeId:R.challengeId||null,challengeDay:R.challengeDay||null};if(typeof window.recordSportActivity==='function')window.recordSportActivity(entry);
    }else{
      const entry={id:'session_'+Date.now(),type:'workout',workoutId:R.sourceId,workoutName:R.title,date:today(),completedDate:today(),status:'completed',durationMinutes,format:R.format,exercises:R.results.filter(Boolean),amrapRounds:R.format==='amrap'?R.roundsDone:null,amrapExtraExercises:R.format==='amrap'?R.exerciseIndex:null,emomMinutes:R.format==='emom'?R.minuteIndex:null};if(typeof window.recordSportActivity==='function')window.recordSportActivity(entry);
    }
    if(typeof saveState==='function')saveState();
  }
  function formatRecordBeforeSave(){
    if(!R||!['amrap','emom'].includes(R.format)||R.source!=='workout')return null;
    let best=0;history().filter(a=>a.type==='workout'&&a.workoutId===R.sourceId&&a.format===R.format).forEach(a=>{
      const v=R.format==='amrap'?((Number(a.amrapRounds)||0)*100+(Number(a.amrapExtraExercises)||0)):(Number(a.emomMinutes)||0);if(v>best)best=v;
    });
    const current=R.format==='amrap'?(R.roundsDone*100+R.exerciseIndex):(R.minuteIndex||R.config.minutes||0);
    if(current>best)return R.format==='amrap'?`AMRAP · ${R.roundsDone} tour${R.roundsDone>1?'s':''}${R.exerciseIndex?` + ${R.exerciseIndex} exercice${R.exerciseIndex>1?'s':''}`:''}`:`EMOM · ${current} min`;
    return null;
  }
  function feedbackLabel(res){
    const f=String(res?.feedback||'').toLowerCase(),d=Number(res?.difficulty)||0;
    if(f==='too_easy'||(d>0&&d<=3))return{label:'Facile',cls:'easy'};
    if(f==='adapted'||(d>=4&&d<=7))return{label:'Bien',cls:'good'};
    if(f==='too_difficult'||(d>=8&&d<10))return{label:'Difficile',cls:'hard'};
    if(f==='failed'||d>=10)return{label:'Échec',cls:'failed'};
    return{label:'Non renseigné',cls:'none'};
  }
  function aggregatePerformance(entry,kind){
    const sets=Array.isArray(entry?.performanceSets)?entry.performanceSets:[];
    const reps=sets.reduce((n,x)=>n+(Number(x?.reps)||0),0)||(entry?.repsCompleted||[]).reduce((n,x)=>n+(Number(x)||0),0);
    const volume=sets.reduce((n,x)=>n+(Number(x?.reps)||0)*(Number(x?.loadKg)||0),0);
    const maxLoad=Math.max(0,...sets.map(x=>Number(x?.loadKg)||0),Number(entry?.loadKg)||0);
    const seconds=sets.reduce((n,x)=>n+(Number(x?.durationSeconds)||0),0)||(entry?.durationsSeconds||[]).reduce((n,x)=>n+(Number(x)||0),0)||Number(entry?.durationSeconds)||0;
    const distance=sets.reduce((n,x)=>n+(Number(x?.distanceKm)||0),0)||Number(entry?.distanceKm)||0;
    if(kind==='load_reps')return{value:volume||maxLoad,compareKind:volume?'volume':'load',reps,volume,maxLoad,sets:sets.length,text:maxLoad?`${maxLoad.toLocaleString('fr-FR',{maximumFractionDigits:2})} kg max · ${Math.round(volume).toLocaleString('fr-FR')} kg volume`:`${reps} reps`};
    if(kind==='time')return{value:seconds,compareKind:'time',seconds,sets:sets.length,text:`${fmtClock(seconds)}${sets.length>1?` · ${sets.length} séries`:''}`};
    if(kind==='distance')return{value:distance,compareKind:'distance',distance,sets:sets.length,text:`${distance.toLocaleString('fr-FR',{maximumFractionDigits:2})} km`};
    return{value:reps,compareKind:'reps',reps,sets:sets.length,text:`${reps} reps${sets.length>1?` · ${sets.length} séries`:''}`};
  }
  function previousExerciseAggregate(exerciseId,kind){
    const entries=[];
    history().forEach(a=>allExerciseEntries(a).forEach(e=>{if(e?.exerciseId===exerciseId)entries.push({e,a})}));
    if(!entries.length)return null;
    const last=entries[entries.length-1]?.e;
    return last?aggregatePerformance(last,kind):null;
  }
  function performanceComparison(item,res){
    const cur=aggregatePerformance(res,item.kind),prev=previousExerciseAggregate(item.id,item.kind);
    if(!prev||!prev.value||prev.compareKind!==cur.compareKind)return{direction:'first',label:'Première référence',previous:'',current:cur};
    const delta=cur.value-prev.value,tol=Math.max(.01,Math.abs(prev.value)*.005);
    if(Math.abs(delta)<=tol)return{direction:'same',label:'Stable',previous:prev.text,current:cur};
    let value='';
    if(cur.compareKind==='distance')value=`${Math.abs(delta).toLocaleString('fr-FR',{maximumFractionDigits:2})} km`;
    else if(cur.compareKind==='time')value=fmtClock(Math.abs(delta));
    else if(cur.compareKind==='volume')value=`${Math.round(Math.abs(delta)).toLocaleString('fr-FR')} kg volume`;
    else if(cur.compareKind==='load')value=`${Math.abs(delta).toLocaleString('fr-FR',{maximumFractionDigits:2})} kg`;
    else value=`${Math.round(Math.abs(delta))} reps`;
    return{direction:delta>0?'up':'down',label:`${delta>0?'+':'−'}${value}`,previous:prev.text,current:cur};
  }
  function exerciseSummaryCards(prs){
    const prNames=new Set((prs||[]).map(x=>String(x).split(' · ')[0]));
    return R.items.map((item,i)=>{
      const res=R.results[i];if(!res)return'';
      const cmp=performanceComparison(item,res),feel=feedbackLabel(res),icon=cmp.direction==='up'?'↗':cmp.direction==='down'?'↘':cmp.direction==='same'?'→':'•';
      const previous=cmp.previous?`<small>Avant : ${esc(cmp.previous)}</small>`:'<small>Cette séance devient ta référence.</small>';
      return `<div class="vt-summary-exercise"><div class="vt-summary-ex-head"><div><strong>${esc(item.name)}</strong><span>${esc(cmp.current.text)}</span></div>${prNames.has(item.name)?'<b class="vt-summary-pr">PR</b>':''}</div><div class="vt-summary-ex-meta"><span class="vt-summary-trend ${cmp.direction}">${icon} ${esc(cmp.label)}</span><span class="vt-summary-feel ${feel.cls}">${esc(feel.label)}</span></div>${previous}</div>`;
    }).join('');
  }
  function summaryTrendStats(){
    let up=0,down=0,same=0,first=0,feelSum=0,feelCount=0;
    R.items.forEach((item,i)=>{const res=R.results[i];if(!res)return;const c=performanceComparison(item,res);if(c.direction==='up')up++;else if(c.direction==='down')down++;else if(c.direction==='same')same++;else first++;const d=Number(res.difficulty);if(d>0){feelSum+=d;feelCount++;}});
    return{up,down,same,first,avgFeel:feelCount?Math.round(feelSum/feelCount*10)/10:null};
  }
  function coachSummaryBox(){
    const adaptations=R?.coachDecision?.adaptations||[];if(!adaptations.length)return'';
    const rows=adaptations.slice(0,4).map(a=>{
      const state=typeof window.sportExerciseProgressionState==='function'?window.sportExerciseProgressionState(a.exerciseId):null;
      const target=state?.nextPrescription?.targets?.length?state.nextPrescription.targets.join(' / '):'';
      const label=a.action==='progress'?'Progression':a.action==='reduce'?'Allégé':'Maintenu';
      const icon=a.action==='progress'?'↗':a.action==='reduce'?'↘':'→';
      return `<strong>${icon} ${esc(a.name||a.exerciseId)} · ${label}${target?` · ${esc(target)}`:''}</strong>`;
    }).join('');
    return `<div class="vt-pr-box vt-coach-summary"><span>🤖 COACH · PROCHAINE FOIS</span>${rows}</div>`;
  }
  function renderFinalSummary(){
    if(!R||R.stage==='summary')return;R.stage='summary';stopAll();const stats=runnerSummaryStats(),prs=newRecords(),formatPr=formatRecordBeforeSave(),trend=summaryTrendStats();if(formatPr)prs.unshift(formatPr);const exerciseCards=exerciseSummaryCards(prs);saveRunner();const el=runnerShell();
    const formatExtra=R.format==='amrap'?`<div class="vt-summary-special"><strong>${R.roundsDone}</strong><span>tours complets</span></div>`:R.format==='emom'?`<div class="vt-summary-special"><strong>${R.minuteIndex||R.config.minutes}</strong><span>minutes réalisées</span></div>`:'';
    const coachBox=coachSummaryBox(),trendLabel=trend.up?`${trend.up} progression${trend.up>1?'s':''}`:trend.first?`${trend.first} nouvelle${trend.first>1?'s':''} référence${trend.first>1?'s':''}`:'Séance consolidée';
    el.innerHTML=`${topBar(R.title)}<div class="vt-live-body"><div class="vt-summary-icon">✓</div><h1 class="vt-summary-title">Séance terminée</h1><p class="vt-live-lead">${esc(formatLabel(R.format))} · ${fmtClock(elapsed())}</p>${formatExtra}<div class="vt-summary-grid"><div><strong>${stats.sets}</strong><span>séries</span></div><div><strong>${stats.reps}</strong><span>reps</span></div><div><strong>${trend.avgFeel??'—'}</strong><span>effort /10</span></div></div><div class="vt-summary-highlight"><span>BILAN</span><strong>${esc(trendLabel)}${prs.length?` · ${prs.length} record${prs.length>1?'s':''}`:''}</strong><small>${trend.down?`${trend.down} exercice${trend.down>1?'s':''} sera allégé · `:''}${stats.volume?`${Math.round(stats.volume).toLocaleString('fr-FR')} kg de volume`:stats.distance?`${stats.distance.toLocaleString('fr-FR',{maximumFractionDigits:2})} km réalisés`:'Progression enregistrée'}</small></div>${exerciseCards?`<div class="vt-summary-section-title">Exercices</div><div class="vt-summary-exercises">${exerciseCards}</div>`:''}${prs.length?`<div class="vt-pr-box"><span>🏆 RECORD PERSONNEL</span>${prs.slice(0,3).map(x=>`<strong>${esc(x)}</strong>`).join('')}</div>`:''}${coachBox}<div class="vt-summary-actions"><button class="vt-live-ghost compact" onclick="vtOpenProgressFromSummary()">Voir ma progression</button><button class="vt-live-start" onclick="vtCloseRunner()">Terminer</button></div></div>`;
  }
  window.vtOpenProgressFromSummary=()=>{stopAll();runnerShell().classList.remove('open');document.body.style.overflow='';R=null;if(typeof window.openSportProgress==='function')setTimeout(()=>window.openSportProgress(),80)};
  function finishRunner(){
    if(!R||R.stage==='summary')return;stopAll();promptRemainingFeedback(renderFinalSummary);
  }
  window.vtCloseRunner=()=>{stopAll();runnerShell().classList.remove('open');document.body.style.overflow='';const challenge=R?.challengeId,ret=R?.returnToChallenge;R=null;if(challenge&&ret&&typeof window.openChallengeDetail==='function')setTimeout(()=>window.openChallengeDetail(challenge),80);if(typeof renderSport==='function')setTimeout(renderSport,80)};
  window.vtQuitRunner=()=>{if(!R){window.vtCloseRunner();return}if(R.stage==='summary'){window.vtCloseRunner();return}if(confirm('Quitter la séance ? Les performances de cette séance ne seront pas enregistrées.'))window.vtCloseRunner()};
  function installSwipe(){
    const track=document.getElementById('vtSwipeTrack'),thumb=document.getElementById('vtSwipeThumb'),fill=document.getElementById('vtSwipeFill');if(!track||!thumb)return;let start=0,dx=0,drag=false,max=0;
    const reset=()=>{thumb.style.transform='translateX(0px)';if(fill)fill.style.width='0px'};
    track.onpointerdown=e=>{drag=true;start=e.clientX;max=Math.max(1,track.clientWidth-thumb.clientWidth-8);track.setPointerCapture?.(e.pointerId)};
    track.onpointermove=e=>{if(!drag)return;dx=clamp(e.clientX-start,0,max);thumb.style.transform=`translateX(${dx}px)`;if(fill)fill.style.width=`${dx+thumb.clientWidth/2}px`};
    track.onpointerup=e=>{if(!drag)return;drag=false;if(dx>=max*.62){thumb.style.transform=`translateX(${max}px)`;setTimeout(()=>completeWork(false),80)}else reset();dx=0};track.onpointercancel=()=>{drag=false;dx=0;reset()};
  }

  /* ---- Choix du format pour les entraînements de bibliothèque ---- */
  function formatScreen(){return shell('vtFormatPicker','vt-format-picker')}
  function renderFormatPicker(){
    const el=formatScreen(),w=typeof window.getSportWorkoutById==='function'?window.getSportWorkoutById(pendingWorkoutId):null;if(!w)return;
    const cards=[['classic','Classique','Séries · répétitions · charge'],['hiit','HIIT','Temps de travail + récupération'],['tabata','Tabata','20 s / 10 s · 8 intervalles'],['emom','EMOM','Départ au début de chaque minute'],['amrap','AMRAP','Maximum de tours dans un temps donné']];
    let config='';if(pendingFormat==='hiit')config=`<div class="vt-format-config"><label>Travail <input id="vtFmtWork" type="number" value="40" min="10" max="180"> s</label><label>Repos <input id="vtFmtRest" type="number" value="20" min="5" max="180"> s</label><label>Tours <input id="vtFmtRounds" type="number" value="2" min="1" max="10"></label></div>`;if(pendingFormat==='emom'||pendingFormat==='amrap')config=`<div class="vt-format-config one"><label>Durée <input id="vtFmtMinutes" type="number" value="10" min="3" max="60"> min</label></div>`;
    el.innerHTML=`<div class="vt-format-top"><button onclick="vtCloseFormatPicker()">←</button><strong>Format de séance</strong><span></span></div><div class="vt-format-body"><h1>${esc(w.title)}</h1><p>Choisis comment tu veux réaliser cette séance.</p><div class="vt-format-cards">${cards.map(([id,t,s])=>`<button class="${pendingFormat===id?'active':''}" onclick="vtSelectWorkoutFormat('${id}')"><strong>${t}</strong><span>${s}</span></button>`).join('')}</div>${config}<button class="vt-live-start" onclick="vtLaunchSelectedWorkout()">Commencer · ${esc(formatLabel(pendingFormat))}</button></div>`;el.classList.add('open');document.body.style.overflow='hidden';
  }
  window.vtSelectWorkoutFormat=f=>{pendingFormat=f;renderFormatPicker()};
  window.vtCloseFormatPicker=()=>{formatScreen().classList.remove('open');document.body.style.overflow=''};
  window.vtLaunchSelectedWorkout=()=>{
    const w=typeof window.getSportWorkoutById==='function'?window.getSportWorkoutById(pendingWorkoutId):null;if(!w)return;const items=itemsFromWorkout(w);if(!items.length)return alert('Aucun exercice valide.');
    let config={};if(pendingFormat==='hiit')config={work:clamp(Math.round(num('vtFmtWork',40)),10,180),rest:clamp(Math.round(num('vtFmtRest',20)),5,180),rounds:clamp(Math.round(num('vtFmtRounds',2)),1,10)};else if(pendingFormat==='tabata')config={work:20,rest:10,intervals:8};else if(pendingFormat==='emom'||pendingFormat==='amrap')config={minutes:clamp(Math.round(num('vtFmtMinutes',10)),3,60)};
    window.vtCloseFormatPicker();newRunner({source:'workout',sourceId:w.id,title:w.title,format:pendingFormat,config,items});
  };
  window.startWorkout=id=>{pendingWorkoutId=id;pendingFormat='classic';renderFormatPicker()};

  /* ---- Programme du jour : préparation puis runner ---- */
  let preparedSessionId=null;
  function prepScreen(){
    let el=document.getElementById('vtSessionPrep');
    if(!el){el=document.createElement('div');el.id='vtSessionPrep';el.className='vt-session-prep';document.body.appendChild(el);}
    return el;
  }
  function swapScreen(){
    let el=document.getElementById('vtSessionSwap');
    if(!el){el=document.createElement('div');el.id='vtSessionSwap';el.className='vt-session-swap';document.body.appendChild(el);}
    return el;
  }
  function prepPrescription(item){
    const p=item?.prescription||{},targets=Array.isArray(p.targets)&&p.targets.length?p.targets:(Array.isArray(item?.plannedReps)?item.plannedReps:[]);
    const count=Math.max(1,Number(p.setCount)||Number(item?.plannedSets)||targets.length||1);
    const unique=[...new Set(targets.map(String))];
    let main='';
    if(targets.length){main=unique.length===1&&count>1?`${count} × ${unique[0]}`:targets.join(' · ')}
    else main=`${count} série${count>1?'s':''}`;
    const load=(p.sets||[]).map(x=>Number(x?.targetLoadKg)).find(v=>Number.isFinite(v)&&v>0);
    if(load)main+=` · ${load.toLocaleString('fr-FR',{maximumFractionDigits:1})} kg`;
    const rest=Math.max(0,Number(p.restSeconds??item?.plannedRestSeconds)||0);
    return{main,rest:rest?`Repos ${Math.round(rest)} s`:'Sans repos'};
  }
  function prepEquipment(ex){
    const labels={none:'Sans matériel',halteres:'Haltères',barre:'Barre',kettlebell:'Kettlebell',elastiques:'Élastiques',machine:'Machine',banc:'Banc',trx:'TRX'};
    const eq=Array.isArray(ex?.equipment)?ex.equipment:[];
    return eq.map(x=>labels[x]||x).join(' · ')||'Sans matériel';
  }
  function sessionHasRecordedPerformance(session){
    if(!session)return false;
    return (session.exercises||[]).some(item=>{
      if(Array.isArray(item?.performanceSets)&&item.performanceSets.length)return true;
      if(Array.isArray(item?.repsCompleted)&&item.repsCompleted.length)return true;
      if(Array.isArray(item?.durationsSeconds)&&item.durationsSeconds.length)return true;
      if(Number(item?.distanceKm)>0||Number(item?.totalLoadVolume)>0||Number(item?.maxLoadKg)>0)return true;
      return false;
    });
  }
  function renderSessionPreparation(sessionId){
    const s=DATA.sport?.currentProgram?.sessions?.find(x=>x.id===sessionId);if(!s)return;
    preparedSessionId=s.id;
    const el=prepScreen(),hasPerformance=sessionHasRecordedPerformance(s),editable=s.status!=='completed'&&!hasPerformance;
    const rows=(s.exercises||[]).map((item,i)=>{
      const x=E(item.exerciseId),plan=prepPrescription(item),family=x?.familyLabel||x?.family?.label||item.exerciseFamilyLabel||'Exercice';
      return `<div class="vt-prep-ex">
        <div class="vt-prep-num">${i+1}</div>
        <div class="vt-prep-main"><strong>${esc(item.exerciseName||x?.name||item.exerciseId)}</strong><small>${esc(family)} · ${esc(prepEquipment(x))}</small><div class="vt-prep-plan"><b>${esc(plan.main)}</b><span>${esc(plan.rest)}</span></div></div>
        ${editable?`<button class="vt-prep-swap" onclick="vtOpenSessionSwap('${esc(s.id)}',${i})" aria-label="Remplacer ${esc(item.exerciseName||x?.name||'exercice')}"><span aria-hidden="true">↻</span> Remplacer</button>`:`<span class="vt-prep-locked">Verrouillé</span>`}
      </div>`;
    }).join('');
    const muscles=typeof sportMuscles==='function'?sportMuscles(s):'Corps entier';
    el.innerHTML=`<div class="vt-prep-top"><button onclick="vtCloseSessionPreparation()">←</button><strong>Préparer la séance</strong><span></span></div>
      <div class="vt-prep-body">
        <div class="vt-prep-hero"><span class="vt-prep-kicker">PROGRAMME DU JOUR</span><h1>${esc(s.name||'Séance')}</h1><p>${(s.exercises||[]).length} exercices · ${Math.round(Number(s.targetDuration)||0)} min · ${esc(muscles)}</p></div>
        ${editable?`<div class="vt-prep-adjust"><button onclick="sportQuickAdjust('15 min max','${esc(s.id)}')">15 min max</button><button onclick="sportQuickAdjust('Pas de matériel','${esc(s.id)}')">Sans matériel</button><button onclick="sportQuickAdjust('Plus facile','${esc(s.id)}')">Plus facile</button><button onclick="sportQuickAdjust('Gêne / blessure','${esc(s.id)}')">Gêne</button></div>`:''}
        <div class="vt-prep-section-head"><strong>Exercices</strong>${editable?'<span>Tu peux les modifier avant de commencer</span>':hasPerformance?'<span>Séance commencée · remplacements verrouillés</span>':''}</div>
        <div class="vt-prep-list">${rows||'<p class="muted">Aucun exercice.</p>'}</div>
        ${s.originalPlan?`<button class="vt-prep-reset" onclick="vtResetSessionPreparation('${esc(s.id)}')">↶ Revenir à la séance d’origine</button>`:''}
        <button class="vt-prep-start" onclick="vtStartPreparedSession('${esc(s.id)}')">${s.status==='in_progress'?'▶ Reprendre la séance':'▶ Démarrer la séance'}</button>
        <p class="vt-prep-note">${editable?'Appuie sur « Remplacer » à droite d’un exercice pour choisir une variante compatible avec ton niveau et ton matériel.':'Les exercices ne peuvent plus être remplacés après l’enregistrement d’une performance.'}</p>
      </div>`;
    el.classList.add('open');document.body.style.overflow='hidden';
  }
  window.vtCloseSessionPreparation=()=>{prepScreen().classList.remove('open');swapScreen().classList.remove('open');document.body.style.overflow='';preparedSessionId=null};
  window.vtStartPreparedSession=sessionId=>{
    const s=DATA.sport?.currentProgram?.sessions?.find(x=>x.id===sessionId);if(!s)return;
    const items=(s.exercises||[]).map(itemFromProgramExercise).filter(Boolean);if(!items.length)return alert('Cette séance ne contient aucun exercice valide.');
    swapScreen().classList.remove('open');prepScreen().classList.remove('open');document.body.style.overflow='';
    newRunner({source:'program',sourceId:s.id,title:s.name||'Programme du jour',format:'classic',config:{},items});
  };
  window.vtOpenSessionSwap=(sessionId,index)=>{
    const session=DATA.sport?.currentProgram?.sessions?.find(s=>s.id===sessionId),item=session?.exercises?.[Number(index)],current=E(item?.exerciseId);if(!session||!item||!current)return;
    const candidates=typeof window.sportSessionReplacementCandidates==='function'?window.sportSessionReplacementCandidates(sessionId,index):[];
    const groups=[['family','Même famille'],['recommended','Variantes recommandées'],['alternative','Alternatives proches']];
    const body=groups.map(([key,title])=>{
      const list=candidates.filter(x=>x.group===key);if(!list.length)return'';
      return `<div class="vt-swap-group"><h3>${title}</h3>${list.map(c=>{const ex=E(c.id);return `<button class="vt-swap-row" onclick="vtChooseSessionSwap('${esc(sessionId)}',${Number(index)},'${esc(c.id)}')"><span><strong>${esc(c.name)}</strong><small>${esc(c.familyLabel||'')} · ${esc(c.difficulty||'')} · ${esc(prepEquipment(ex))}</small></span><i>›</i></button>`}).join('')}</div>`;
    }).join('');
    const el=swapScreen();el.innerHTML=`<div class="vt-prep-top"><button onclick="vtCloseSessionSwap()">←</button><strong>Remplacer l’exercice</strong><span></span></div><div class="vt-swap-body"><div class="vt-swap-current"><small>ACTUEL</small><strong>${esc(current.name)}</strong><span>${esc(current.familyLabel||current.family?.label||'')}</span></div>${body||'<div class="vt-swap-empty">Aucune variante compatible avec ton niveau et ton matériel.</div>'}</div>`;
    el.classList.add('open');
  };
  window.vtCloseSessionSwap=()=>swapScreen().classList.remove('open');
  window.vtChooseSessionSwap=(sessionId,index,newId)=>{
    if(typeof window.replaceSportSessionExercise!=='function')return;
    const r=window.replaceSportSessionExercise(sessionId,index,newId);if(r?.message&&typeof toast==='function')toast(r.message);
    swapScreen().classList.remove('open');renderSessionPreparation(sessionId);
  };
  window.vtResetSessionPreparation=sessionId=>{
    if(typeof resetSportSessionAdaptation==='function'&&resetSportSessionAdaptation(sessionId)){
      if(typeof toast==='function')toast('Séance d’origine restaurée');renderSessionPreparation(sessionId);
    }
  };
  window.openSession=sessionId=>renderSessionPreparation(sessionId);

  /* ---- Exercice individuel / défi : même runner, sans +1 ---- */
  window.openExerciseRun=(id,opts={})=>{
    const x=E(id);
    if(!x){
      console.warn('VitaTrack: exercice introuvable',id);
      if(typeof toast==='function')toast('Exercice introuvable');
      return false;
    }
    try{
      let kind=opts.mode==='time'?'time':opts.mode==='distance'?'distance':kindOf(x);
      const level=DATA.sport?.profile?.level||'intermediaire',objective=DATA.sport?.objectives?.primary||'condition_physique';
      let rawSets=null;
      if(Array.isArray(opts.sets)&&opts.sets.length)rawSets=opts.sets;
      else if(Number(opts.target)>0)rawSets=[Number(opts.target)];
      let prescription=null;
      if(typeof window.buildExercisePrescription==='function'){
        prescription=window.buildExercisePrescription(x,{metric:kind,sets:rawSets,setCount:rawSets?rawSets.length:1,restSeconds:opts.restSeconds??0,objective,level,source:opts.challengeId?'challenge':'individual'});
      }
      const targets=prescription?.targets?.length?[...prescription.targets]:[kind==='time'?`${Math.max(1,Math.round(Number(opts.target)||30))} s`:kind==='distance'?'Distance libre':String(Math.max(1,Math.round(Number(opts.target)||10)))];
      const p=parsePlan(targets[0]);
      const item={id:x.id,name:x.name,exercise:x,sets:Math.max(1,Number(prescription?.setCount)||targets.length),targets,targetText:targets[0],targetReps:p.reps,targetSeconds:p.seconds,kind:prescription?.metric||kind,rest:Number(prescription?.restSeconds??opts.restSeconds)||0,prescription};
      newRunner({source:'individual',sourceId:x.id,title:x.name,format:'classic',config:{},items:[item],challengeId:opts.challengeId||null,challengeDay:opts.challengeDay||null,returnToChallenge:!!opts.returnToChallenge});
      return true;
    }catch(err){
      console.error('VitaTrack runner individuel:',err);
      if(typeof toast==='function')toast('Impossible de lancer cet exercice');
      return false;
    }
  };
})();

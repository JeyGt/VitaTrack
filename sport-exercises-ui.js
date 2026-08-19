
(function(){
  const S = { q:"", difficulty:[], equipment:[], duration:[], body:[], type:[], favorite:false };
  const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const E = () => window.EXERCISES || window.VITATRACK_EXERCISES || window.EXERCISES_CATALOG?.exercises || [];
  const labels = {
    facile:"Facile", moyen:"Moyen", difficile:"Difficile", variable:"Variable",
    none:"Sans matériel", halteres:"Haltères", barre:"Barre", elastiques:"Élastiques",
    kettlebell:"Kettlebell", machine:"Machine", trx:"TRX",
    court:"Court", long:"Long",
    renforcement:"Renforcement", calisthenie:"Calisthénie", hiit:"HIIT", cardio:"Cardio",
    mobilite:"Mobilité", recuperation:"Récupération",
    "corps complet":"Corps complet", tronc:"Tronc", pectoraux:"Pectoraux", dos:"Dos",
    epaules:"Épaules", bras:"Bras", abdominaux:"Abdos", jambes:"Jambes", fessiers:"Fessiers"
  };
  const label = v => labels[v] || v;
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
      if(q && !(`${x.name} ${(x.muscles||[]).join(" ")} ${(x.types||[]).join(" ")}`.toLowerCase().includes(q))) return false;
      if(S.favorite && !x.favorite) return false;
      if(S.difficulty.length && !S.difficulty.includes(x.difficulty)) return false;
      if(S.equipment.length && !S.equipment.some(v=>(x.equipment||[]).includes(v))) return false;
      if(S.duration.length && !S.duration.includes(x.duration)) return false;
      if(S.body.length && !S.body.some(v=>(x.body_area||[]).includes(v))) return false;
      if(S.type.length && !S.type.some(v=>(x.types||[]).includes(v))) return false;
      return true;
    });
  }
  function chips(items,key){
    return items.map(([v,t])=>`<button class="exercise-filter ${S[key].includes(v)?"active":""}" onclick="exerciseToggle('${key}','${v}')">${t}</button>`).join("");
  }
  function renderResults(){
    const el = screen();
    const list = filtered();
    const results = el.querySelector(".exercise-results");
    if(!results) return;
    results.innerHTML = `
      <div class="exercise-results-count">${list.length} exercice${list.length>1?"s":""}</div>
      ${list.map(x=>`
        <div class="exercise-card" onclick="openExerciseRun('${escapeHtml(x.id)}')">
          <div class="exercise-card-icon">💪</div>
          <div class="exercise-card-main">
            <strong>${escapeHtml(x.name)}</strong>
            <small>${escapeHtml((x.muscles||[]).join(" · "))}</small>
            <div class="exercise-card-tags">
              <span class="exercise-card-tag">${escapeHtml(label(x.difficulty))}</span>
              <span class="exercise-card-tag">${x.is_bodyweight?"Sans matériel":escapeHtml((x.equipment||[]).map(label).join(", "))}</span>
              <span class="exercise-card-tag">${escapeHtml(label(x.duration))}</span>
            </div>
          </div>
          <button class="exercise-fav" onclick="event.stopPropagation();exerciseFavorite('${escapeHtml(x.id)}')">${x.favorite?"🔖":"♡"}</button>
        </div>`).join("") || `<div class="exercise-empty">Aucun exercice ne correspond à ces filtres.</div>`}`;
  }
  function render(){
    const el=screen(), list=filtered();
    el.innerHTML=`
      <div class="exercise-header">
        <button class="exercise-back" onclick="closeExerciseLibrary()">←</button>
        <input class="exercise-search" value="${escapeHtml(S.q)}" placeholder="Rechercher un exercice…" oninput="exerciseSetSearch(this.value)">
        <button class="exercise-filter-open" onclick="exerciseFiltersToggle()">☰</button>
      </div>
      <div class="exercise-results">
        <div class="exercise-results-count">${list.length} exercice${list.length>1?"s":""}</div>
        ${list.map(x=>`
          <div class="exercise-card" onclick="openExerciseRun('${escapeHtml(x.id)}')">
            <div class="exercise-card-icon">💪</div>
            <div class="exercise-card-main">
              <strong>${escapeHtml(x.name)}</strong>
              <small>${escapeHtml((x.muscles||[]).join(" · "))}</small>
              <div class="exercise-card-tags">
                <span class="exercise-card-tag">${escapeHtml(label(x.difficulty))}</span>
                <span class="exercise-card-tag">${x.is_bodyweight?"Sans matériel":escapeHtml((x.equipment||[]).map(label).join(", "))}</span>
                <span class="exercise-card-tag">${escapeHtml(label(x.duration))}</span>
              </div>
            </div>
            <button class="exercise-fav" onclick="event.stopPropagation();exerciseFavorite('${escapeHtml(x.id)}')">${x.favorite?"🔖":"♡"}</button>
          </div>`).join("") || `<div class="exercise-empty">Aucun exercice ne correspond à ces filtres.</div>`}
      </div>
      <div id="exerciseFilterBackdrop" class="exercise-filter-backdrop" onclick="exerciseFiltersToggle()"></div>
      <div id="exerciseFilterSheet" class="exercise-filter-panel">
        <div class="exercise-filter-title">Zone du corps</div>
        <div class="exercise-filters">
          ${chips([["corps complet","Corps complet"],["tronc","Tronc"],["pectoraux","Pectoraux"],["dos","Dos"],["epaules","Épaules"],["bras","Bras"],["abdominaux","Abdos"],["jambes","Jambes"],["fessiers","Fessiers"]],"body")}
        </div>
        <div class="exercise-filter-title">Type</div>
        <div class="exercise-filters">
          ${chips([["renforcement","Renforcement"],["calisthenie","Calisthénie"],["hiit","HIIT"],["cardio","Cardio"],["mobilite","Mobilité"],["recuperation","Récupération"]],"type")}
        </div>
        <div class="exercise-filter-title">Difficulté</div>
        <div class="exercise-filters">
          ${chips([["facile","Facile"],["moyen","Moyen"],["difficile","Difficile"]],"difficulty")}
        </div>
        <div class="exercise-filter-title">Favoris</div>
        <div class="exercise-filters"><button class="exercise-filter ${S.favorite?"active":""}" onclick="exerciseFavoriteFilter()">❤️ Favoris uniquement</button></div>
        <div class="exercise-filter-title">Durée</div>
        <div class="exercise-filters">
          ${chips([["court","Court"],["long","Long"]],"duration")}
        </div>
        <div class="exercise-filter-title">Matériel</div>
        <div class="exercise-filters">
          ${chips([["none","Sans matériel"],["halteres","Haltères"],["barre","Barre"],["elastiques","Élastiques"],["kettlebell","Kettlebell"],["machine","Machine"],["trx","TRX"]],"equipment")}
        </div>
        <div class="exercise-filter-actions"><button class="exercise-filter-reset" onclick="exerciseFiltersReset()">Réinitialiser</button><button class="exercise-filter-results" onclick="exerciseFiltersToggle()">Voir les résultats (${list.length})</button></div>
      </div>`;
    el.classList.add("open");
    document.body.style.overflow="hidden";
  }
  window.openExerciseLibrary = render;
  window.closeExerciseLibrary = ()=>{screen().classList.remove("open");document.body.style.overflow="";};
  window.exerciseSetSearch = v=>{
    S.q = v;
    renderResults();
  };
  window.exerciseToggle = (k,v)=>{const i=S[k].indexOf(v);if(i>=0)S[k].splice(i,1);else S[k].push(v);render();document.getElementById("exerciseFilterSheet")?.classList.add("open");document.getElementById("exerciseFilterBackdrop")?.classList.add("open");};
  window.exerciseFavorite = id=>{const x=E().find(e=>e.id===id);if(x){x.favorite=!x.favorite;render();}};
  window.exerciseFavoriteFilter = ()=>{S.favorite=!S.favorite;render();document.getElementById("exerciseFilterSheet")?.classList.add("open");document.getElementById("exerciseFilterBackdrop")?.classList.add("open");};
  window.exerciseFiltersReset = ()=>{S.difficulty=[];S.equipment=[];S.duration=[];S.body=[];S.type=[];S.favorite=false;render();document.getElementById("exerciseFilterSheet")?.classList.add("open");document.getElementById("exerciseFilterBackdrop")?.classList.add("open");};
  window.exerciseFiltersToggle = ()=>{const panel=document.getElementById("exerciseFilterSheet"),back=document.getElementById("exerciseFilterBackdrop");if(!panel)return;const open=!panel.classList.contains("open");panel.classList.toggle("open",open);back?.classList.toggle("open",open);};
})();

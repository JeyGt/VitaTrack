/* VitaTrack Sport — interface unifiée : exercices, séances et exécution */


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


/* ============================================================
   Bibliothèque de séances
   ============================================================ */

(function(){
  const W = window.VITATRACK_WORKOUTS || [];
  let custom = [];
  let activeType = "Tous", activeLevel = "Tous";
  try{ custom = JSON.parse(localStorage.getItem("vitatrack_custom_workouts_v1")||"[]"); }catch(e){}
  const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const E = id => (window.EXERCISES||window.VITATRACK_EXERCISES||window.EXERCISES_CATALOG?.exercises||[]).find(x=>x.id===id);
  const all = () => [...W,...custom];
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
    </div>`;
  }
  function render(){
    const el=screen();
    const list=all().filter(w=>(activeType==="Tous"||w.cat===activeType)&&(activeLevel==="Tous"||w.level===activeLevel));
    const types=["Tous","Full body","Haut du corps","Bas du corps","Tronc","HIIT","Cardio","Mobilité","Express","Calisthénie","Renforcement"];
    const levels=["Tous","Débutant","Intermédiaire","Avancé","Tous niveaux"];
    el.innerHTML=`<div class="workout-header"><button class="workout-back" onclick="closeWorkoutLibrary()">←</button><h2>Entraînements</h2><button class="workout-add" onclick="openWorkoutBuilder()">+</button></div>
    <div class="workout-content">
      <p class="workout-intro">Choisis une séance prête à l’emploi ou compose la tienne avec les exercices de la bibliothèque.</p>
      <div class="workout-tabs"><button class="workout-tab active">Séances</button><button class="workout-tab" onclick="openWorkoutBuilder()">Créer mon entraînement</button></div>
      <div class="workout-section-title">Type</div><div class="workout-filters">${types.map(t=>`<button class="workout-chip ${t===activeType?"active":""}" onclick="setWorkoutType('${t}')">${t}</button>`).join("")}</div>
      <div class="workout-section-title">Niveau</div><div class="workout-filters">${levels.map(t=>`<button class="workout-chip ${t===activeLevel?"active":""}" onclick="setWorkoutLevel('${t}')">${t}</button>`).join("")}</div>
      ${list.map(card).join("")||'<div class="workout-card">Aucune séance ne correspond aux filtres.</div>'}
    </div>`;
    el.classList.add("open");document.body.style.overflow="hidden";
  }
  window.openWorkoutLibrary=render;
  window.closeWorkoutLibrary=()=>{screen().classList.remove("open");document.body.style.overflow="";};
  window.setWorkoutType=v=>{activeType=v;render();};
  window.setWorkoutLevel=v=>{activeLevel=v;render();};
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
    custom.push(w);localStorage.setItem("vitatrack_custom_workouts_v1",JSON.stringify(custom));render();
  };
})();


/* ============================================================
   Exécution des exercices et séances
   ============================================================ */

(function(){
  let individual=null, workout=null, interval=null;
  const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const E=id=>(window.EXERCISES||window.VITATRACK_EXERCISES||window.EXERCISES_CATALOG?.exercises||[]).find(x=>x.id===id);
  const clear=()=>{clearInterval(interval);interval=null;};
  const setOverflow=v=>document.body.style.overflow=v;
  const shell=(id,cls)=>{let e=document.getElementById(id);if(!e){e=document.createElement("div");e.id=id;e.className=cls;document.body.appendChild(e);}return e;};
  const saveSportHistory=session=>{
    if(typeof window.recordSportActivity !== 'function'){
      console.error('VitaTrack Sport: source unique d’enregistrement indisponible.');
      return null;
    }
    return window.recordSportActivity(session);
  };
  const figure=`<div style="position:relative;width:120px;height:120px;color:var(--primary)"><i style="position:absolute;width:22px;height:22px;border:2px solid currentColor;border-radius:50%;left:49px;top:4px"></i><i style="position:absolute;width:5px;height:62px;background:currentColor;left:58px;top:29px;transform:rotate(18deg)"></i><i style="position:absolute;width:48px;height:4px;background:currentColor;left:58px;top:47px;transform:rotate(65deg)"></i><i style="position:absolute;width:48px;height:4px;background:currentColor;left:58px;top:47px;transform:rotate(145deg)"></i><i style="position:absolute;width:52px;height:4px;background:currentColor;left:58px;top:88px;transform:rotate(70deg)"></i><i style="position:absolute;width:52px;height:4px;background:currentColor;left:58px;top:88px;transform:rotate(115deg)"></i></div>`;

  window.openExerciseRun=id=>{
    const x=E(id); if(!x)return alert("Exercice introuvable.");
    clear();
    const timed=x.measure==='time';
    individual={exercise:x,mode:timed?'time':'reps',reps:0,target:timed?30:10,elapsed:0,remaining:timed?30:0,start:new Date().toISOString()};
    const el=shell("vtExerciseRun","vt-run-screen");
    el.innerHTML=`<div class="vt-run-top"><button class="vt-run-btn" onclick="closeExerciseRun()">←</button><div class="vt-run-title">EXERCICE</div><div></div></div>
    <div class="vt-run-content"><div class="vt-run-step">Exercice individuel</div><div class="vt-run-visual">${figure}</div>
    <div class="vt-run-name">${escapeHtml(x.name)}</div><div class="vt-run-meta">${escapeHtml((x.muscles||x.target_muscles||[]).join(" · "))}</div>
    <div class="vt-run-target"><div class="vt-run-label">${timed?'DURÉE':'RÉPÉTITIONS'}</div><div class="vt-run-big" id="indRep">${timed?'00:30':'0 / 10'}</div><div class="vt-run-sub">${timed?'Objectif de la série':'Objectif de la série'}</div></div>
    <div class="vt-run-progress"><span id="indProg" style="width:0%"></span></div>
    ${timed?`<button class="vt-run-primary" id="indTimeBtn" onclick="toggleIndividualTimer()">▶ Démarrer</button>`:`<button class="vt-run-primary" onclick="individualRep()">+ 1 répétition</button>`}
    <button class="vt-run-secondary" onclick="finishExerciseRun()">✓ Terminer la série</button>
    <button class="vt-run-secondary" onclick="closeExerciseRun()">Quitter</button></div>`;
    el.classList.add("open");setOverflow("hidden");
    if(timed) updateIndividualTime();
  };
  window.individualRep=()=>{
    if(!individual||individual.mode!=='reps')return;
    individual.reps++;
    const n=document.getElementById("indRep"),bar=document.getElementById("indProg");
    if(n)n.textContent=`${individual.reps} / ${individual.target}`;
    if(bar)bar.style.width=Math.min(100,individual.reps/individual.target*100)+"%";
  };
  window.toggleIndividualTimer=()=>{
    if(!individual||individual.mode!=='time')return;
    if(interval){clear();document.getElementById('indTimeBtn')?.replaceChildren(document.createTextNode('▶ Reprendre'));return;}
    const btn=document.getElementById('indTimeBtn'); if(btn)btn.textContent='Ⅱ Pause';
    interval=setInterval(()=>{
      individual.elapsed++; individual.remaining=Math.max(0,individual.target-individual.elapsed); updateIndividualTime();
      if(individual.remaining<=0){clear(); finishExerciseRun(true);}
    },1000);
  };
  function updateIndividualTime(){
    if(!individual)return;
    const n=document.getElementById('indRep'),bar=document.getElementById('indProg');
    if(n){const s=Math.max(0,individual.remaining);n.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
    if(bar)bar.style.width=Math.min(100,individual.elapsed/individual.target*100)+"%";
  }
  window.finishExerciseRun=(auto=false)=>{
    if(!individual)return;
    clear();
    const x=individual.exercise;
    const value=individual.mode==='time'?individual.elapsed:individual.reps;
    const el=shell("vtExerciseRun","vt-run-screen");
    el.innerHTML=`<div class="vt-run-top"><div></div><div class="vt-run-title">TERMINÉ</div><div></div></div><div class="vt-run-content"><div class="vt-run-complete"><div style="font-size:44px">✓</div><h1>Bien joué !</h1><p>${escapeHtml(x.name)}</p><div class="vt-run-result"><strong>${individual.mode==='time'?`${Math.floor(value/60)} min ${value%60}s`:`${value} répétition${value>1?'s':''}`}</strong><span>Réalisé</span></div><div class="vt-run-difficulty"><div class="vt-run-label">DIFFICULTÉ RESSENTIE</div><div class="vt-diff-row">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button type="button" data-diff="${n}" onclick="setExerciseDifficulty(${n})">${n}</button>`).join('')}</div></div><button class="vt-run-primary" id="finishExerciseSave" disabled onclick="saveExerciseRun()">Enregistrer</button></div></div>`;
    el.classList.add("open");setOverflow("hidden");
    individual.result=value; individual.difficulty=null;
  };
  window.setExerciseDifficulty=n=>{if(!individual)return;individual.difficulty=n;document.querySelectorAll('.vt-diff-row button').forEach(b=>b.classList.toggle('selected',Number(b.dataset.diff)===n));const b=document.getElementById('finishExerciseSave');if(b)b.disabled=false;};
  window.saveExerciseRun=()=>{
    if(!individual)return;
    const x=individual.exercise, value=individual.result??(individual.mode==='time'?individual.elapsed:individual.reps);
    saveSportHistory({id:"exercise_"+Date.now(),type:"exercise",exerciseId:x.id,exerciseName:x.name,date:new Date().toISOString().slice(0,10),mode:individual.mode,repsCompleted:individual.mode==='reps'?[value]:[],durationSeconds:individual.mode==='time'?value:null,difficulty:individual.difficulty,feedback:null,status:"completed"});
    closeExerciseRun();
  };
  window.closeExerciseRun=()=>{clear();shell("vtExerciseRun","vt-run-screen").classList.remove("open");setOverflow("");individual=null;};

  function normaliseWorkout(w){
    return (w?.ex||[]).map(a=>({id:a[0],sets:Number(a[1]||1),plannedReps:String(a[2]??"10"),rest:60})).filter(x=>E(x.id));
  }
  window.startWorkout=id=>{
    const w=(window.VITATRACK_WORKOUTS||[]).find(x=>x.id===id);
    if(!w)return alert("Entraînement introuvable.");
    const items=normaliseWorkout(w); if(!items.length)return alert("Cet entraînement ne contient aucun exercice valide.");
    clear();
    workout={id:w.id,title:w.title,targetDuration:w.time||null,items,exerciseIndex:0,setIndex:0,doneSets:0,start:new Date().toISOString(),sessionExercises:items.map(x=>({exerciseId:x.id,exerciseName:E(x.id)?.name,plannedReps:[x.plannedReps],plannedSets:x.sets,plannedRestSeconds:x.rest,repsCompleted:[],difficulty:null,feedback:null}))};
    renderWorkout();
  };
  function renderWorkout(){
    clear();
    const s=workout,it=s.items[s.exerciseIndex],x=E(it.id);
    const total=s.items.reduce((n,a)=>n+a.sets,0),pct=total?Math.round(s.doneSets/total*100):0;
    const el=shell("vtWorkoutRun","vt-ws");
    el.innerHTML=`<div class="vt-ws-top"><button class="vt-ws-btn" onclick="quitWorkout()">←</button><div class="vt-ws-title">${escapeHtml(s.title)}</div><div></div></div>
      <div class="vt-ws-body"><div class="vt-ws-bar"><span style="width:${pct}%"></span></div>
      <div class="vt-ws-step">Exercice ${s.exerciseIndex+1}/${s.items.length} · Série ${s.setIndex+1}/${it.sets}</div>
      <div class="vt-ws-visual">${figure}</div><div class="vt-ws-name">${escapeHtml(x.name)}</div>
      <div class="vt-ws-meta">${escapeHtml((x.muscles||[]).join(" · "))}</div>
      <div class="vt-ws-card"><div class="vt-ws-label">OBJECTIF</div><div class="vt-ws-big">${escapeHtml(it.plannedReps)}</div><div class="vt-ws-small">Repos : ${it.rest}s</div></div>
      <button class="vt-ws-primary" onclick="workoutSeriesDone()">✓ Série terminée</button>
      <button class="vt-ws-secondary" onclick="quitWorkout()">Quitter</button></div>`;
    el.classList.add("open");setOverflow("hidden");
  }
  window.workoutSeriesDone=()=>{
    if(!workout)return;
    const item=workout.items[workout.exerciseIndex];
    const se=workout.sessionExercises[workout.exerciseIndex];
    se.repsCompleted.push(String(item.plannedReps));
    workout.doneSets++;
    if(workout.setIndex+1<item.sets){
      workout.setIndex++;
      renderRest(item.rest);
      return;
    }
    if(workout.exerciseIndex+1<workout.items.length){
      workout.exerciseIndex++;
      workout.setIndex=0;
      renderRest(item.rest);
      return;
    }
    finishWorkout();
  };
  function renderRest(seconds){
    const el=shell("vtWorkoutRun","vt-ws");
    let remaining=seconds||0;
    el.innerHTML=`<div class="vt-ws-top"><div></div><div class="vt-ws-title">REPOS</div><div></div></div><div class="vt-ws-body"><div class="vt-ws-rest"><div class="vt-ws-label">RÉCUPÉRATION</div><strong id="restValue">${remaining}</strong><div>secondes</div></div><button class="vt-ws-primary" onclick="skipRest()">Passer le repos</button><button class="vt-ws-secondary" onclick="quitWorkout()">Quitter</button></div>`;
    el.classList.add("open");setOverflow("hidden");
    if(!remaining){renderWorkout();return}
    interval=setInterval(()=>{remaining--;const n=document.getElementById("restValue");if(n)n.textContent=remaining;if(remaining<=0){clear();renderWorkout();}},1000);
  }
  window.skipRest=()=>{clear();renderWorkout();};
  function finishWorkout(){
    clear();
    const s=workout;
    const elapsedMinutes=Math.max(1,Math.round((Date.now()-new Date(s.start).getTime())/60000));
    const entry={id:"session_"+Date.now(),type:"workout",workoutId:s.id,workoutName:s.title,date:new Date().toISOString().slice(0,10),durationMinutes:elapsedMinutes,completedDate:new Date().toISOString().slice(0,10),status:"completed",exercises:s.sessionExercises};
    saveSportHistory(entry);
    const el=shell("vtWorkoutRun","vt-ws");
    el.innerHTML=`<div class="vt-ws-top"><div></div><div class="vt-ws-title">SÉANCE TERMINÉE</div><div></div></div><div class="vt-ws-body"><div class="vt-ws-complete"><div style="font-size:46px">🎉</div><h1>Bravo !</h1><p>${escapeHtml(s.title)}</p></div><div class="vt-ws-stats"><div class="vt-ws-stat"><b>${s.targetDuration||"—"} min</b><span>DURÉE</span></div><div class="vt-ws-stat"><b>${s.items.length}</b><span>EXERCICES</span></div><div class="vt-ws-stat"><b>${s.doneSets}</b><span>SÉRIES</span></div></div><button class="vt-ws-primary" onclick="closeWorkoutRun()">Enregistrer et terminer</button></div>`;
  }
  window.closeWorkoutRun=()=>{clear();shell("vtWorkoutRun","vt-ws").classList.remove("open");setOverflow("");workout=null;};
  window.quitWorkout=()=>{if(confirm("Quitter la séance ? La progression ne sera pas enregistrée."))closeWorkoutRun();};
})();

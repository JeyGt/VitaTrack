
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

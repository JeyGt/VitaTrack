
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

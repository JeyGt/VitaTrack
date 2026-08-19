/* VitaTrack Sport — source unique d'enregistrement + historique + calories */
(function(){
  function ensure(){
    DATA.sport=DATA.sport||{};
    if(!Array.isArray(DATA.sport.sessionHistory)) DATA.sport.sessionHistory=[];
    return DATA.sport.sessionHistory;
  }

  function userWeight(){ return Number(DATA?.profile?.weightCurrent)||70; }
  function metForExercise(e){
    const n=String(e?.exerciseName||'').toLowerCase();
    if(/course|running|sprint|burpee|jump|corde|mountain|cardio/.test(n)) return 8;
    if(/marche|walking|randonnée|hike|vélo|bike|cycling|natation|swim/.test(n)) return 6;
    if(/gainage|planche|plank|mobilité|stretch/.test(n)) return 3.5;
    if(/pompe|push|squat|fente|lunge|traction|pull|dips|abdo|crunch|musculation|renforcement/.test(n)) return 6;
    return 5;
  }
  function kcalFromMinutes(minutes,met){ return Math.max(0,Math.round((met*3.5*userWeight()/200)*minutes)); }
  window.sportKcalForActivity=function(a){
    if(!a) return 0;
    if(a.type==='exercise'){
      if(a.mode==='time' || Number(a.durationSeconds)>0) return kcalFromMinutes(Number(a.durationSeconds||0)/60,metForExercise(a));
      const reps=(a.repsCompleted||[]).reduce((s,v)=>s+(Number(v)||0),0);
      return kcalFromMinutes((reps*3)/60,metForExercise(a));
    }
    if(a.type==='workout'){
      if(Number(a.durationMinutes)>0) return kcalFromMinutes(Number(a.durationMinutes),6);
      return (a.exercises||[]).reduce((sum,e)=>sum+sportKcalForActivity({...e,type:'exercise'}),0);
    }
    return 0;
  };
  window.sportKcalForSession=window.sportKcalForSession||function(s){return sportKcalForActivity(s);};

  window.recordSportActivity=function(activity){
    const h=ensure();
    const entry={...activity};
    entry.id=entry.id||('sport_'+Date.now());
    entry.type=entry.type||'workout';
    entry.date=entry.date||new Date().toISOString().slice(0,10);
    entry.completedDate=entry.completedDate||entry.date;
    entry.status='completed';
    entry.recordedAt=entry.recordedAt||new Date().toISOString();
    entry.estimatedKcal=sportKcalForActivity(entry);
    const i=h.findIndex(x=>x.id===entry.id);
    if(i>=0) h[i]={...h[i],...entry}; else h.push(entry);
    if(typeof saveState==='function') saveState();
    return entry;
  };
  window.getSportHistory=function(){return ensure();};
  window.closeSportHistory=function(){document.getElementById('sportHistoryPanel')?.classList.remove('open');document.body.style.overflow='';};
  window.getSportHistoryStats=function(){
    const h=ensure();
    const workouts=h.filter(x=>x.type==='workout');
    const exercises=h.filter(x=>x.type==='exercise');
    const performed=workouts.reduce((n,s)=>n+(Array.isArray(s.exercises)?s.exercises.length:0),0)+exercises.length;
    const difficulties=h.map(x=>Number(x.difficulty)).filter(x=>x>=1&&x<=10);
    const kcal=h.reduce((n,x)=>n+Number(x.estimatedKcal||sportKcalForActivity(x)||0),0);
    return {total:h.length,workouts:workouts.length,individualExercises:exercises.length,performedExercises:performed,avgDifficulty:difficulties.length?Math.round(difficulties.reduce((a,b)=>a+b,0)/difficulties.length*10)/10:null,kcal:kcal};
  };


  function numericPerformance(a){
    if(!a) return 0;
    if(a.type==='exercise'){
      const reps=(a.repsCompleted||[]).reduce((n,v)=>n+(Number(v)||0),0);
      if(reps) return reps;
      const ds=(a.durationsSeconds||[]).reduce((n,v)=>n+(Number(v)||0),0);
      return ds;
    }
    const ex=a.exercises||[];
    return ex.reduce((sum,e)=>sum+(e.repsCompleted||[]).reduce((n,v)=>n+(Number(v)||0),0),0);
  }
  function progressData(){
    const h=ensure().filter(x=>x.status==='completed').sort((a,b)=>String(a.recordedAt||a.date).localeCompare(String(b.recordedAt||b.date)));
    const exerciseMap={};
    h.forEach(a=>{
      if(a.type==='exercise'){
        const key=String(a.exerciseId||a.exerciseName||'').trim(); if(!key)return;
        (exerciseMap[key] ||= {name:a.exerciseName||'Exercice',items:[]}).items.push(a);
      } else if(Array.isArray(a.exercises)) a.exercises.forEach(e=>{
        const key=String(e.exerciseId||e.exerciseName||e.name||'').trim(); if(!key)return;
        (exerciseMap[key] ||= {name:e.exerciseName||e.name||'Exercice',items:[]}).items.push({...e,type:'exercise',recordedAt:a.recordedAt,date:a.date,completedDate:a.completedDate});
      });
    });
    const top=Object.values(exerciseMap).map(x=>{
      const items=x.items.filter(i=>numericPerformance(i)>0);
      if(!items.length)return null;
      const last=items[items.length-1], prev=items.length>1?items[items.length-2]:null;
      const lv=numericPerformance(last), pv=prev?numericPerformance(prev):lv;
      return {...x,last:lv,prev:pv,delta:lv-pv,count:items.length};
    }).filter(Boolean).sort((a,b)=>b.count-a.count||b.last-a.last).slice(0,8);
    const kcal=h.reduce((n,a)=>n+Number(a.estimatedKcal||sportKcalForActivity(a)||0),0);
    const last7=h.filter(a=>Date.now()-new Date(a.recordedAt||a.date).getTime()<=7*86400000).length;
    const durations=h.reduce((n,a)=>n+Number(a.durationMinutes||0),0);
    return {h,top,kcal,last7,durations};
  }
  window.openSportProgress=function(){
    let p=document.getElementById('sportProgressPanel');
    if(!p){p=document.createElement('div');p.id='sportProgressPanel';p.className='sport-panel';document.body.appendChild(p);}
    const d=progressData(), sessions=d.h.length;
    const max=Math.max(1,...d.top.map(x=>x.last));
    const rows=d.top.map(x=>{
      const pct=Math.max(8,Math.round(x.last/max*100));
      const arrow=x.delta>0?'↗':x.delta<0?'↘':'→';
      const delta=x.delta>0?`+${x.delta}`:String(x.delta);
      return `<div class="sport-progress-row"><div class="sport-progress-row-head"><strong>${escapeHtmlHistory(x.name)}</strong><span>${arrow} ${delta} · ${x.count} fois</span></div><div class="sport-progress-bar"><i style="width:${pct}%"></i></div><small>Dernière réalisation : ${x.last}</small></div>`;
    }).join('');
    p.innerHTML=`<div class="sport-panel-head"><h2>📈 Progression</h2><button class="sport-close" onclick="closeSportProgress()">×</button></div>
      <div class="sport-metrics"><div class="sport-metric"><strong>${sessions}</strong><small>activités</small></div><div class="sport-metric"><strong>${d.last7}</strong><small>7 derniers jours</small></div><div class="sport-metric"><strong>${Math.round(d.kcal)}</strong><small>kcal sport</small></div></div>
      <div class="card" style="margin-top:12px"><div class="eyebrow">📈 Tes performances</div><p class="muted small" style="margin:4px 0 12px">Comparaison de ta dernière réalisation avec la précédente.</p>${rows||'<p class="muted small">Fais quelques exercices pour commencer à voir ta progression.</p>'}</div>
      <div class="card" style="margin-top:10px"><div class="eyebrow">🏃 Régularité</div><strong style="font-size:24px">${sportStreak? sportStreak():0} jour${(sportStreak? sportStreak():0)>1?'s':''}</strong><p class="muted small">série actuelle d’activités enregistrées.</p></div>`;
    p.classList.add('open');document.body.style.overflow='hidden';
  };
  window.closeSportProgress=function(){document.getElementById('sportProgressPanel')?.classList.remove('open');document.body.style.overflow='';};

  window.openSportHistory=function(){
    let p=document.getElementById('sportHistoryPanel');
    if(!p){p=document.createElement('div');p.id='sportHistoryPanel';p.className='sport-panel sport-history-panel';document.body.appendChild(p);}
    const h=[...ensure()].sort((a,b)=>String(b.recordedAt||b.date).localeCompare(String(a.recordedAt||a.date)));
    const st=getSportHistoryStats();
    const totalKcal=Math.round(st.kcal);
    const renderActivity=(x)=>{
      const kcal=Math.round(Number(x.estimatedKcal||sportKcalForActivity(x)||0));
      const title=escapeHtmlHistory(x.type==='exercise'?x.exerciseName:x.workoutName||x.name||'Entraînement');
      const rawDate=x.completedDate||x.date||'';
      const when=rawDate?(()=>{const m=String(rawDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}-${m[2]}-${m[1].slice(2)}`:String(rawDate);})():'—';
      const time=x.recordedAt?`(${new Date(x.recordedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})})`:'';
      const difficulty=x.difficulty?x.difficulty+'/10':'—';
      let realization='—';
      if(x.type==='exercise'){
        const reps=Array.isArray(x.repsCompleted)?x.repsCompleted:[];
        const durations=Array.isArray(x.durationsSeconds)?x.durationsSeconds:[];
        realization=reps.length ? reps.join(' / ')+' reps' : durations.length ? durations.map(v=>v+' s').join(' / ') : '—';
      } else {
        const ex=Array.isArray(x.exercises)?x.exercises:[];
        realization=x.durationMinutes ? Math.round(x.durationMinutes)+' min' : (ex.length ? ex.length+' exercice'+(ex.length>1?'s':'') : '—');
      }
      return `<article class="history-activity-card"><div class="history-activity-title">${x.type==='exercise'?'💪':'🏋️'} ${title} <span class="history-type">(${x.type==='exercise'?'Exercice individuel':'Entraînement'})</span></div><div class="history-activity-line">${when}${time?' '+time:''} · Difficulté ${difficulty} · ${escapeHtmlHistory(realization)} · 🔥 ${kcal} kcal</div></article>`;
    };
    p.innerHTML=`<div class="sport-panel-head"><h2>📊 Historique</h2><button class="sport-close" onclick="closeSportHistory()">×</button></div>
      <div class="sport-metrics"><div class="sport-metric"><strong>${st.total}</strong><small>activités</small></div><div class="sport-metric"><strong>${st.workouts}</strong><small>entraînements</small></div><div class="sport-metric"><strong>${st.individualExercises}</strong><small>exercices individuels</small></div></div>
      <div class="card" style="margin-top:12px"><div class="eyebrow">🔥 Calories sport estimées</div><div style="font-family:Fraunces,serif;font-size:30px;font-weight:600">${totalKcal} kcal</div><p class="muted small">Estimation basée sur ton poids, le type d'activité et sa durée ou son volume. Ce n'est pas une mesure exacte.</p></div>
      <div class="history-list" style="margin-top:12px">${h.length?h.map(renderActivity).join(''):'<div class="card"><p class="muted">Aucune activité enregistrée.</p></div>'}</div>`;
    p.classList.add('open');
    document.body.style.overflow='hidden';
  };

  window.openSportActivityDetail=function(id){
    const a=ensure().find(x=>String(x.id)===String(id)); if(!a) return;
    let d=document.getElementById('sportActivityDetail');
    if(!d){d=document.createElement('div');d.id='sportActivityDetail';d.className='sport-panel sport-history-panel';document.body.appendChild(d);}
    const title=a.type==='exercise'?(a.exerciseName||'Exercice'):(a.workoutName||a.name||'Entraînement');
    const kcal=Math.round(Number(a.estimatedKcal||sportKcalForActivity(a)||0));
    const reps=Array.isArray(a.repsCompleted)?a.repsCompleted:[];
    const durations=Array.isArray(a.durationsSeconds)?a.durationsSeconds:[];
    let body='';
    if(a.type==='exercise'){
      body=`<div class="card detail-summary"><div><span class="detail-big">🔥 ${kcal}</span><small>kcal estimées</small></div><div><strong>${a.completedDate||a.date||'—'}</strong><small>${a.recordedAt?new Date(a.recordedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</small></div></div><div class="card"><div class="eyebrow">Réalisation</div><div class="detail-stats"><div><strong>${reps.length?reps.join(' / '):durations.length?durations.map(v=>v+' s').join(' / '):'—'}</strong><small>${reps.length?'répétitions par série':durations.length?'durée par série':'performance'}</small></div><div><strong>${a.difficulty? a.difficulty+'/10':'—'}</strong><small>difficulté</small></div></div></div>`;
    } else {
      const ex=a.exercises||[];
      body=`<div class="card detail-summary"><div><span class="detail-big">🔥 ${kcal}</span><small>kcal estimées</small></div><div><strong>${a.completedDate||a.date||'—'}</strong><small>${a.durationMinutes?Math.round(a.durationMinutes)+' min':'durée non renseignée'}</small></div></div><div class="card"><div class="eyebrow">Exercices réalisés</div>${ex.length?ex.map(e=>`<div class="detail-ex-row"><strong>${escapeHtmlHistory(e.exerciseName||e.name||'Exercice')}</strong><span>${Array.isArray(e.repsCompleted)&&e.repsCompleted.length?e.repsCompleted.join(' / '):Array.isArray(e.durationsSeconds)&&e.durationsSeconds.length?e.durationsSeconds.map(v=>v+' s').join(' / '):'—'}</span></div>`).join(''):'<p class="muted">Détail des exercices indisponible pour cette séance.</p>'}</div><div class="card"><div class="detail-stats"><div><strong>${a.difficulty?a.difficulty+'/10':'—'}</strong><small>difficulté</small></div><div><strong>${ex.length}</strong><small>exercices</small></div></div></div>`;
    }
    d.innerHTML=`<div class="sport-panel-head"><button class="sport-back" onclick="closeSportActivityDetail()">‹</button><h2>${escapeHtmlHistory(title)}</h2><button class="sport-close" onclick="closeSportActivityDetail()">×</button></div><div class="detail-content">${body}</div>`;
    d.classList.add('open'); document.body.style.overflow='hidden';
  };
  window.closeSportActivityDetail=function(){document.getElementById('sportActivityDetail')?.classList.remove('open');document.body.style.overflow='';};
  function escapeHtmlHistory(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  window.runSportHistoryTests=function(){
    const before=ensure().length,id='__sport_test_'+Date.now();
    recordSportActivity({id,type:'exercise',exerciseName:'Test',mode:'reps',repsCompleted:[20],difficulty:5});
    const after=ensure().length,dedupeBefore=ensure().length;
    recordSportActivity({id,type:'exercise',exerciseName:'Test modifié',difficulty:6});
    const dedupeAfter=ensure().length,ok=after===before+1&&dedupeAfter===dedupeBefore&&getSportHistoryStats().individualExercises>=1;
    ensure().splice(ensure().findIndex(x=>x.id===id),1);if(typeof saveState==='function')saveState();
    console.table([{test:'ajout',ok:after===before+1},{test:'anti-doublon',ok:dedupeAfter===dedupeBefore},{test:'stats',ok}]);return {success:ok,before,after};
  };

  window.runSportHistoryIntegrityTest=function(){
    const h=ensure();
    const id='__sport_integrity_test__';
    recordSportActivity({id,type:'exercise',exerciseName:'Test intégrité',mode:'reps',repsCompleted:[11],difficulty:7});
    recordSportActivity({id,type:'exercise',exerciseName:'Test intégrité',mode:'reps',repsCompleted:[12],difficulty:6});
    const matches=ensure().filter(x=>x.id===id);
    const ok=matches.length===1 && matches[0].repsCompleted?.[0]===12 && matches[0].status==='completed';
    const idx=ensure().findIndex(x=>x.id===id);
    if(idx>=0) ensure().splice(idx,1);
    if(typeof saveState==='function') saveState();
    return {ok,message:ok?'Source unique OK : création, mise à jour, dédoublonnage et sauvegarde.':'Échec de la source unique'};
  };
})();

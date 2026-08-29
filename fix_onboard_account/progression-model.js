/* VitaTrack Sport — Progression / Coach Model V3
   Transforme une performance terminée en adaptation concrète pour la prochaine
   prescription : répétitions, charge, durée, distance, repos ou variante. */
(function(){
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const roundStep=(v,step=.25)=>Math.round((Number(v)||0)/step)*step;
  const clone=x=>x?JSON.parse(JSON.stringify(x)):x;
  const exOf=id=>typeof window.getExerciseV3==='function'?window.getExerciseV3(id):null;
  const metricOf=ex=>typeof window.getExerciseMetric==='function'?window.getExerciseMetric(ex):(ex?.metric||'reps');

  function ensureStore(){
    if(!window.DATA?.sport)return {};
    DATA.sport.exerciseAdaptations=DATA.sport.exerciseAdaptations&&typeof DATA.sport.exerciseAdaptations==='object'?DATA.sport.exerciseAdaptations:{};
    return DATA.sport.exerciseAdaptations;
  }

  function targetTotals(item,metric){
    const sets=item?.prescription?.sets||item?.plannedTargets||[];
    if(metric==='time')return sets.reduce((n,s)=>n+(Number(s?.targetDurationSeconds)||0),0);
    if(metric==='distance')return sets.reduce((n,s)=>n+(Number(s?.targetDistanceKm)||0),0);
    return sets.reduce((n,s)=>n+(Number(s?.targetReps)||0),0) || (Array.isArray(item?.plannedReps)?item.plannedReps.reduce((n,v)=>n+(Number(String(v).match(/[\d]+(?:[.,]\d+)?/)?.[0]?.replace(',','.'))||0),0):0);
  }

  function actualTotals(item,metric){
    const sets=Array.isArray(item?.performanceSets)?item.performanceSets:[];
    if(metric==='time')return sets.reduce((n,s)=>n+(Number(s?.durationSeconds)||0),0) || (item?.durationsSeconds||[]).reduce((n,v)=>n+(Number(v)||0),0);
    if(metric==='distance')return sets.reduce((n,s)=>n+(Number(s?.distanceKm)||0),0) || Number(item?.distanceKm)||0;
    return sets.reduce((n,s)=>n+(Number(s?.reps)||0),0) || (item?.repsCompleted||[]).reduce((n,v)=>n+(Number(v)||0),0);
  }

  function completionRatio(item,metric){
    const target=targetTotals(item,metric),actual=actualTotals(item,metric);
    if(!target)return actual>0?1:0;
    return clamp(actual/target,0,2);
  }

  function maxActualLoad(item){
    return Math.max(0,...(item?.performanceSets||[]).map(s=>Number(s?.loadKg)||0),Number(item?.maxLoadKg)||0,Number(item?.loadKg)||0);
  }

  function feedbackKind(item){
    const fb=String(item?.feedback||'').toLowerCase();
    const d=Number(item?.difficulty);
    if(fb==='failed'||d>=10)return 'failed';
    if(fb==='too_difficult'||d>=8)return 'hard';
    if(fb==='too_easy'||(d>0&&d<=3))return 'easy';
    if(fb==='adapted'||(d>=4&&d<=7))return 'good';
    return 'unknown';
  }

  function nextState(item){
    const ex=exOf(item?.exerciseId);if(!ex)return null;
    const metric=metricOf(ex),store=ensureStore(),prev=store[ex.id]||{};
    const ratio=completionRatio(item,metric),feel=feedbackKind(item);
    let successStreak=Number(prev.successStreak)||0,easyStreak=Number(prev.easyStreak)||0,hardStreak=Number(prev.hardStreak)||0;
    let action='maintain',strength='normal',reason='Exercice bien dosé';

    if(feel==='failed'||ratio<.65){
      action='reduce';strength='strong';successStreak=0;easyStreak=0;hardStreak++;
      reason=feel==='failed'?'Échec signalé → baisse nette de la prochaine cible':`Seulement ${Math.round(ratio*100)} % de la cible réalisée → baisse nette`;
    }else if(feel==='hard'||ratio<.85){
      action='reduce';strength='light';successStreak=0;easyStreak=0;hardStreak++;
      reason=feel==='hard'?'Exercice difficile → prochaine cible légèrement réduite':`${Math.round(ratio*100)} % de la cible réalisée → légère réduction`;
    }else if(feel==='easy'&&ratio>=.9){
      action='progress';strength='normal';successStreak++;easyStreak++;hardStreak=0;
      reason='Exercice facile et cible atteinte → progression';
    }else if(feel==='good'&&ratio>=.95){
      successStreak++;easyStreak=0;hardStreak=0;
      if(successStreak>=2){action='progress';strength='light';successStreak=0;reason='Deux réussites bien maîtrisées → petite progression';}
      else {action='maintain';reason='Cible bien maîtrisée → consolidation avant progression';}
    }else if(feel==='unknown'&&ratio>1.1){
      action='progress';strength='light';successStreak++;hardStreak=0;reason=`${Math.round(ratio*100)} % de la cible réalisée → petite progression`;
    }else{
      successStreak=0;easyStreak=0;hardStreak=0;
      reason='Performance proche de la cible → maintien';
    }

    const variants=ex.progression||ex.variants||{};
    let suggestedId=null,recommendation=null;
    if(action==='progress'&&easyStreak>=2&&Array.isArray(variants.harder)&&variants.harder.length){suggestedId=variants.harder[0];recommendation='harder_variant';easyStreak=0;}
    if(action==='reduce'&&strength==='strong'&&Array.isArray(variants.easier)&&variants.easier.length){suggestedId=variants.easier[0];recommendation='easier_variant';}

    const state={
      exerciseId:ex.id,metric,action,strength,reason,recommendation,suggestedId,
      completionRatio:Math.round(ratio*100)/100,feedback:feel,
      successStreak,easyStreak,hardStreak,
      lastPerformance:{actual:actualTotals(item,metric),target:targetTotals(item,metric),maxLoadKg:maxActualLoad(item)},
      updatedAt:new Date().toISOString()
    };
    const currentPrescription=item?.prescription || (typeof window.prescriptionFromLegacy==='function'?window.prescriptionFromLegacy(ex,item):null);
    state.nextPrescription=currentPrescription?adjustedPrescription(ex,currentPrescription,state):null;
    if(state.nextPrescription){
      state.nextPrescription.adaptation={action:state.action,strength:state.strength,reason:state.reason,fromExerciseId:state.exerciseId,updatedAt:state.updatedAt};
    }
    store[ex.id]=state;
    return state;
  }

  function adjustedPrescription(exercise,prescription,state){
    if(!prescription||!state)return clone(prescription);
    if(prescription?.adaptation?.updatedAt===state.updatedAt)return clone(prescription);
    if(state.action==='maintain')return clone(prescription);
    const p=clone(prescription),metric=p.metric||metricOf(exercise),strong=state.strength==='strong';
    const factor=state.action==='progress'?1:-1;
    p.sets=(p.sets||[]).map(set=>{
      const s={...set};
      if(metric==='reps'){
        const delta=state.strength==='light'?1:(strong?2:1);
        s.targetReps=Math.max(3,Math.round((Number(s.targetReps)||10)+factor*delta));
      }else if(metric==='load_reps'){
        const actual=Number(state.lastPerformance?.maxLoadKg)||Number(s.targetLoadKg)||0;
        if(actual>0){
          const pct=state.action==='progress'?(state.strength==='light'?1.015:1.025):(strong?.90:.95);
          let next=roundStep(actual*pct,.25);
          if(state.action==='progress'&&next<=actual)next=actual+.25;
          if(state.action==='reduce'&&next>=actual)next=Math.max(0,actual-.25);
          s.targetLoadKg=roundStep(next,.25);
        }else{
          s.targetReps=Math.max(3,Math.round((Number(s.targetReps)||10)+factor*(strong?2:1)));
        }
      }else if(metric==='time'){
        const base=Math.max(10,Number(s.targetDurationSeconds)||30);
        const delta=state.strength==='light'?5:(strong?10:5);
        s.targetDurationSeconds=Math.max(10,Math.round(base+factor*delta));
      }else if(metric==='distance'){
        const base=Math.max(.1,Number(s.targetDistanceKm)||1);
        const pct=state.action==='progress'?(state.strength==='light'?1.05:1.10):(strong?.80:.90);
        s.targetDistanceKm=Math.max(.1,roundStep(base*pct,.05));
      }
      return s;
    });
    if(state.action==='reduce')p.restSeconds=Math.min(240,Math.max(0,Number(p.restSeconds)||0)+(strong?30:15));
    p.adaptation={action:state.action,strength:state.strength,reason:state.reason,fromExerciseId:state.exerciseId,updatedAt:state.updatedAt};
    if(typeof window.prescriptionTargetText==='function')p.targets=p.sets.map(s=>window.prescriptionTargetText(s,metric));
    p.setCount=p.sets.length;
    return p;
  }

  function applyToPrescription(exerciseOrId,prescription){
    const ex=typeof exerciseOrId==='string'?exOf(exerciseOrId):exerciseOrId;if(!ex||!prescription)return prescription;
    const state=ensureStore()[ex.id];
    if(!state)return prescription;
    if(prescription?.adaptation?.updatedAt===state.updatedAt)return clone(prescription);
    if(state.nextPrescription){
      const out=clone(state.nextPrescription);
      out.source=prescription.source||out.source;
      out.objective=prescription.objective||out.objective;
      out.level=prescription.level||out.level;
      return out;
    }
    return adjustedPrescription(ex,prescription,state);
  }

  function analyseCompletedExercise(item){
    const state=nextState(item);if(!state)return null;
    return {
      exerciseId:state.exerciseId,
      action:state.action,
      reason:state.reason,
      recommendation:state.recommendation,
      suggestedId:state.suggestedId,
      completionRatio:state.completionRatio,
      strength:state.strength,
      metric:state.metric
    };
  }

  window.VITATRACK_PROGRESSION_MODEL_VERSION=3;
  window.ensureSportExerciseAdaptations=ensureStore;
  window.sportAnalyseCompletedExercise=analyseCompletedExercise;
  window.sportApplyProgressionToPrescription=applyToPrescription;
  window.sportExerciseProgressionState=id=>ensureStore()[id]||null;
})();

/* VitaTrack Sport — Prescription Model V3
   Sépare ce qu'est un exercice (Exercise V3) de ce qui est demandé aujourd'hui.
   Une prescription décrit les séries, les cibles et le repos, tout en exposant
   plannedReps/plannedSets pour rester compatible avec le runner historique. */
(function(){
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const round=(v,step=1)=>Math.round(Number(v||0)/step)*step;
  const exerciseOf=exerciseOrId=>{
    if(typeof exerciseOrId==='string')return typeof window.getExerciseV3==='function'?window.getExerciseV3(exerciseOrId):null;
    return exerciseOrId||null;
  };
  const metricOf=ex=>typeof window.getExerciseMetric==='function'?window.getExerciseMetric(ex):(ex?.metric||ex?.measure||'reps');

  function objectiveKey(value){
    const v=String(value||'condition_physique').toLowerCase();
    if(v.includes('force'))return 'force';
    if(v.includes('muscl')||v.includes('hypert'))return 'musculation';
    if(v.includes('endur'))return 'endurance';
    if(v.includes('perte')||v.includes('fat')||v.includes('poids'))return 'perte_poids';
    return 'condition_physique';
  }
  function levelKey(value){
    const v=String(value||'intermediaire').toLowerCase();
    if(v.includes('debut'))return 'debutant';
    if(v.includes('avan'))return 'avance';
    return 'intermediaire';
  }

  function defaults(ex,options={}){
    const metric=metricOf(ex),objective=objectiveKey(options.objective),level=levelKey(options.level);
    const activity=ex?.kind==='activity';
    let sets=3,restSeconds=60,targetReps=null,targetDurationSeconds=null,targetDistanceKm=null;

    if(metric==='load_reps'){
      sets=objective==='force'?4:3;
      targetReps=objective==='force'?(level==='debutant'?8:level==='avance'?5:6):objective==='musculation'?(level==='avance'?8:10):10;
      restSeconds=objective==='force'?120:objective==='musculation'?90:75;
    }else if(metric==='reps'){
      sets=3;
      targetReps=level==='debutant'?8:level==='avance'?12:10;
      if(ex?.movement==='core')targetReps+=2;
      if(objective==='endurance'||objective==='perte_poids')targetReps+=2;
      restSeconds=['squat','lunge','hinge','pull_v'].includes(ex?.movement)?75:60;
      if(ex?.movement==='core')restSeconds=45;
    }else if(metric==='time'){
      if(activity){sets=1;targetDurationSeconds=300;restSeconds=0;}
      else {
        sets=ex?.movement==='mobility'?2:3;
        targetDurationSeconds=level==='debutant'?20:level==='avance'?40:30;
        if(ex?.movement==='mobility')targetDurationSeconds=30;
        restSeconds=ex?.movement==='mobility'?30:45;
      }
    }else if(metric==='distance'){
      sets=1;targetDistanceKm=1;restSeconds=0;
    }
    return{metric,sets,restSeconds,targetReps,targetDurationSeconds,targetDistanceKm,objective,level};
  }

  function scaleSet(set,metric,factor){
    factor=Number.isFinite(Number(factor))?Number(factor):1;
    const out={...set};
    if(metric==='reps'||metric==='load_reps')out.targetReps=Math.max(3,Math.round(Number(out.targetReps||10)*factor));
    else if(metric==='time')out.targetDurationSeconds=Math.max(15,Math.round(Number(out.targetDurationSeconds||30)*factor));
    else if(metric==='distance')out.targetDistanceKm=Math.max(.25,round(Number(out.targetDistanceKm||1)*factor,.05));
    return out;
  }

  function setText(set,metric){
    if(metric==='time'){
      const sec=Math.max(1,Math.round(Number(set.targetDurationSeconds)||30));
      return sec>=60&&sec%60===0?`${sec/60} min`:`${sec} s`;
    }
    if(metric==='distance'){
      const km=Number(set.targetDistanceKm);
      return km>0?`${km.toLocaleString('fr-FR',{maximumFractionDigits:2})} km`:'Distance libre';
    }
    return String(Math.max(1,Math.round(Number(set.targetReps)||10)));
  }

  function normalizeSets(rawSets,metric,base){
    if(!Array.isArray(rawSets)||!rawSets.length)return Array.from({length:base.sets},()=>({
      targetReps:base.targetReps,
      targetDurationSeconds:base.targetDurationSeconds,
      targetDistanceKm:base.targetDistanceKm,
      targetLoadKg:null
    }));
    return rawSets.map(value=>{
      if(value&&typeof value==='object')return{
        targetReps:value.targetReps??null,
        targetDurationSeconds:value.targetDurationSeconds??null,
        targetDistanceKm:value.targetDistanceKm??null,
        targetLoadKg:value.targetLoadKg??null
      };
      const n=Number(value)||0;
      if(metric==='time')return{targetReps:null,targetDurationSeconds:n||base.targetDurationSeconds,targetDistanceKm:null,targetLoadKg:null};
      if(metric==='distance')return{targetReps:null,targetDurationSeconds:null,targetDistanceKm:n||base.targetDistanceKm,targetLoadKg:null};
      return{targetReps:n||base.targetReps,targetDurationSeconds:null,targetDistanceKm:null,targetLoadKg:null};
    });
  }

  function buildExercisePrescription(exerciseOrId,options={}){
    const ex=exerciseOf(exerciseOrId);if(!ex)return null;
    const base=defaults(ex,options),metric=options.metric||base.metric;
    let sets=normalizeSets(options.sets,metric,{...base,sets:Math.max(1,Number(options.setCount)||base.sets)});
    const volumeFactor=Number(options.volumeFactor||1);
    if(volumeFactor!==1)sets=sets.map(s=>scaleSet(s,metric,volumeFactor));
    if(options.reduceSetCount&&sets.length>1)sets=sets.slice(0,Math.max(1,sets.length-1));
    const restSeconds=Math.max(0,Math.round(Number(options.restSeconds??base.restSeconds)||0));
    const targets=sets.map(s=>setText(s,metric));
    return{
      schemaVersion:3,
      exerciseId:ex.id,
      metric,
      sets,
      setCount:sets.length,
      restSeconds,
      targets,
      objective:base.objective,
      level:base.level,
      source:options.source||'program'
    };
  }

  function prescriptionFromLegacy(exerciseOrId,item={}){
    const ex=exerciseOf(exerciseOrId||item.exerciseId);if(!ex)return null;
    const metric=item.performanceKind||metricOf(ex);
    if(item.prescription?.schemaVersion===3)return item.prescription;
    const targets=Array.isArray(item.plannedReps)&&item.plannedReps.length?item.plannedReps:[];
    const sets=targets.map(v=>{
      const s=String(v??'').toLowerCase(),m=s.match(/[\d]+(?:[.,]\d+)?/),n=Number(m?.[0]?.replace(',','.'))||0;
      if(metric==='time')return{targetReps:null,targetDurationSeconds:/min/.test(s)?Math.round(n*60):Math.round(n||30),targetDistanceKm:null,targetLoadKg:null};
      if(metric==='distance')return{targetReps:null,targetDurationSeconds:null,targetDistanceKm:n||1,targetLoadKg:null};
      return{targetReps:Math.round(n||10),targetDurationSeconds:null,targetDistanceKm:null,targetLoadKg:null};
    });
    return buildExercisePrescription(ex,{metric,sets:sets.length?sets:null,setCount:Number(item.plannedSets)||undefined,restSeconds:Number(item.plannedRestSeconds)||undefined,source:'legacy'});
  }

  function applyPrescriptionToProgramItem(item,prescription){
    if(!item||!prescription)return item;
    return{
      ...item,
      prescription,
      performanceKind:prescription.metric,
      plannedTargets:prescription.sets.map(s=>({...s})),
      plannedReps:[...prescription.targets],
      plannedSets:prescription.setCount,
      plannedRestSeconds:prescription.restSeconds
    };
  }

  window.VITATRACK_PRESCRIPTION_MODEL_VERSION=3;
  window.buildExercisePrescription=buildExercisePrescription;
  window.prescriptionFromLegacy=prescriptionFromLegacy;
  window.applyPrescriptionToProgramItem=applyPrescriptionToProgramItem;
  window.prescriptionTargetText=setText;
})();

/* VitaTrack — Nutrition / Hydration / Weight module
 * Single source of truth for nutrition calculations and UI.
 * Core state/navigation helpers are provided by app.js; food data by data.js.
 */
let pickedFood=null;
let currentGuideQuery='';
let currentGuideCategory='all';
let currentGuideQuality='all';
let currentGuideCompare='';
let currentGuideCompareDir='asc';
let guideSearchOpen=false;
let guideFiltersOpen=true;
let customDrinkSelection=null;

const NUTRITION_LIMITS={foodQty:5000,waterMl:5000,drinkMl:5000,kcalPer100:1000,macroPer100:100};
function validFoodQuantity(value){const n=Number(value);return Number.isFinite(n)&&n>0&&n<=NUTRITION_LIMITS.foodQty;}
function drinkQuantityMl(qty,unit){const n=Number(qty);if(!Number.isFinite(n))return null;if(unit==='l')return n*1000;if(unit==='cl')return n*10;if(unit==='ml')return n;return null;}
function validDrinkQuantity(qty,unit){const ml=drinkQuantityMl(qty,unit);return ml!==null&&ml>0&&ml<=NUTRITION_LIMITS.drinkMl;}

/* ---------- Nutrition engine ---------- */
function activityFactor(){return {sedentary:1.2,light:1.375,moderate:1.55,active:1.725,very_active:1.9}[DATA.profile.activity]||1.55;}
function bmr(){const p=DATA.profile;if(typeof nutritionProfileValidation==='function'&&!nutritionProfileValidation(p).valid)return null;if(!p.age||!p.height||!p.weightCurrent)return null;return p.sex==='femme'?10*p.weightCurrent+6.25*p.height-5*p.age-161:10*p.weightCurrent+6.25*p.height-5*p.age+5;}
function tdee(){const base=bmr();return base?base*activityFactor():null;}
function calorieTarget(){const base=tdee();if(!base)return null;const type=DATA.objective.type;let deficit=0;if(type==='fat_loss')deficit=Math.min(550,Math.max(250,base*0.18));if(type==='recomposition')deficit=Math.min(300,Math.max(100,base*0.08));if(type==='muscle_gain')deficit=-200;if(type==='maintain')deficit=0;if(type==='weight_target')deficit=DATA.objective.targetWeight && DATA.profile.weightCurrent>DATA.objective.targetWeight?Math.min(550,Math.max(250,base*0.18)):0;const floor=typeof nutritionCalorieFloor==='function'?nutritionCalorieFloor(DATA.profile):1400;return Math.max(floor,Math.round(base-deficit));}
function proteinTarget(){const w=DATA.profile.weightCurrent;if(!w)return null;let mult=1.6;if(['fat_loss','recomposition'].includes(DATA.objective.type))mult=1.8;if(DATA.objective.type==='muscle_gain')mult=1.7;return Math.round(w*mult);}
function ensureTargets(){const baseK=calorieTarget(),p=proteinTarget();const adjustment=Number(DATA.nutrition?.coachCalorieAdjustment)||0;const floor=typeof nutritionCalorieFloor==='function'?nutritionCalorieFloor(DATA.profile):1400;const k=baseK?Math.max(floor,Math.round(baseK+adjustment)):null;if(k&&!DATA.nutrition.manualCalories)DATA.nutrition.caloriesTarget=k;if(p&&!DATA.nutrition.manualProtein)DATA.nutrition.proteinTarget=p;return{k,p,baseCalories:baseK,coachAdjustment:adjustment};}
function currentTargets(){ensureTargets();return{calories:DATA.nutrition.caloriesTarget,protein:DATA.nutrition.proteinTarget};}


/* ---------- Coach nutrition v1.1 — moteur d'observation ---------- */
function coachEnsureState(){
  const base={version:1,startedAt:null,calibrationRestartAt:null,baseline:{},lastWeek:{},phase:'waiting',lastObservationAt:null,goalHistory:[],contextAnswers:[],recommendationHistory:[],calorieAdjustments:[],lastGeneratedReport:null};
  if(!DATA.nutritionCoach||typeof DATA.nutritionCoach!=='object')DATA.nutritionCoach={};
  Object.entries(base).forEach(([k,v])=>{if(DATA.nutritionCoach[k]===undefined)DATA.nutritionCoach[k]=Array.isArray(v)?[]:(v&&typeof v==='object'?{}:v);});
  ['goalHistory','contextAnswers','recommendationHistory','calorieAdjustments'].forEach(k=>{if(!Array.isArray(DATA.nutritionCoach[k]))DATA.nutritionCoach[k]=[];});
  return DATA.nutritionCoach;
}
function coachDateObj(date){const d=new Date(`${date}T12:00:00`);return Number.isNaN(d.getTime())?new Date():d;}
function coachDateDiff(from,to){return Math.floor((coachDateObj(to)-coachDateObj(from))/86400000);}
function coachDates(endDate=TODAY,days=7){const end=coachDateObj(endDate);return Array.from({length:days},(_,i)=>{const d=new Date(end);d.setDate(end.getDate()-(days-1-i));return todayStr(d);});}
function coachAvg(values){const a=values.filter(v=>Number.isFinite(v));return a.length?a.reduce((sum,v)=>sum+v,0)/a.length:null;}
function coachTimeMinutes(v){const m=String(v||'').match(/^(\d{1,2}):(\d{2})/);if(!m)return null;return Number(m[1])*60+Number(m[2]);}
function coachMealType(v){return v==='Repas tardif'?'Dîner':(v||'Repas');}
function coachSnackOccasionCount(foods){const times=(foods||[]).filter(f=>coachMealType(f.mealType)==='En-cas').map(f=>coachTimeMinutes(f.time)).filter(v=>v!==null).sort((a,b)=>a-b);const untimed=(foods||[]).some(f=>coachMealType(f.mealType)==='En-cas'&&coachTimeMinutes(f.time)===null);if(!times.length)return untimed?1:0;let count=1,last=times[0];for(let i=1;i<times.length;i++){if(times[i]-last>45)count++;last=times[i];}return count;}
function coachInferDrinkCategory(x){
  if(x?.category)return x.category;
  const n=normalizeFoodText(x?.name||'');
  if(/biere|vin |champagne|porto|muscat|cidre|poire|whisky|rhum|vodka|gin|tequila|mojito|colada|spritz|kir|picon|monaco/.test(n))return'alcohol';
  if(/jus|nectar/.test(n))return'juice';
  if(/coca|pepsi|orangina|fanta|sprite|schweppes|ice tea/.test(n))return'soft';
  if(/cafe|espresso|the |infusion|rooibos|chicoree|matcha/.test(n))return'hot';
  return'other';
}
function coachReferenceTargets(date=TODAY){
  const calories=Math.round(Number(DATA.nutrition?.calorieTargetHistory?.[date])||Number(currentTargets().calories)||0);
  const currentWeight=Number(DATA.profile?.weightCurrent)||0;
  const protein=Number(currentTargets().protein)||0;
  const fat=currentWeight>0?Math.max(0,Math.round(currentWeight*.66)):0;
  const fiber=calories>0?Math.round(calories/1000*14):0;
  const carbs=calories>0?Math.max(0,Math.round((calories-protein*4-fat*9)/4)):0;
  return{calories,protein,fat,fiber,carbs};
}
function coachDailyObservation(date=TODAY){
  const foods=Array.isArray(DATA.foodLog?.[date])?DATA.foodLog[date]:[];
  const drinks=(Array.isArray(DATA.drinkLog)?DATA.drinkLog:[]).filter(x=>x.date===date);
  const totals=dayTotals(date),targets=coachReferenceTargets(date),totalKcal=Number(totals.kcal)||0,foodKcal=foods.reduce((sum,f)=>sum+(Number(f.kcal)||0),0);
  const mealNames=['Petit-déjeuner','Déjeuner','Dîner','En-cas'];
  const meals={};mealNames.forEach(k=>meals[k]={entries:0,kcal:0,protein:0,fiber:0,proteinKnown:0,fiberKnown:0});
  const mealTimes=[];
  foods.forEach(f=>{const type=coachMealType(f.mealType),g=meals[type]||(meals[type]={entries:0,kcal:0,protein:0,fiber:0,proteinKnown:0,fiberKnown:0});g.entries++;g.kcal+=Number(f.kcal)||0;const protein=nutrientNumberOrNull(f.protein),fiber=nutrientNumberOrNull(f.fiber);if(protein!==null){g.protein+=protein;g.proteinKnown++;}if(fiber!==null){g.fiber+=fiber;g.fiberKnown++;}const tm=coachTimeMinutes(f.time);if(tm!==null)mealTimes.push(tm);});
  const drinkStats={entries:drinks.length,kcal:0,hotKcal:0,sweetKcal:0,alcoholKcal:0,hotCount:0,sweetCount:0,alcoholCount:0};
  drinks.forEach(x=>{const kcal=Number(x.kcal)||0,c=coachInferDrinkCategory(x);drinkStats.kcal+=kcal;if(c==='hot'){drinkStats.hotKcal+=kcal;drinkStats.hotCount++;}if(c==='soft'||c==='juice'){drinkStats.sweetKcal+=kcal;drinkStats.sweetCount++;}if(['alcohol','beer','wine','cider','spirit','cocktail'].includes(c)){drinkStats.alcoholKcal+=kcal;drinkStats.alcoholCount++;}});
  const sessions=(DATA.sport?.sessionHistory||[]).filter(x=>String(x.completedDate||x.date||'').slice(0,10)===date);
  const sportMinutes=sessions.reduce((sum,x)=>sum+Number(x.durationMinutes||x.targetDuration||((Number(x.durationSeconds)||0)/60)||0),0);
  const sportKcal=sessions.reduce((sum,x)=>sum+(typeof sportKcalForSession==='function'?Number(sportKcalForSession(x))||0:0),0);
  const water=waterTotal(date),steps=stepsForDate(date),weights=(DATA.weights||[]).filter(x=>String(x.date||'').slice(0,10)===date).map(x=>Number(x.weight)).filter(v=>v>0);
  const mealTypes=mealNames.filter(k=>meals[k]?.entries>0),nutritionEntries=foods.length+drinks.length;
  const macroCoverage=Object.fromEntries(['protein','fiber','carbs','fat','sugar'].map(key=>[key,foods.length>0&&Number(totals?._known?.[key]||0)===foods.length]));
  return{date,hasNutritionData:nutritionEntries>0,nutritionEntries,confidence:!nutritionEntries?'none':(foods.length>=2||mealTypes.length>=2?'medium':'low'),totals,targets,macroCoverage,
    caloriePct:targets.calories?totalKcal/targets.calories:null,proteinPct:targets.protein&&macroCoverage.protein?Number(totals.protein)/targets.protein:null,fiberPct:targets.fiber&&macroCoverage.fiber?Number(totals.fiber)/targets.fiber:null,
    meals,mealTypes,mealShares:Object.fromEntries(mealNames.map(k=>[k,foodKcal?Number(meals[k]?.kcal||0)/foodKcal:0])),snackCount:coachSnackOccasionCount(foods),snackKcal:Number(meals['En-cas']?.kcal||0),
    firstMealMinute:mealTimes.length?Math.min(...mealTimes):null,lastMealMinute:mealTimes.length?Math.max(...mealTimes):null,drinks:drinkStats,drinkCalorieShare:totalKcal?drinkStats.kcal/totalKcal:0,
    waterMl:water,steps,sport:{sessions:sessions.length,minutes:Math.round(sportMinutes),kcal:Math.round(sportKcal)},weights};
}
function coachEarliestDataDate(){const dates=[];Object.entries(DATA.foodLog||{}).forEach(([d,v])=>{if(Array.isArray(v)&&v.length)dates.push(d);});(Array.isArray(DATA.drinkLog)?DATA.drinkLog:[]).forEach(x=>{if(x.date)dates.push(String(x.date).slice(0,10));});return dates.filter(Boolean).sort()[0]||null;}
function coachBuildBaseline(days=14){
  const observations=coachDates(TODAY,days).map(coachDailyObservation),nutritionDays=observations.filter(x=>x.hasNutritionData),usable=nutritionDays.filter(x=>x.confidence==='medium'),sample=usable.length>=3?usable:nutritionDays;
  const mealNames=['Petit-déjeuner','Déjeuner','Dîner','En-cas'];
  const mealShares=Object.fromEntries(mealNames.map(k=>[k,coachAvg(sample.map(x=>x.mealShares[k]))||0]));
  const drinkKcal=coachAvg(sample.map(x=>x.drinks.kcal))||0,totalKcal=coachAvg(sample.map(x=>Number(x.totals.kcal)||0))||0;
  const weightPoints=observations.flatMap(x=>x.weights.map(w=>({date:x.date,weight:w}))).sort((a,b)=>a.date.localeCompare(b.date));
  return{windowDays:days,daysWithNutrition:nutritionDays.length,usableDays:usable.length,confidence:sample.length>=5?'good':sample.length>=3?'building':'low',
    avgCalories:coachAvg(sample.map(x=>Number(x.totals.kcal)||0)),avgProtein:coachAvg(sample.map(x=>x.macroCoverage?.protein?Number(x.totals.protein):null)),avgFiber:coachAvg(sample.map(x=>x.macroCoverage?.fiber?Number(x.totals.fiber):null)),avgCarbs:coachAvg(sample.map(x=>x.macroCoverage?.carbs?Number(x.totals.carbs):null)),avgFat:coachAvg(sample.map(x=>x.macroCoverage?.fat?Number(x.totals.fat):null)),
    mealShares,avgSnackCount:coachAvg(sample.map(x=>x.snackCount)),avgSnackKcal:coachAvg(sample.map(x=>x.snackKcal)),avgDrinkKcal:drinkKcal,avgDrinkShare:totalKcal?drinkKcal/totalKcal:0,avgSweetDrinkKcal:coachAvg(sample.map(x=>x.drinks.sweetKcal))||0,avgAlcoholKcal:coachAvg(sample.map(x=>x.drinks.alcoholKcal))||0,
    avgWaterMl:coachAvg(observations.map(x=>x.waterMl).filter(v=>v>0)),avgSteps:coachAvg(observations.map(x=>x.steps).filter(v=>v>0)),sportDays:observations.filter(x=>x.sport.sessions>0).length,sportSessions:observations.reduce((a,x)=>a+x.sport.sessions,0),
    avgFirstMealMinute:coachAvg(sample.map(x=>x.firstMealMinute).filter(v=>v!==null)),avgLastMealMinute:coachAvg(sample.map(x=>x.lastMealMinute).filter(v=>v!==null)),weightPoints:weightPoints.length,weightDelta:weightPoints.length>=2?weightPoints[weightPoints.length-1].weight-weightPoints[0].weight:null};
}
function coachRollingWeek(){const observations=coachDates(TODAY,7).map(coachDailyObservation),nutrition=observations.filter(x=>x.hasNutritionData);return{start:observations[0]?.date||TODAY,end:TODAY,daysWithNutrition:nutrition.length,avgCalories:coachAvg(nutrition.map(x=>Number(x.totals.kcal)||0)),avgProtein:coachAvg(nutrition.map(x=>x.macroCoverage?.protein?Number(x.totals.protein):null)),avgFiber:coachAvg(nutrition.map(x=>x.macroCoverage?.fiber?Number(x.totals.fiber):null)),avgSnackCount:coachAvg(nutrition.map(x=>x.snackCount)),drinkKcal:nutrition.reduce((a,x)=>a+x.drinks.kcal,0),sweetDrinkKcal:nutrition.reduce((a,x)=>a+x.drinks.sweetKcal,0),alcoholKcal:nutrition.reduce((a,x)=>a+x.drinks.alcoholKcal,0),sportDays:observations.filter(x=>x.sport.sessions>0).length,sportSessions:observations.reduce((a,x)=>a+x.sport.sessions,0),avgSteps:coachAvg(observations.map(x=>x.steps).filter(v=>v>0))};}
function coachObservationPhase(){const st=coachEnsureState(),start=st.calibrationRestartAt||st.startedAt;if(!start)return'waiting';const day=Math.max(1,coachDateDiff(start,TODAY)+1),recal=!!st.calibrationRestartAt;if(day<=7)return recal?'recalibration1':'week1';if(day<=14)return recal?'recalibration2':'week2';return'active';}
function coachObservationStatus(){const st=coachEnsureState(),phase=coachObservationPhase(),b=st.baseline||{};if(phase==='waiting')return{phase,title:'Coach en attente de données',text:'Enregistre normalement tes repas et boissons. VitaTrack commencera par apprendre ton rythme sans le juger.'};if(phase==='week1')return{phase,title:'Observation en cours',text:`Première semaine : je construis ta référence personnelle. ${b.daysWithNutrition||0} jour${b.daysWithNutrition===1?'':'s'} de nutrition observé${b.daysWithNutrition===1?'':'s'}.`};if(phase==='week2')return{phase,title:'Calibration de ton rythme',text:'Je confirme maintenant ta répartition habituelle des repas, tes collations, tes boissons et ton activité. Aucun ajustement calorique n’est appliqué.'};if(phase==='recalibration1'||phase==='recalibration2')return{phase,title:'Nouvel objectif : recalibration',text:'Ton objectif a changé. Je conserve ton historique comportemental, mais j’observe deux nouvelles semaines avant d’interpréter la tendance du poids.'};return{phase,title:'Référence personnelle construite',text:`Le moteur d’observation dispose maintenant d’une base exploitable (${b.daysWithNutrition||0} jours sur les 14 derniers). Les conseils détaillés seront activés dans l’étape d’analyse.`};}
function coachRecordGoalChange(from,to){const st=coachEnsureState();st.goalHistory.push({date:TODAY,from,to});st.calibrationRestartAt=TODAY;st.phase='recalibration1';DATA.nutrition.coachCalorieAdjustment=0;st.lastGeneratedReport=null;}
function coachUpdateObservationState(){const st=coachEnsureState(),earliest=coachEarliestDataDate();if(!st.startedAt&&earliest)st.startedAt=earliest;if(st.calibrationRestartAt&&coachDateDiff(st.calibrationRestartAt,TODAY)>=14)st.calibrationRestartAt=null;st.baseline=coachBuildBaseline(14);st.lastWeek=coachRollingWeek();st.phase=coachObservationPhase();st.lastObservationAt=TODAY;return st;}

/* ---------- Coach nutrition v1.1 — analyse étape 2A : énergie + répartition ----------
 * IMPORTANT : ce bloc est volontairement pur et n'est jamais exécuté automatiquement
 * au démarrage ni dans saveState(). Le futur bilan hebdomadaire l'appellera à la demande.
 */
function coachConsecutiveCount(items,predicate){
  let best=0,current=0;
  (items||[]).forEach(x=>{if(predicate(x)){current++;best=Math.max(best,current);}else current=0;});
  return best;
}
function coachMealAnalysisSnapshot(endDate=TODAY){
  const observations=coachDates(endDate,7).map(coachDailyObservation);
  const nutritionDays=observations.filter(x=>x.hasNutritionData);
  const usableDays=nutritionDays.filter(x=>x.confidence==='medium');
  const sample=usableDays.length>=3?usableDays:nutritionDays;
  const phase=coachObservationPhase();
  const baseline=coachEnsureState().baseline||{};
  const signals=[],patterns=[];
  const addSignal=(id,priority,title,data={})=>signals.push({id,priority,title,...data});
  const addPattern=(id,title,data={})=>patterns.push({id,title,...data});
  const ratio=x=>Number.isFinite(x.caloriePct)?x.caloriePct:null;
  const lowDays=sample.filter(x=>ratio(x)!==null&&ratio(x)<.70);
  const outside20=sample.filter(x=>ratio(x)!==null&&(ratio(x)<.80||ratio(x)>1.20));
  const over140=sample.filter(x=>ratio(x)!==null&&ratio(x)>1.40);
  const aboveTarget=sample.filter(x=>ratio(x)!==null&&ratio(x)>1.00);
  const consecutiveLow=coachConsecutiveCount(sample,x=>ratio(x)!==null&&ratio(x)<.70);
  if(consecutiveLow>=2)addSignal('very_low_intake',1,'Apports très bas répétés',{days:lowDays.map(x=>x.date),consecutiveDays:consecutiveLow});
  if(outside20.length>=3)addSignal('calorie_target_variation',2,'Écarts caloriques répétés',{days:outside20.map(x=>x.date),count:outside20.length});
  if(over140.length>=3)addSignal('repeated_high_intake',2,'Dépassements importants répétés',{days:over140.map(x=>x.date),count:over140.length});
  let largeJumps=0;
  for(let i=1;i<sample.length;i++){
    const a=Number(sample[i-1].totals?.kcal)||0,b=Number(sample[i].totals?.kcal)||0;
    if(a>0&&b>0&&Math.abs(b-a)>600)largeJumps++;
  }
  if(largeJumps>=3)addSignal('high_day_to_day_variability',2,'Forte alternance calorique',{occurrences:largeJumps});

  const mealNames=['Petit-déjeuner','Déjeuner','Dîner','En-cas'];
  const mealStats=Object.fromEntries(mealNames.map(name=>[name,{name,largeDays:[],daysPresent:0,avgShareOfTarget:null,shares:[]}]))
  sample.forEach(day=>{
    mealNames.forEach(name=>{
      const kcal=Number(day.meals?.[name]?.kcal)||0,target=Number(day.targets?.calories)||0;
      if(kcal>0)mealStats[name].daysPresent++;
      if(target>0&&kcal>0){
        const share=kcal/target;mealStats[name].shares.push(share);
        if(share>=.45)mealStats[name].largeDays.push({date:day.date,share,dayPct:ratio(day)});
      }
    });
  });
  mealNames.forEach(name=>{mealStats[name].avgShareOfTarget=coachAvg(mealStats[name].shares);});
  const baselineDinner=Number(baseline.mealShares?.['Dîner'])||0;
  const baselineLunch=Number(baseline.mealShares?.['Déjeuner'])||0;
  if(baselineDinner>=.40)addPattern('evening_weighted_rhythm','Rythme naturellement plus chargé le soir',{baselineDinnerShare:baselineDinner,baselineLunchShare:baselineLunch});
  if(baselineDinner>=.40&&baselineLunch>0&&baselineLunch<=.25)addPattern('light_lunch_evening_main','Déjeuner léger / dîner principal',{baselineDinnerShare:baselineDinner,baselineLunchShare:baselineLunch});

  mealNames.forEach(name=>{
    const stat=mealStats[name];
    if(stat.largeDays.length<3)return;
    const overageDays=stat.largeDays.filter(x=>Number(x.dayPct)>1).length;
    const baselineShare=Number(baseline.mealShares?.[name])||0;
    const isNaturalPattern=baselineShare>=.40 && overageDays<2;
    if(isNaturalPattern){
      addPattern(`large_${name}_baseline`,`${name} habituellement important`,{meal:name,count:stat.largeDays.length,baselineShare,overageDays});
      return;
    }
    if(overageDays>=2)addSignal('large_meal_with_overage',2,'Repas très important associé à des dépassements',{meal:name,count:stat.largeDays.length,overageDays,days:stat.largeDays.map(x=>x.date)});
    else addPattern(`large_${name}_without_overage`,`${name} important sans dépassement récurrent`,{meal:name,count:stat.largeDays.length,overageDays});
  });

  const avgCalories=coachAvg(sample.map(x=>Number(x.totals?.kcal)||0));
  const avgTarget=coachAvg(sample.map(x=>Number(x.targets?.calories)||0).filter(v=>v>0));
  const avgRatio=avgCalories!==null&&avgTarget?avgCalories/avgTarget:null;
  signals.sort((a,b)=>a.priority-b.priority);
  return{
    version:'2A',endDate,phase,
    readyForGuidance:phase==='active'&&usableDays.length>=3,
    dataQuality:{nutritionDays:nutritionDays.length,usableDays:usableDays.length,sufficient:nutritionDays.length>=3},
    energy:{avgCalories,avgTarget,avgRatio,daysAboveTarget:aboveTarget.length,daysBelow70:lowDays.length,daysOutside20:outside20.length},
    meals:mealStats,patterns,signals
  };
}
/* ---------- Coach nutrition v1.1 — analyse étape 2B : boissons ----------
 * Module pur : aucune exécution automatique au démarrage.
 * Il complète 2A et sera appelé à la demande par le futur bilan hebdomadaire.
 */
function coachDrinkIsAlcoholic(x){
  const cat=coachInferDrinkCategory(x),name=normalizeFoodText(x?.name||'');
  if(/sans alcool|0[,.]?0\s*%/.test(name))return false;
  return ['alcohol','beer','wine','cider','spirit','cocktail'].includes(cat);
}
function coachDrinkIsSweetCaloric(x){
  const cat=coachInferDrinkCategory(x),name=normalizeFoodText(x?.name||''),kcal=Number(x?.kcal)||0;
  if(/zero|sans sucre|light/.test(name))return false;
  if(cat==='juice')return kcal>=15;
  return cat==='soft'&&kcal>=15;
}
function coachDrinkAnalysisSnapshot(endDate=TODAY){
  const dates=coachDates(endDate,7),observations=dates.map(coachDailyObservation);
  const nutritionDays=observations.filter(x=>x.hasNutritionData),usableDays=nutritionDays.filter(x=>x.confidence==='medium');
  const sample=usableDays.length>=3?usableDays:nutritionDays,signals=[],patterns=[];
  const addSignal=(id,priority,title,data={})=>signals.push({id,priority,title,...data});
  const addPattern=(id,title,data={})=>patterns.push({id,title,...data});
  const perDay=sample.map(day=>{
    const drinks=(Array.isArray(DATA.drinkLog)?DATA.drinkLog:[]).filter(x=>x.date===day.date);
    const totalKcal=Number(day.totals?.kcal)||0;
    let drinkKcal=0,sweetKcal=0,alcoholKcal=0,hotKcal=0,sweetCount=0,alcoholCount=0,hotCount=0;
    drinks.forEach(x=>{
      const kcal=Number(x.kcal)||0,cat=coachInferDrinkCategory(x);
      drinkKcal+=kcal;
      if(coachDrinkIsSweetCaloric(x)){sweetKcal+=kcal;sweetCount++;}
      if(coachDrinkIsAlcoholic(x)){alcoholKcal+=kcal;alcoholCount++;}
      if(cat==='hot'){hotKcal+=kcal;hotCount++;}
    });
    return{date:day.date,totalKcal,drinkKcal,share:totalKcal>0?drinkKcal/totalKcal:0,sweetKcal,alcoholKcal,hotKcal,sweetCount,alcoholCount,hotCount,drinkCount:drinks.length};
  });
  const totalEnergy=perDay.reduce((s,x)=>s+x.totalKcal,0),totalDrink=perDay.reduce((s,x)=>s+x.drinkKcal,0);
  const totalSweet=perDay.reduce((s,x)=>s+x.sweetKcal,0),totalAlcohol=perDay.reduce((s,x)=>s+x.alcoholKcal,0),totalHot=perDay.reduce((s,x)=>s+x.hotKcal,0);
  const weeklyShare=totalEnergy>0?totalDrink/totalEnergy:0;
  const highLiquidDays=perDay.filter(x=>x.share>.15&&x.drinkKcal>=80);
  const sweetDays=perDay.filter(x=>x.sweetKcal>=20),alcoholDays=perDay.filter(x=>x.alcoholKcal>0),hotDays=perDay.filter(x=>x.hotCount>0);
  if(sample.length>=3&&(weeklyShare>.15||highLiquidDays.length>=3))addSignal('liquid_calorie_share',3,'Part importante des calories venant des boissons',{weeklyShare,totalDrinkKcal:Math.round(totalDrink),days:highLiquidDays.map(x=>x.date),count:highLiquidDays.length});
  if(sweetDays.length>=4)addSignal('frequent_sweet_drinks',3,'Boissons sucrées fréquentes',{days:sweetDays.map(x=>x.date),count:sweetDays.length,totalKcal:Math.round(totalSweet)});
  if(totalAlcohol>300)addSignal('notable_alcohol_calories',3,'Calories d’alcool notables sur la semaine',{days:alcoholDays.map(x=>x.date),count:alcoholDays.length,totalKcal:Math.round(totalAlcohol)});
  if(hotDays.length>=3)addPattern('regular_hot_drinks','Boissons chaudes régulières',{days:hotDays.length,totalKcal:Math.round(totalHot),avgKcalPerActiveDay:hotDays.length?Math.round(totalHot/hotDays.length):0});
  if(totalDrink>0&&weeklyShare<=.05)addPattern('low_liquid_calorie_share','Faible contribution calorique des boissons',{weeklyShare,totalDrinkKcal:Math.round(totalDrink)});
  signals.sort((a,b)=>a.priority-b.priority);
  return{
    version:'2B',endDate,phase:coachObservationPhase(),
    readyForGuidance:coachObservationPhase()==='active'&&usableDays.length>=3,
    dataQuality:{nutritionDays:nutritionDays.length,usableDays:usableDays.length,sufficient:nutritionDays.length>=3},
    drinks:{weeklyShare,totalDrinkKcal:Math.round(totalDrink),sweetKcal:Math.round(totalSweet),alcoholKcal:Math.round(totalAlcohol),hotKcal:Math.round(totalHot),highLiquidDays:highLiquidDays.length,sweetDays:sweetDays.length,alcoholDays:alcoholDays.length,hotDays:hotDays.length,perDay},
    patterns,signals
  };
}


/* ---------- Coach nutrition v1.1 — analyse étape 2C : collations + repas précédent ----------
 * Module pur : aucune exécution automatique au démarrage.
 * Une collation n'est jamais considérée comme un problème par défaut : le moteur
 * recherche d'abord le repas précédent, l'horaire et le rythme personnel.
 */
function coachCompleteNutrientSum(items,key){const vals=(items||[]).map(f=>nutrientNumberOrNull(key==='carbs'?(f.carbs??f.carb):key==='satFat'?(f.satFat??f.saturatedFat):f[key]));return vals.length&&vals.every(v=>v!==null)?vals.reduce((a,b)=>a+b,0):null;}
function coachSnackSlot(minute){
  if(minute===null||!Number.isFinite(minute))return'unknown';
  if(minute<11*60)return'morning';
  if(minute<17*60)return'afternoon';
  if(minute<21*60)return'evening';
  return'night';
}
function coachSnackOccasionsForDate(date){
  const foods=(DATA.foodLog?.[date]||[]).slice().sort((a,b)=>(coachTimeMinutes(a.time)??9999)-(coachTimeMinutes(b.time)??9999));
  const snacks=foods.filter(f=>coachMealType(f.mealType)==='En-cas');
  const timed=snacks.filter(f=>coachTimeMinutes(f.time)!==null);
  const occasions=[];
  timed.forEach(f=>{
    const minute=coachTimeMinutes(f.time),last=occasions[occasions.length-1];
    if(!last||minute-last.lastMinute>45){occasions.push({date,startMinute:minute,lastMinute:minute,items:[f]});}
    else{last.items.push(f);last.lastMinute=minute;}
  });
  if(snacks.some(f=>coachTimeMinutes(f.time)===null))occasions.push({date,startMinute:null,lastMinute:null,items:snacks.filter(f=>coachTimeMinutes(f.time)===null)});
  return occasions.map(o=>{
    const kcal=o.items.reduce((sum,f)=>sum+(Number(f.kcal)||0),0);
    const protein=coachCompleteNutrientSum(o.items,'protein');
    const fiber=coachCompleteNutrientSum(o.items,'fiber');
    let previousMeal=null;
    if(o.startMinute!==null){
      const candidates=foods.filter(f=>coachMealType(f.mealType)!=='En-cas'&&coachTimeMinutes(f.time)!==null&&coachTimeMinutes(f.time)<o.startMinute);
      if(candidates.length){
        const lastMinute=Math.max(...candidates.map(f=>coachTimeMinutes(f.time)));
        const group=candidates.filter(f=>coachTimeMinutes(f.time)===lastMinute);
        const mealType=coachMealType(group[0]?.mealType);
        previousMeal={
          type:mealType,timeMinute:lastMinute,gapMinutes:o.startMinute-lastMinute,
          kcal:group.reduce((sum,f)=>sum+(Number(f.kcal)||0),0),
          protein:coachCompleteNutrientSum(group,'protein'),
          fiber:coachCompleteNutrientSum(group,'fiber')
        };
      }
    }
    return{date:o.date,startMinute:o.startMinute,slot:coachSnackSlot(o.startMinute),kcal,protein,fiber,itemCount:o.items.length,previousMeal};
  });
}
function coachSnackAnalysisSnapshot(endDate=TODAY){
  const dates=coachDates(endDate,7),observations=dates.map(coachDailyObservation);
  const nutritionDays=observations.filter(x=>x.hasNutritionData),usableDays=nutritionDays.filter(x=>x.confidence==='medium');
  const sampleDates=(usableDays.length>=3?usableDays:nutritionDays).map(x=>x.date),signals=[],patterns=[];
  const addSignal=(id,priority,title,data={})=>signals.push({id,priority,title,...data});
  const addPattern=(id,title,data={})=>patterns.push({id,title,...data});
  const occasions=sampleDates.flatMap(coachSnackOccasionsForDate);
  const byDate=Object.fromEntries(sampleDates.map(d=>[d,occasions.filter(x=>x.date===d)]));
  const avgSnackCount=sampleDates.length?coachAvg(sampleDates.map(d=>byDate[d].length))||0:0;
  const totalSnackKcal=occasions.reduce((s,x)=>s+x.kcal,0);
  const baseline=coachEnsureState().baseline||{};
  const baselineCount=Number(baseline.avgSnackCount);
  if(Number.isFinite(baselineCount)&&baselineCount>0&&avgSnackCount>=Math.max(1,baselineCount*1.30)&&sampleDates.length>=3){
    addSignal('snack_increase_vs_baseline',3,'Collations plus fréquentes que d’habitude',{avgSnackCount,baselineAvgSnackCount:baselineCount,changeRatio:avgSnackCount/baselineCount});
  }

  const slotCounts={morning:0,afternoon:0,evening:0,night:0,unknown:0};
  occasions.forEach(x=>slotCounts[x.slot]=(slotCounts[x.slot]||0)+1);
  Object.entries(slotCounts).forEach(([slot,count])=>{if(slot!=='unknown'&&count>=3)addPattern(`snack_slot_${slot}`,'Collations répétées au même moment',{slot,count});});

  const linked=occasions.filter(x=>x.previousMeal);
  const afterLightMeal=linked.filter(x=>{
    const p=x.previousMeal;
    const lowKcal=p.kcal>0&&p.kcal<500,lowProtein=p.protein!==null&&p.protein<20,lowFiber=p.fiber!==null&&p.fiber<5;
    return (lowKcal&&(lowProtein||lowFiber)) || (lowProtein&&lowFiber);
  });
  const byPrevType={};
  afterLightMeal.forEach(x=>{const t=x.previousMeal.type||'Repas';(byPrevType[t]||(byPrevType[t]=[])).push(x);});
  Object.entries(byPrevType).forEach(([meal,items])=>{
    if(items.length>=3){
      addSignal('snacks_after_light_meal',4,'Collations souvent précédées d’un repas peu rassasiant',{meal,count:items.length,days:[...new Set(items.map(x=>x.date))],avgPreviousKcal:coachAvg(items.map(x=>x.previousMeal.kcal)),avgPreviousProtein:coachAvg(items.map(x=>x.previousMeal.protein)),avgPreviousFiber:coachAvg(items.map(x=>x.previousMeal.fiber)),avgGapMinutes:coachAvg(items.map(x=>x.previousMeal.gapMinutes))});
    }
  });

  const eveningOrNight=occasions.filter(x=>['evening','night'].includes(x.slot));
  const lateByDate={};
  eveningOrNight.forEach(x=>{(lateByDate[x.date]||(lateByDate[x.date]=[])).push(x);});
  const heavyLateDays=Object.entries(lateByDate).map(([date,items])=>({date,kcal:items.reduce((s,x)=>s+x.kcal,0),items})).filter(x=>x.kcal>200);
  if(heavyLateDays.length>=4){
    const withDinner=heavyLateDays.filter(x=>x.items.some(i=>i.previousMeal?.type==='Dîner'));
    addSignal('repeated_evening_snacks',4,'Collations du soir répétées',{count:heavyLateDays.length,days:heavyLateDays.map(x=>x.date),totalKcal:Math.round(heavyLateDays.reduce((s,x)=>s+x.kcal,0)),afterDinnerDays:withDinner.length});
  }

  const longGapSnacks=linked.filter(x=>Number(x.previousMeal.gapMinutes)>360);
  if(longGapSnacks.length>=3)addPattern('snacks_after_long_gap','Collations après une longue période sans manger',{count:longGapSnacks.length,days:[...new Set(longGapSnacks.map(x=>x.date))],avgGapMinutes:coachAvg(longGapSnacks.map(x=>x.previousMeal.gapMinutes))});

  signals.sort((a,b)=>a.priority-b.priority);
  return{
    version:'2C',endDate,phase:coachObservationPhase(),
    readyForGuidance:coachObservationPhase()==='active'&&usableDays.length>=3,
    dataQuality:{nutritionDays:nutritionDays.length,usableDays:usableDays.length,sufficient:nutritionDays.length>=3},
    snacks:{avgCountPerLoggedDay:avgSnackCount,totalKcal:Math.round(totalSnackKcal),occasionCount:occasions.length,slotCounts,heavyLateDays:heavyLateDays.length,linkedToPreviousMeal:linked.length,afterLightMealCount:afterLightMeal.length,occasions},
    patterns,signals
  };
}


/* ---------- Coach nutrition v1.1 — analyse étape 2D : protéines, fibres + satiété ----------
 * Module pur : aucune exécution automatique au démarrage.
 * Le potentiel rassasiant est un indicateur interne uniquement. Il sert à comprendre
 * les repas répétés, jamais à attribuer une note visible ou à juger un repas isolé.
 */
function coachMealSatietyForDate(date){
  const foods=Array.isArray(DATA.foodLog?.[date])?DATA.foodLog[date]:[];
  const targets=coachReferenceTargets(date);
  const mealNames=['Petit-déjeuner','Déjeuner','Dîner','En-cas'];
  return mealNames.map(type=>{
    const items=foods.filter(f=>coachMealType(f.mealType)===type);
    if(!items.length)return null;
    const kcal=items.reduce((s,f)=>s+(Number(f.kcal)||0),0);
    const protein=coachCompleteNutrientSum(items,'protein');
    const fiber=coachCompleteNutrientSum(items,'fiber');
    const carbs=coachCompleteNutrientSum(items,'carbs');
    const fat=coachCompleteNutrientSum(items,'fat');
    const sugar=coachCompleteNutrientSum(items,'sugar');
    const qty=items.reduce((s,f)=>{const q=Number(f.qty);return s+(Number.isFinite(q)&&q>0?q:0);},0);
    const density=qty>0?kcal/qty:null;
    let satietyScore=0;
    if(protein!==null){if(protein>=25)satietyScore+=2;else if(protein>=15)satietyScore+=1;}
    if(fiber!==null){if(fiber>=5)satietyScore+=2;else if(fiber>=3)satietyScore+=1;}
    if(density!==null){if(density<=1.5)satietyScore+=1;else if(density>=2.5)satietyScore-=1;}
    if(qty>=300&&density!==null&&density<=2)satietyScore+=1;
    if(sugar!==null&&protein!==null&&fiber!==null&&sugar>=30&&protein<15&&fiber<3)satietyScore-=1;
    const shareOfTarget=targets.calories>0?kcal/targets.calories:null;
    const denseItems=items.map(f=>{
      const q=Number(f.qty)||0,k=Number(f.kcal)||0;
      return{name:f.name||'Aliment',kcal:k,qty:q,density:q>0?k/q:null};
    }).filter(x=>x.kcal>0).sort((a,b)=>b.kcal-a.kcal).slice(0,3);
    return{date,type,kcal,protein,fiber,carbs,fat,sugar,qty,density,shareOfTarget,satietyScore,
      lowProtein:protein!==null&&protein<20,lowFiber:fiber!==null&&fiber<5,highDensity:density!==null&&density>=2.5,
      potentiallyLowSatiety:(protein!==null||fiber!==null)&&satietyScore<=1&&(kcal>=500||(shareOfTarget!==null&&shareOfTarget>=.35)),denseItems};
  }).filter(Boolean);
}
function coachMacroSatietyAnalysisSnapshot(endDate=TODAY){
  const dates=coachDates(endDate,7),observations=dates.map(coachDailyObservation);
  const nutritionDays=observations.filter(x=>x.hasNutritionData),usableDays=nutritionDays.filter(x=>x.confidence==='medium');
  const sample=usableDays.length>=3?usableDays:nutritionDays,signals=[],patterns=[];
  const addSignal=(id,priority,title,data={})=>signals.push({id,priority,title,...data});
  const addPattern=(id,title,data={})=>patterns.push({id,title,...data});

  const proteinDays=sample.filter(day=>day.macroCoverage?.protein).map(day=>{
    const value=Number(day.totals?.protein),target=Number(day.targets?.protein)||0;
    return{date:day.date,value,target,ratio:target>0?value/target:null};
  });
  const lowProteinDays=proteinDays.filter(x=>x.ratio!==null&&x.ratio<.70);
  if(lowProteinDays.length>=4)addSignal('low_protein_repeated',5,'Protéines souvent sous la cible personnalisée',{
    count:lowProteinDays.length,days:lowProteinDays.map(x=>x.date),avgRatio:coachAvg(lowProteinDays.map(x=>x.ratio)),
    avgProtein:coachAvg(proteinDays.map(x=>x.value)),avgTarget:coachAvg(proteinDays.map(x=>x.target).filter(v=>v>0))
  });

  const fiberDays=sample.filter(day=>day.macroCoverage?.fiber).map(day=>{
    const kcal=Number(day.totals?.kcal)||0,fiber=Number(day.totals?.fiber),target=Number(day.targets?.fiber)||0;
    const per1000=kcal>0?fiber/kcal*1000:null;
    return{date:day.date,fiber,kcal,target,per1000,ratio:target>0?fiber/target:null};
  });
  const lowFiberDays=fiberDays.filter(x=>x.per1000!==null&&x.per1000<10);
  if(lowFiberDays.length>=4)addSignal('low_fiber_repeated',5,'Fibres souvent basses',{
    count:lowFiberDays.length,days:lowFiberDays.map(x=>x.date),avgPer1000:coachAvg(lowFiberDays.map(x=>x.per1000)),
    avgFiber:coachAvg(fiberDays.map(x=>x.fiber)),avgTarget:coachAvg(fiberDays.map(x=>x.target).filter(v=>v>0))
  });

  const meals=sample.flatMap(day=>coachMealSatietyForDate(day.date));
  const lowSatietyMeals=meals.filter(x=>x.potentiallyLowSatiety);
  const largeLowSatiety=lowSatietyMeals.filter(x=>x.shareOfTarget!==null&&x.shareOfTarget>=.45);
  const byType={};lowSatietyMeals.forEach(x=>(byType[x.type]||(byType[x.type]=[])).push(x));
  Object.entries(byType).forEach(([type,items])=>{
    if(items.length>=3)addSignal('repeated_low_satiety_meal',4,'Repas répétés potentiellement peu rassasiants',{
      meal:type,count:items.length,days:[...new Set(items.map(x=>x.date))],avgKcal:coachAvg(items.map(x=>x.kcal)),
      avgProtein:coachAvg(items.map(x=>x.protein)),avgFiber:coachAvg(items.map(x=>x.fiber)),avgDensity:coachAvg(items.map(x=>x.density).filter(v=>v!==null)),
      examples:items.slice(0,3).map(x=>({date:x.date,kcal:Math.round(x.kcal),protein:Math.round(x.protein),fiber:Math.round(x.fiber*10)/10,topItems:x.denseItems}))
    });
  });
  if(largeLowSatiety.length>=3)addSignal('large_low_satiety_meals',4,'Gros repas répétés avec faible potentiel rassasiant',{
    count:largeLowSatiety.length,days:[...new Set(largeLowSatiety.map(x=>x.date))],meals:largeLowSatiety.map(x=>x.type),
    avgShareOfTarget:coachAvg(largeLowSatiety.map(x=>x.shareOfTarget)),avgDensity:coachAvg(largeLowSatiety.map(x=>x.density).filter(v=>v!==null))
  });

  const highProteinMeals=meals.filter(x=>x.protein>=25),fiberRichMeals=meals.filter(x=>x.fiber>=5),lowDensityMeals=meals.filter(x=>x.density!==null&&x.density<=1.5);
  if(highProteinMeals.length>=4)addPattern('regular_protein_rich_meals','Repas régulièrement riches en protéines',{count:highProteinMeals.length});
  if(fiberRichMeals.length>=4)addPattern('regular_fiber_rich_meals','Repas régulièrement riches en fibres',{count:fiberRichMeals.length});
  if(lowDensityMeals.length>=4)addPattern('regular_low_density_meals','Repas régulièrement peu denses en calories',{count:lowDensityMeals.length});

  signals.sort((a,b)=>a.priority-b.priority);
  return{
    version:'2D',endDate,phase:coachObservationPhase(),
    readyForGuidance:coachObservationPhase()==='active'&&usableDays.length>=3,
    dataQuality:{nutritionDays:nutritionDays.length,usableDays:usableDays.length,sufficient:nutritionDays.length>=3},
    macros:{protein:{avg:coachAvg(proteinDays.map(x=>x.value)),avgTarget:coachAvg(proteinDays.map(x=>x.target).filter(v=>v>0)),lowDays:lowProteinDays.length},
      fiber:{avg:coachAvg(fiberDays.map(x=>x.fiber)),avgTarget:coachAvg(fiberDays.map(x=>x.target).filter(v=>v>0)),lowDays:lowFiberDays.length,avgPer1000:coachAvg(fiberDays.map(x=>x.per1000).filter(v=>v!==null))}},
    satiety:{mealCount:meals.length,lowSatietyMealCount:lowSatietyMeals.length,largeLowSatietyMealCount:largeLowSatiety.length,meals},
    patterns,signals
  };
}


/* ---------- Coach nutrition v1.1 — analyse étape 2E : poids + sport ----------
 * Module pur : aucun calcul automatique au démarrage.
 */
function coachWeightPoints(endDate=TODAY,days=28){
  const start=coachDates(endDate,days)[0];
  return (Array.isArray(DATA.weights)?DATA.weights:[])
    .map(x=>({date:String(x.date||'').slice(0,10),weight:Number(x.weight)}))
    .filter(x=>x.date&&x.weight>0&&x.date>=start&&x.date<=endDate)
    .sort((a,b)=>a.date.localeCompare(b.date));
}
function coachWeightAverageForDates(dates){
  const set=new Set(dates),vals=(Array.isArray(DATA.weights)?DATA.weights:[])
    .filter(x=>set.has(String(x.date||'').slice(0,10))).map(x=>Number(x.weight)).filter(v=>v>0);
  return coachAvg(vals);
}
function coachWeightSportAnalysisSnapshot(endDate=TODAY){
  const dates=coachDates(endDate,21),observations=dates.map(coachDailyObservation);
  const last7=observations.slice(-7),nutritionDays=last7.filter(x=>x.hasNutritionData),usableDays=nutritionDays.filter(x=>x.confidence==='medium');
  const signals=[],patterns=[];
  const addSignal=(id,priority,title,data={})=>signals.push({id,priority,title,...data});
  const addPattern=(id,title,data={})=>patterns.push({id,title,...data});

  const weights=coachWeightPoints(endDate,28);
  let weeklyRate=null;
  if(weights.length>=3){
    const first=weights[0],last=weights[weights.length-1],span=Math.max(1,coachDateDiff(first.date,last.date));
    weeklyRate=(last.weight-first.weight)/(span/7);
    if(span>=10&&weeklyRate<-1)addSignal('rapid_weight_loss',1,'Perte de poids rapide sur la tendance récente',{weeklyRate,from:first.weight,to:last.weight,spanDays:span});
  }

  const weekDates=[coachDates(endDate,21).slice(0,7),coachDates(endDate,14).slice(0,7),coachDates(endDate,7)];
  const weeklyWeights=weekDates.map(ds=>coachWeightAverageForDates(ds));
  const validWeekly=weeklyWeights.filter(v=>Number.isFinite(v));
  const objective=DATA.objective?.type;
  const energy=coachMealAnalysisSnapshot(endDate).energy;
  const adherence=Number.isFinite(energy.avgRatio)&&energy.avgRatio>=.85&&energy.avgRatio<=1.15;
  if(['fat_loss','weight_target'].includes(objective)&&validWeekly.length===3){
    const delta=weeklyWeights[2]-weeklyWeights[0];
    if(Math.abs(delta)<.2&&adherence)addSignal('weight_stagnation_with_adherence',5,'Poids stable malgré un apport proche de la cible',{threeWeekDelta:delta,weeklyWeights,avgRatio:energy.avgRatio});
  }

  const sportDays=last7.filter(x=>x.sport.sessions>0),nonSportDays=last7.filter(x=>x.hasNutritionData&&x.sport.sessions===0);
  if(sportDays.length>=2&&nonSportDays.length>=2){
    const sportSnack=coachAvg(sportDays.map(x=>x.snackCount))||0,restSnack=coachAvg(nonSportDays.map(x=>x.snackCount))||0;
    const sportSnackKcal=coachAvg(sportDays.map(x=>x.snackKcal))||0,restSnackKcal=coachAvg(nonSportDays.map(x=>x.snackKcal))||0;
    if(sportSnack>=restSnack+.75 || sportSnackKcal>=restSnackKcal+150){
      addSignal('sport_appetite_link',4,'Collations plus importantes les jours de sport',{sportDays:sportDays.length,nonSportDays:nonSportDays.length,sportSnackCount:sportSnack,restSnackCount:restSnack,sportSnackKcal,restSnackKcal});
    }else addPattern('sport_without_snack_shift','Pas de hausse nette des collations les jours de sport',{sportDays:sportDays.length});
  }

  const baseline=coachEnsureState().baseline||{};
  if(Number(baseline.sportDays)>=2)addPattern('usual_sport_rhythm','Rythme sportif connu',{baselineSportDays:Number(baseline.sportDays)||0,currentSportDays:sportDays.length});
  signals.sort((a,b)=>a.priority-b.priority);
  return{
    version:'2E',endDate,phase:coachObservationPhase(),
    readyForGuidance:coachObservationPhase()==='active'&&usableDays.length>=3,
    dataQuality:{nutritionDays:nutritionDays.length,usableDays:usableDays.length,sufficient:nutritionDays.length>=3},
    weight:{points:weights.length,weeklyRate,weeklyWeights,adherence},
    sport:{days:sportDays.length,sessions:sportDays.reduce((s,x)=>s+x.sport.sessions,0)},
    patterns,signals
  };
}

/* ---------- Coach nutrition v1.1 — fusion + hiérarchie finale ---------- */
function coachSignalStrength(signal){
  const count=Number(signal.count||signal.consecutiveDays||signal.occurrences||signal.days?.length)||1;
  return Math.min(10,count);
}
function coachFullAnalysisSnapshot(endDate=TODAY){
  const modules=[
    ['energy',coachMealAnalysisSnapshot(endDate)],
    ['drinks',coachDrinkAnalysisSnapshot(endDate)],
    ['snacks',coachSnackAnalysisSnapshot(endDate)],
    ['satiety',coachMacroSatietyAnalysisSnapshot(endDate)],
    ['weightSport',coachWeightSportAnalysisSnapshot(endDate)]
  ];
  const nutritionDays=Math.max(...modules.map(([,m])=>Number(m.dataQuality?.nutritionDays)||0));
  const usableDays=Math.max(...modules.map(([,m])=>Number(m.dataQuality?.usableDays)||0));
  const ready=coachObservationPhase()==='active'&&nutritionDays>=3;
  const seen=new Map();
  modules.forEach(([source,m])=>(m.signals||[]).forEach(s=>{
    const item={...s,source,strength:coachSignalStrength(s)};
    const prev=seen.get(item.id);
    if(!prev||item.priority<prev.priority||item.strength>prev.strength)seen.set(item.id,item);
  }));
  const signals=[...seen.values()].sort((a,b)=>(a.priority-b.priority)||(b.strength-a.strength));
  const patterns=modules.flatMap(([source,m])=>(m.patterns||[]).map(x=>({...x,source})));
  return{version:'2F',endDate,phase:coachObservationPhase(),readyForGuidance:ready,
    dataQuality:{nutritionDays,usableDays,sufficient:nutritionDays>=3},
    modules:Object.fromEntries(modules),signals,patterns,primarySignal:signals[0]||null};
}

function coachSignalCopy(signal){
  if(!signal)return null;
  const copies={
    very_low_intake:{observation:'Tes apports semblent très bas plusieurs jours de suite.',action:'Cette semaine, la priorité est de retrouver des journées suffisamment nourrissantes et de vérifier que tout est bien enregistré. Je ne réduis pas ta cible calorique.'},
    rapid_weight_loss:{observation:'La tendance de poids baisse rapidement sur les dernières semaines.',action:'On garde les calories pour l’instant et on vérifie d’abord que les apports sont suffisants et correctement enregistrés.'},
    high_day_to_day_variability:{observation:'Tes apports alternent fortement entre journées basses et journées hautes.',action:'Cette semaine, on peut tester un peu plus de régularité entre les journées, sans chercher à manger moins.'},
    calorie_target_variation:{observation:'Tes apports s’écartent souvent nettement de ta cible.',action:'Cette semaine, observe surtout ce qui rend certaines journées très différentes des autres. L’objectif est de comprendre le rythme, pas de compenser.'},
    repeated_high_intake:{observation:'Plusieurs journées sont nettement au-dessus de ta cible.',action:'On va d’abord identifier le moment qui concentre le plus de calories avant de modifier quoi que ce soit.'},
    large_meal_with_overage:{observation:`Tes ${signal.meal||'repas'} les plus importants sont parfois associés à un dépassement de la journée.`,action:'Cette semaine, garde un repas satisfaisant mais teste une petite réduction de l’élément le plus dense en calories, en conservant ou augmentant le volume avec des légumes ou un accompagnement riche en fibres.'},
    liquid_calorie_share:{observation:'Les boissons représentent une part notable de tes calories cette semaine.',action:'Teste simplement une substitution sur quelques boissons cette semaine et regarde si cela facilite ta journée sans augmenter la faim.'},
    frequent_sweet_drinks:{observation:'Les boissons sucrées reviennent plusieurs jours cette semaine.',action:'Cette semaine, remplace seulement une boisson sucrée habituelle par une option sans sucre ou de l’eau, sans changer le reste.'},
    notable_alcohol_calories:{observation:'L’alcool représente une quantité notable de calories cette semaine.',action:'Si tu veux tester un levier simple, alterne certains verres avec une boisson sans alcool ou de l’eau, sans chercher la perfection.'},
    snack_increase_vs_baseline:{observation:'Tes collations sont plus fréquentes que dans ton rythme habituel.',action:'Avant de chercher à les réduire, j’aimerais comprendre ce qui a changé cette semaine.'},
    snacks_after_light_meal:{observation:`Tes collations arrivent souvent après un ${String(signal.meal||'repas').toLowerCase()} assez léger.`,action:`Cette semaine, teste un ${String(signal.meal||'repas').toLowerCase()} légèrement plus rassasiant — surtout protéines et fibres — et observe si ta faim change ensuite.`},
    repeated_evening_snacks:{observation:'Les collations du soir reviennent régulièrement cette semaine.',action:'Cette semaine, observe si elles correspondent plutôt à de la faim, une envie, de la fatigue ou un contexte particulier avant de chercher à les modifier.'},
    large_low_satiety_meals:{observation:'Plusieurs gros repas semblent assez denses en calories pour relativement peu de protéines, fibres ou volume.',action:'Cette semaine, conserve le volume du repas mais teste plus de légumes/fibres et un peu moins de l’ingrédient le plus dense en calories.'},
    repeated_low_satiety_meal:{observation:`Plusieurs ${String(signal.meal||'repas').toLowerCase()} semblent peu rassasiants relativement à leurs calories.`,action:`Cette semaine, enrichis légèrement ce ${String(signal.meal||'repas').toLowerCase()} en protéines ou fibres et observe la faim qui suit.`},
    sport_appetite_link:{observation:'Tes collations semblent plus importantes les jours de sport.',action:'Cette semaine, observe simplement ta faim les jours d’entraînement. Si le lien se confirme, on pourra travailler la composition du repas autour de la séance plutôt que réduire les collations.'},
    low_protein_repeated:{observation:'Tes protéines sont souvent sous ta cible personnalisée.',action:'Cette semaine, ajoute une source de protéines à un seul repas qui en contient habituellement peu.'},
    low_fiber_repeated:{observation:'Tes fibres sont souvent basses cette semaine.',action:'Cette semaine, ajoute une source de fibres à un repas que tu manges déjà : légumes, fruit entier, légumineuses ou céréales complètes.'},
    weight_stagnation_with_adherence:{observation:'Ton poids semble stable depuis plusieurs semaines alors que ton apport est proche de la cible.',action:'Je garde ta cible pour ce bilan. Cette tendance est maintenant suffisamment claire pour être réévaluée lors de l’étape d’adaptation calorique.'}
  };
  return copies[signal.id]||{observation:signal.title||'J’ai repéré une tendance cette semaine.',action:'Cette semaine, on observe cette tendance sans modifier plusieurs choses à la fois.'};
}
function coachBehaviorQuestionForSignal(signal,endDate=TODAY){
  if(!signal||!['snack_increase_vs_baseline','repeated_evening_snacks'].includes(signal.id))return null;
  const recent=(coachEnsureState().contextAnswers||[]).find(x=>x.kind==='snack_context'&&coachDateDiff(x.date,endDate)<=14);
  return{id:`snack_context_${endDate}`,kind:'snack_context',text:'Cette semaine, tes collations ont changé. Quelle raison correspond le mieux ?',choices:['Faim','Envie','Stress','Fatigue','Ennui','Social','Autre'],answered:recent?.answer||null};
}
function coachPositivePoints(analysis){
  const out=[],energy=analysis.modules.energy?.energy||{},macro=analysis.modules.satiety?.macros||{},drinks=analysis.modules.drinks?.drinks||{};
  const ids=new Set((analysis.signals||[]).map(x=>x.id));
  if(Number.isFinite(energy.avgRatio)&&energy.avgRatio>=.85&&energy.avgRatio<=1.10)out.push('Ton apport calorique moyen est proche de ta cible.');
  if(!ids.has('low_protein_repeated')&&Number(macro.protein?.avg)>0&&Number(macro.protein?.avgTarget)>0&&macro.protein.avg/macro.protein.avgTarget>=.85)out.push('Tes protéines sont globalement régulières par rapport à ta cible.');
  if(!ids.has('low_fiber_repeated')&&Number(macro.fiber?.avg)>0&&Number(macro.fiber?.avgTarget)>0&&macro.fiber.avg/macro.fiber.avgTarget>=.80)out.push('Tes fibres sont globalement proches de leur repère.');
  if(Number(drinks.totalDrinkKcal)>0&&Number(drinks.weeklyShare)<=.05)out.push('Les boissons apportent peu de calories dans l’ensemble.');
  return out.slice(0,3);
}
function coachAdaptationWeekStats(endDate=TODAY,offsetDays=0){
  const end=coachDateObj(endDate);end.setDate(end.getDate()-offsetDays);const key=todayStr(end);
  const obs=coachDates(key,7).map(coachDailyObservation),nutrition=obs.filter(x=>x.hasNutritionData);
  const ratios=nutrition.map(x=>Number(x.caloriePct)).filter(Number.isFinite);
  return{endDate:key,days:nutrition.length,avgRatio:coachAvg(ratios),avgCalories:coachAvg(nutrition.map(x=>Number(x.totals?.kcal)||0)),avgTarget:coachAvg(nutrition.map(x=>Number(x.targets?.calories)||0).filter(v=>v>0))};
}
function coachCalorieAdaptationAssessment(analysis,endDate=TODAY){
  const target=currentTargets(),st=coachEnsureState(),objective=DATA.objective?.type,current=Number(target.calories)||0;
  const result={eligible:false,delta:0,from:current,to:current,reason:'Je garde ta cible actuelle.',checks:{}};
  if(!current||coachObservationPhase()!=='active')return result;
  const w0=coachAdaptationWeekStats(endDate,0),w1=coachAdaptationWeekStats(endDate,7);
  result.checks={currentWeekDays:w0.days,previousWeekDays:w1.days,currentWeekRatio:w0.avgRatio,previousWeekRatio:w1.avgRatio};
  if(w0.days<5||w1.days<5){result.reason='Il faut au moins deux semaines avec 5 jours enregistrés chacune avant d’adapter les calories.';return result;}
  if(!Number.isFinite(w0.avgRatio)||!Number.isFinite(w1.avgRatio)||w0.avgRatio<.85||w0.avgRatio>1.15||w1.avgRatio<.85||w1.avgRatio>1.15){result.reason='Ton apport n’est pas encore assez proche de la cible sur deux semaines pour interpréter correctement la tendance du poids.';return result;}
  const ids=new Set((analysis?.signals||[]).map(x=>x.id));
  if(ids.has('very_low_intake')||ids.has('high_day_to_day_variability')||ids.has('calorie_target_variation')){result.reason='Je préfère d’abord stabiliser les apports avant de modifier la cible calorique.';return result;}
  const sortedAdjustments=(st.calorieAdjustments||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));const last=sortedAdjustments.length?sortedAdjustments[sortedAdjustments.length-1]:null;
  if(last&&coachDateDiff(last.date,endDate)<14){result.reason='Une adaptation a déjà été faite récemment. Je garde cette cible au moins deux semaines avant de réévaluer.';return result;}
  const lossGoal=['fat_loss','recomposition'].includes(objective)||(objective==='weight_target'&&Number(DATA.objective?.targetWeight)>0&&Number(DATA.profile?.weightCurrent)>Number(DATA.objective?.targetWeight));
  if(!lossGoal){result.reason='L’adaptation automatique est pour l’instant réservée aux objectifs de perte de poids ou recomposition.';return result;}
  const calorieFloor=typeof nutritionCalorieFloor==='function'?nutritionCalorieFloor(DATA.profile):1400;
  if(ids.has('rapid_weight_loss')){
    result.eligible=true;result.delta=100;result.to=Math.max(calorieFloor,current+100);result.reason='Ta perte de poids paraît rapide malgré un apport proche de la cible. Je propose une petite hausse de 100 kcal et une nouvelle observation pendant deux semaines.';return result;
  }
  if(ids.has('weight_stagnation_with_adherence')){
    const next=Math.max(calorieFloor,current-100);
    if(next>=current){result.reason='Ta cible est déjà au plancher de sécurité. Je ne la réduis pas davantage.';return result;}
    result.eligible=true;result.delta=next-current;result.to=next;result.reason='Ton poids semble stable depuis plusieurs semaines alors que ton apport est proche de la cible. Je propose une baisse prudente de 100 kcal puis une réévaluation dans deux semaines.';return result;
  }
  result.reason='La tendance actuelle ne justifie pas de modifier ta cible calorique.';
  return result;
}
function coachApplyCalorieProposal(){
  const st=coachEnsureState(),r=st.lastGeneratedReport,p=r?.calorie?.proposal;if(!p||!p.eligible||r?.calorie?.applied)return;
  const current=Number(currentTargets().calories)||0;if(!current)return;
  DATA.nutrition.coachCalorieAdjustment=(Number(DATA.nutrition.coachCalorieAdjustment)||0)+Number(p.delta||0);
  ensureTargets();const next=Number(DATA.nutrition.caloriesTarget)||current;
  DATA.nutrition.calorieTargetHistory=DATA.nutrition.calorieTargetHistory||{};DATA.nutrition.calorieTargetHistory[TODAY]=Math.round(next);
  st.calorieAdjustments.push({date:TODAY,from:current,to:next,delta:next-current,reason:p.reason,reportEndDate:r.endDate});
  if(st.calorieAdjustments.length>24)st.calorieAdjustments=st.calorieAdjustments.slice(-24);
  r.calorie.applied=true;r.calorie.appliedAt=new Date().toISOString();r.calorie.appliedTarget=next;r.calorie.text=`Nouvelle cible : ${Math.round(next)} kcal.`;r.calorie.reason=`${p.reason} La nouvelle cible est appliquée et sera réévaluée après au moins deux semaines.`;
  saveState();toast(`Nouvelle cible : ${Math.round(next)} kcal`);renderAll();
}
function coachDismissCalorieProposal(){
  const st=coachEnsureState(),r=st.lastGeneratedReport;if(!r?.calorie?.proposal)return;r.calorie.dismissed=true;r.calorie.text=`On garde ${Math.round(currentTargets().calories)} kcal.`;r.calorie.reason='Tu as choisi de conserver ta cible actuelle. Le coach continuera à observer la tendance.';saveState();renderWeeklyReport('weeklyReportHome');
}
function coachGenerateWeeklyReport(endDate=TODAY){
  coachUpdateObservationState();
  const st=coachEnsureState(),phase=coachObservationPhase(),target=currentTargets();
  if(!target.calories)return{status:'setup'};
  if(phase!=='active')return{status:'calibration',phase};
  const analysis=coachFullAnalysisSnapshot(endDate);
  if(!analysis.dataQuality.sufficient)return{status:'insufficient',analysis};
  const energy=analysis.modules.energy.energy||{},weight=analysis.modules.weightSport.weight||{};
  const selected=analysis.signals.slice(0,2),primary=selected[0]||null,copy=coachSignalCopy(primary);
  const positives=coachPositivePoints(analysis);
  const question=coachBehaviorQuestionForSignal(primary,endDate);
  const adaptation=coachCalorieAdaptationAssessment(analysis,endDate);
  let calorieText=adaptation.eligible?`Je propose de passer de ${Math.round(adaptation.from)} à ${Math.round(adaptation.to)} kcal.`:`On garde ${Math.round(target.calories)} kcal.`;
  let calorieReason=adaptation.reason;
  if(primary?.id==='very_low_intake')calorieReason='Tes données indiquent qu’il ne faut surtout pas réduire davantage les calories.';
  const report={
    status:'ready',version:'3.0',generatedAt:new Date().toISOString(),endDate,
    cap:{avgCalories:energy.avgCalories,avgTarget:energy.avgTarget||target.calories,weightWeeklyRate:weight.weeklyRate,loggedDays:analysis.dataQuality.nutritionDays},
    positives,observations:selected.map(s=>coachSignalCopy(s).observation),
    priority:copy?copy.action:'Rien de particulier à corriger cette semaine. Continue normalement et on regarde la suite.',
    calorie:{text:calorieText,reason:calorieReason,proposal:adaptation},
    question,primarySignalId:primary?.id||null,analysisSummary:{signalIds:analysis.signals.map(x=>x.id),patterns:analysis.patterns.map(x=>x.id)}
  };
  st.lastGeneratedReport=report;
  st.recommendationHistory=Array.isArray(st.recommendationHistory)?st.recommendationHistory:[];
  st.recommendationHistory.push({date:endDate,signalId:report.primarySignalId,priority:report.priority});
  if(st.recommendationHistory.length>24)st.recommendationHistory=st.recommendationHistory.slice(-24);
  saveState();
  return report;
}
function coachAnswerContext(questionId,answer){
  const st=coachEnsureState(),allowed=['Faim','Envie','Stress','Fatigue','Ennui','Social','Autre'];
  if(!allowed.includes(answer))return;
  st.contextAnswers.push({id:questionId,kind:'snack_context',date:TODAY,answer});
  if(st.contextAnswers.length>50)st.contextAnswers=st.contextAnswers.slice(-50);
  if(st.lastGeneratedReport?.question?.id===questionId)st.lastGeneratedReport.question.answered=answer;
  saveState();toast('Réponse enregistrée');renderWeeklyReport('weeklyReportHome');
}
function coachClearGeneratedReport(){
  const st=coachEnsureState();st.lastGeneratedReport=null;saveState();renderWeeklyReport('weeklyReportHome');
}

function rememberDailyCalorieTarget(date=TODAY){
  DATA.nutrition=DATA.nutrition||{};
  DATA.nutrition.calorieTargetHistory=DATA.nutrition.calorieTargetHistory||{};
  const target=Number(currentTargets().calories)||0;
  if(target>0 && !Number(DATA.nutrition.calorieTargetHistory[date])) DATA.nutrition.calorieTargetHistory[date]=Math.round(target);
  return target;
}
function nutrientNumberOrNull(value){if(value===null||value===undefined||value==='')return null;const x=Number(value);return Number.isFinite(x)&&x>=0?x:null;}
function scaledNutrient(value,ratio,digits=1){const x=nutrientNumberOrNull(value);if(x===null)return null;const m=10**digits;return Math.round(x*ratio*m)/m;}
function nutrientDisplay(value,digits=1){const x=nutrientNumberOrNull(value);return x===null?'—':x.toLocaleString('fr-FR',{maximumFractionDigits:digits});}
function nutrientInputValue(id){const raw=String(document.getElementById(id)?.value??'').trim();return raw===''?null:nutrientNumberOrNull(raw);}
function nutrientInputInRange(id,max){const raw=String(document.getElementById(id)?.value??'').trim();if(raw==='')return true;const n=Number(raw.replace(',','.'));return Number.isFinite(n)&&n>=0&&n<=max;}
function nutrientKnown(day,key){return Number(day?._known?.[key]||0)>0;}
function nutrientPartial(day,key,date=TODAY){const entries=(DATA.foodLog?.[date]||[]).length,known=Number(day?._known?.[key]||0);return entries>0&&known>0&&known<entries;}
function dayNutrientText(day,key,digits=0,unit='g',date=TODAY){if(!nutrientKnown(day,key))return'—';const x=Number(day[key]||0),txt=x.toLocaleString('fr-FR',{maximumFractionDigits:digits});return`${nutrientPartial(day,key,date)?'≈ ':''}${txt}${unit?' '+unit:''}`;}
function proteinIntakeText(day,date=TODAY){const known=nutrientKnown(day,'protein'),entries=(DATA.foodLog?.[date]||[]).length;if(!known)return entries?'— g':'0 g';const consumed=Math.round(Number(day.protein)||0);return`${nutrientPartial(day,'protein',date)?'≈ ':''}${consumed} g`;}
function dayTotals(date=TODAY){
  const list=DATA.foodLog[date]||[];
  const fields=['kcal','protein','carbs','fat','sugar','fiber','satFat','salt','sodium','potassium','calcium','iron','magnesium','vitaminC'];
  const base=Object.fromEntries(fields.map(k=>[k,0]));base._known=Object.fromEntries(fields.map(k=>[k,0]));
  const rawFor=(f,key)=>key==='carbs'?(f.carbs??f.carb):key==='satFat'?(f.satFat??f.saturatedFat):f[key];
  list.forEach(f=>fields.forEach(key=>{const v=nutrientNumberOrNull(rawFor(f,key));if(v!==null){base[key]+=v;base._known[key]++;}}));
  const drinkEntries=(Array.isArray(DATA.drinkLog)?DATA.drinkLog:[]).filter(x=>x.date===date);drinkEntries.forEach(x=>{const kcal=nutrientNumberOrNull(x.kcal);if(kcal!==null){base.kcal+=kcal;base._known.kcal++;}});
  return base;
}

function drinkHydrationMl(entry){
  if(!entry)return 0;
  const cat=String(entry.category||'').toLowerCase();
  const name=String(entry.name||'').toLowerCase();
  // Alcoholic drinks are intentionally excluded from the hydration counter.
  const eligible=cat==='hot'||cat==='soft'||cat==='juice'||(cat==='beer'&&name.includes('sans alcool'));
  if(!eligible)return 0;
  const meta=drinkPortionMeta(entry.portion);if(!meta||!(meta.qty>0))return 0;
  if(meta.unit==='cl')return meta.qty*10;
  if(meta.unit==='ml')return meta.qty;
  if(meta.unit==='l')return meta.qty*1000;
  return 0;
}
function drinkHydrationTotal(date=TODAY){
  const drinks=Array.isArray(DATA.drinkLog)?DATA.drinkLog:[];
  return drinks.filter(x=>x.date===date).reduce((s,x)=>s+drinkHydrationMl(x),0);
}
function waterTotal(date=TODAY){
  const water=(DATA.waterLog?.[date]||[]).reduce((s,x)=>s+Number(x.ml||0),0);
  return water+drinkHydrationTotal(date);
}
function macroTargets(calories){return {carbs:Math.round((calories||2100)*0.48/4),fat:Math.round((calories||2100)*0.27/9),fiber:30};}
function macroPct(v,target){return target?Math.min(100,Math.max(0,v/target*100)):0;}
function lastNDays(n=7){return Array.from({length:n},(_,i)=>dateOffset(-(n-1-i)));}
function avgFor(key,days=7){const dates=lastNDays(days);const vals=dates.map(d=>dayTotals(d)[key]).filter(v=>v>0);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;}
function weightTrend(){const pts=DATA.weights.slice().sort((a,b)=>a.date.localeCompare(b.date));if(pts.length<2)return null;const recent=pts.filter(x=>x.date>=dateOffset(-6));const prior=pts.filter(x=>x.date<dateOffset(-6)).slice(-7);if(recent.length<2)return null;const avg=a=>a.reduce((s,x)=>s+x.weight,0)/a.length;const r=avg(recent);const p=prior.length?avg(prior):pts.length>1?pts[pts.length-2].weight:null;return p?{recent:r,previous:p,delta:r-p,points:recent.length}:null;}
function coachDecision(){
  coachUpdateObservationState();
  const target=currentTargets(),status=coachObservationStatus(),week=DATA.nutritionCoach?.lastWeek||{},baseline=DATA.nutritionCoach?.baseline||{};
  if(!target.calories)return{status:'setup',title:'Complète ton profil',text:'J’ai besoin de ton âge, sexe, taille et poids pour calculer ton point de départ.',target,week,baseline};
  return{status:'observe',phase:status.phase,title:status.title,text:status.text,target,week,baseline,avgK:week.avgCalories,avgP:week.avgProtein,trend:weightTrend(),proteinNote:'Le coach est en phase d’observation : aucune recommandation nutritionnelle automatique n’est appliquée pour le moment.'};
}
function weeklyReport(){return coachDecision();}

/* ---------- Hydration ---------- */
function openWaterSheet(){closeSheet('addMenuOverlay');setVal('waterQty','250');openSheet('waterSheetOverlay');}
function addWater(){
  refreshToday();
  const input=document.getElementById('waterQty');
  const ml=Math.round(Number(input?.value||250));
  if(!(ml>0&&ml<=NUTRITION_LIMITS.waterMl)){toast('Indique une quantité d’eau entre 1 et 5 000 ml');return;}
  addWaterAmount(ml);
  closeSheet('waterSheetOverlay');
}
function addWaterGlass(){
  refreshToday();
  addWaterAmount(250);
  toast('🥛 +1 verre d’eau');
}
function removeWaterGlass(){
  refreshToday();
  const list=Array.isArray(DATA.waterLog?.[TODAY])?DATA.waterLog[TODAY]:[];
  if(!list.length){toast('Aucun verre à enlever');return;}
  let remaining=250;
  while(remaining>0 && list.length){
    const last=list[list.length-1];
    const ml=Number(last.ml||0);
    if(ml<=remaining){remaining-=ml;list.pop();}
    else{last.ml=ml-remaining;remaining=0;}
  }
  DATA.waterLog[TODAY]=list;
  saveState();
  renderFood();
  toast('🥛 −1 verre d’eau');
}
function addWaterAmount(ml){
  refreshToday();ml=Math.round(Number(ml));
  if(!(ml>0&&ml<=NUTRITION_LIMITS.waterMl)){toast('Quantité d’eau invalide');return false;}
  if(!DATA.waterLog || typeof DATA.waterLog!=='object') DATA.waterLog={};
  if(!Array.isArray(DATA.waterLog[TODAY])) DATA.waterLog[TODAY]=[];
  DATA.waterLog[TODAY].push({id:'w'+Date.now()+Math.random().toString(36).slice(2,6),ml,time:new Date().toTimeString().slice(0,5)});
  try{saveState();}catch(e){console.error(e);toast('Impossible d’enregistrer l’eau');return;}
  renderFood();
  return true;
}

/* ---------- Meal timing helpers ---------- */
function mealTypeForHour(hour){if(hour<10)return'Petit-déjeuner';if(hour<15)return'Déjeuner';if(hour<18)return'En-cas';return'Dîner';}
function localTimeMeta(){const d=new Date();return{time:d.toTimeString().slice(0,5),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'local',mealType:mealTypeForHour(d.getHours())};}

/* ---------- Home ---------- */

const DRINK_CATALOG={
  hot:[
    ['☕ Café filtre','25 cl',5],['☕ Espresso','3 cl',2],['☕ Café allongé','15 cl',3],
    ['🍵 Thé noir','25 cl',1],['🍵 Thé vert','25 cl',1],['🌿 Infusion','25 cl',1],
    ['🫖 Rooibos','25 cl',1],['🌾 Chicorée soluble','25 cl',10],['🍵 Matcha à l’eau','25 cl',5]
  ],
  soft:[
    ['🥤 Coca-Cola','25 cl',105],['🥤 Coca-Cola Zero','25 cl',1],['🥤 Pepsi','25 cl',105],
    ['🥤 Orangina','25 cl',110],['🥤 Fanta Orange','25 cl',95],['🥤 Sprite','25 cl',80],
    ['🥤 Schweppes Tonic','25 cl',85],['🥤 Ice Tea sucré','25 cl',50]
  ],
  juice:[
    ['🧃 Jus d’orange','20 cl',90],['🧃 Jus de pomme','20 cl',90],['🧃 Nectar de fruits','20 cl',100]
  ],
  beer:[
    ['🍺 Bière blonde','25 cl',105],['🍺 Bière blonde','33 cl',140],['🍺 Bière blanche','25 cl',115],
    ['🍺 Bière ambrée','25 cl',120],['🍺 Bière IPA','25 cl',150],['🍺 Bière forte','25 cl',170],
    ['🍺 Bière sans alcool','25 cl',60],['🍺 Panaché','25 cl',80],['🍺 Monaco','25 cl',90]
  ],
  wine:[
    ['🍷 Vin rouge','10 cl',85],['🍷 Vin blanc sec','10 cl',80],['🍷 Vin rosé','10 cl',80],
    ['🥂 Champagne','10 cl',80],['🍷 Vin blanc moelleux','10 cl',110],['🍷 Vin liquoreux','10 cl',130],
    ['🍷 Porto','6 cl',95],['🍷 Muscat','10 cl',115]
  ],
  cider:[
    ['🍏 Cidre brut','25 cl',100],['🍏 Cidre demi-sec','25 cl',120],['🍏 Cidre doux','25 cl',140],
    ['🍎 Poiré','25 cl',110]
  ],
  spirit:[
    ['🥃 Whisky','4 cl',95],['🥃 Rhum','4 cl',90],['🥃 Vodka','4 cl',90],
    ['🥃 Gin','4 cl',90],['🥃 Tequila','4 cl',90],['🍷 Porto','6 cl',95]
  ],
  cocktail:[
    ['🍸 Gin tonic','25 cl',170],['🍹 Mojito','25 cl',180],['🍹 Piña colada','25 cl',300],
    ['🍹 Spritz','20 cl',150],['🍹 Kir','10 cl',110],['🍺 Picon bière','25 cl',170]
  ]
};
function toggleDrinkHistory(){const l=document.getElementById('drinkTodayList'),b=document.querySelector('.drink-history-toggle');if(!l||!b)return;const open=l.style.display!=='none';l.style.display=open?'none':'block';b.classList.toggle('open',!open);}
function openDrinkPicker(){const p=document.getElementById('drinkPicker');if(p)p.style.display='block';}
function closeDrinkPicker(){customDrinkSelection=null;const p=document.getElementById('drinkPicker');if(p)p.style.display='none';const c=document.getElementById('drinkChoices');if(c){c.style.display='none';c.innerHTML='';}}
function drinkPortionMeta(portion){const m=String(portion||'').trim().match(/^([\d.,]+)\s*([a-zA-Z]+)$/);if(!m)return null;const qty=Number(m[1].replace(',','.'));return qty>0?{qty,unit:m[2].toLowerCase()}:null;}
function showDrinkCategory(cat){
  const c=document.getElementById('drinkChoices');if(!c)return;customDrinkSelection=null;const list=DRINK_CATALOG[cat]||[];
  c.innerHTML=list.map((x,i)=>`<div class="drink-choice-row"><button class="drink-choice drink-choice-main" onclick="addDrink('${cat}',${i})"><span>${x[0]}</span><small>${x[1]} · ${x[2]} kcal</small></button><button class="drink-customize" type="button" onclick="event.stopPropagation();openCustomDrink('${cat}',${i})">Personnaliser</button></div>`).join('');
  c.style.display='grid';
}
function addDrink(cat,i){refreshToday();const x=DRINK_CATALOG[cat]?.[i];if(!x)return;if(!Array.isArray(DATA.drinkLog))DATA.drinkLog=normaliseDrinkLog(DATA.drinkLog);rememberDailyCalorieTarget(TODAY);DATA.drinkLog.push({date:TODAY,name:x[0],portion:x[1],kcal:Number(x[2])||0,category:cat,time:new Date().toTimeString().slice(0,5)});saveState();renderAll();toast(x[0]+' ajouté');}
function openCustomDrink(cat,i){
  const x=DRINK_CATALOG[cat]?.[i],meta=drinkPortionMeta(x?.[1]);if(!x||!meta)return;
  customDrinkSelection={cat,i,baseQty:meta.qty,unit:meta.unit,baseKcal:Number(x[2])||0,name:x[0]};
  const c=document.getElementById('drinkChoices');if(!c)return;
  c.innerHTML=`<div class="drink-custom-panel"><div class="drink-custom-head"><strong>${x[0]}</strong><small>Portion habituelle : ${x[1]} · ${x[2]} kcal</small></div><label class="drink-custom-field"><span>Quantité</span><span class="drink-custom-input-wrap"><input id="customDrinkQty" type="text" inputmode="decimal" value="${meta.qty}" oninput="updateCustomDrinkPreview()"><b>${meta.unit}</b></span></label><div class="drink-custom-preview"><span>Calories estimées</span><strong id="customDrinkKcal">${x[2]} kcal</strong></div><div class="drink-custom-actions"><button type="button" class="drink-custom-back" onclick="showDrinkCategory('${cat}')">← Retour</button><button type="button" class="drink-custom-add" onclick="confirmCustomDrink()">Ajouter</button></div></div>`;
  c.style.display='grid';updateCustomDrinkPreview();setTimeout(()=>document.getElementById('customDrinkQty')?.select(),0);
}
function customDrinkQty(){const input=document.getElementById('customDrinkQty');return Number(String(input?.value||'').replace(',','.'));}
function customDrinkCalories(){const s=customDrinkSelection,qty=customDrinkQty();if(!s||!validDrinkQuantity(qty,s.unit)||!(s.baseQty>0))return null;return Math.max(0,Math.round(s.baseKcal*qty/s.baseQty));}
function updateCustomDrinkPreview(){const kcal=customDrinkCalories(),el=document.getElementById('customDrinkKcal');if(el)el.textContent=kcal===null?'—':`${kcal} kcal`;}
function confirmCustomDrink(){
  refreshToday();const s=customDrinkSelection,qty=customDrinkQty(),kcal=customDrinkCalories();if(!s||!validDrinkQuantity(qty,s.unit)||kcal===null){toast('Indique une quantité comprise entre 1 ml et 5 L');return;}
  if(!Array.isArray(DATA.drinkLog))DATA.drinkLog=normaliseDrinkLog(DATA.drinkLog);rememberDailyCalorieTarget(TODAY);
  const qtyLabel=qty.toLocaleString('fr-FR',{maximumFractionDigits:1});DATA.drinkLog.push({date:TODAY,name:s.name,portion:`${qtyLabel} ${s.unit}`,kcal,category:s.cat,time:new Date().toTimeString().slice(0,5)});
  saveState();renderAll();toast(`${s.name} · ${qtyLabel} ${s.unit} ajouté`);showDrinkCategory(s.cat);
}
function removeDrink(i){if(!DATA.drinkLog)return;DATA.drinkLog.splice(i,1);saveState();renderAll();}
function renderDrinkLog(){const items=(DATA.drinkLog||[]).map((x,i)=>({...x,idx:i})).filter(x=>x.date===TODAY);const kcal=items.reduce((s,x)=>s+(+x.kcal||0),0);setText('drinkCountToday',items.length);setText('drinkCaloriesToday',Math.round(kcal));const list=document.getElementById('drinkTodayList');if(!list)return;list.innerHTML=items.length?items.map(x=>`<div class="drink-item"><div class="drink-item-main"><span>${x.name}</span><span class="drink-item-cal">${x.portion} · ${x.kcal} kcal</span></div><button class="drink-remove" onclick="removeDrink(${x.idx})">×</button></div>`).join(''):'';
}

function stepsForDate(date=TODAY){const entry=DATA.stepsLog?.[date];return Math.max(0,Math.round(Number(typeof entry==='object'?entry?.steps:entry)||0));}
function recentStepValues(days=7){const values=[];for(let i=1;i<=days;i++){const v=stepsForDate(dateOffset(-i));if(v>0)values.push(v);}return values;}
function median(values){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function objectiveStepTarget(){const type=DATA.objective?.type;return({fat_loss:9000,weight_target:9000,recomposition:8500,maintain:7500,muscle_gain:7000})[type]||8000;}
function stepsGoal(){
  const manual=Math.round(Number(DATA.settings?.stepsGoal)||0);
  if(manual>=1000)return Math.min(30000,manual);
  const objective=objectiveStepTarget(),history=recentStepValues(7),baseline=median(history);
  if(history.length<3||!baseline)return objective;
  // Progression douce : au maximum environ +10 % ou +750 pas par étape.
  const increment=Math.min(750,Math.max(250,Math.round(baseline*0.10/250)*250));
  let target=baseline<objective?Math.min(objective,baseline+increment):objective;
  target=Math.round(target/250)*250;
  return Math.max(5000,Math.min(12000,target));
}
function estimateStepCalories(steps=stepsForDate()){
  const weight=Number(DATA.profile?.weightCurrent)||0;
  if(!(weight>0)||!(steps>0))return null;
  const heightCm=Number(DATA.profile?.height)||0;
  const sex=DATA.profile?.sex;
  // Longueur de pas estimée depuis la taille ; valeur neutre si la taille manque.
  const strideM=heightCm>0?(heightCm/100)*(sex==='femme'?0.413:0.415):0.72;
  const distanceKm=steps*strideM/1000;
  // Coût énergétique net approximatif d'une marche usuelle : ~0,5 kcal/kg/km.
  const kcal=weight*distanceKm*0.5;
  return {kcal:Math.max(0,Math.round(kcal)),distanceKm};
}
function renderSteps(){
  const steps=stepsForDate(),goal=stepsGoal(),pct=Math.min(100,steps/goal*100),estimate=estimateStepCalories(steps),history=recentStepValues(7);
  setText('homeSteps',steps.toLocaleString('fr-FR'));
  setText('homeStepsGoal',goal.toLocaleString('fr-FR'));
  setBar('homeStepsBar',pct);
  setText('homeStepsCalories',estimate?`≈ ${estimate.kcal} kcal`:'—');
  setText('homeStepsDistance',estimate?`≈ ${estimate.distanceKm.toFixed(1).replace('.',',')} km`:'—');
  setText('homeStepsGoalType',DATA.settings?.stepsGoal?'Objectif personnalisé':(history.length>=3?'Objectif adaptatif':'Objectif de départ'));
  const stepEntry=DATA.stepsLog?.[TODAY];
  const stepSource=stepEntry?.source==='withings'?'Withings · synchronisé':steps?'Estimation calories · pas saisis manuellement':'Saisie locale · connexion Santé à venir';
  setText('homeStepsSource',stepSource);
}
function editSteps(){refreshToday();const current=stepsForDate();const raw=prompt('Nombre de pas aujourd’hui',String(current));if(raw===null)return;const cleaned=String(raw).replace(/[\s\u00a0]/g,'').replace(',','.');const steps=Math.round(Number(cleaned));if(!Number.isFinite(steps)||steps<0||steps>200000){toast('Indique un nombre de pas entre 0 et 200 000');return;}DATA.stepsLog=DATA.stepsLog||{};DATA.stepsLog[TODAY]={steps,source:'manual',updatedAt:new Date().toISOString()};saveState();renderSteps();if(typeof renderFood==='function')renderFood();if(typeof renderSport==='function')renderSport();if(typeof renderHome==='function')renderHome();toast('Nombre de pas enregistré');}
function vitaCoachSnapshot(date=TODAY){
  const totals=dayTotals(date),targets=currentTargets(),steps=stepsForDate(date),goal=stepsGoal(),stepEstimate=estimateStepCalories(steps);
  const sessions=(DATA.sport?.sessionHistory||[]).filter(s=>(s.completedDate||s.date)===date);
  const sportMinutes=sessions.reduce((sum,s)=>sum+Number(s.durationMinutes||s.targetDuration||0),0);
  const sportKcal=sessions.reduce((sum,s)=>sum+(typeof sportKcalForSession==='function'?Number(sportKcalForSession(s))||0:0),0);
  const latest=(DATA.weights||[]).slice().sort((a,b)=>b.date.localeCompare(a.date))[0]||null;
  const trend=weightTrend();
  const recovery=typeof estimateRecovery==='function'?estimateRecovery():null;
  return {
    date,totals,targets,steps,goal,stepEstimate,sessions,sportMinutes,sportKcal,latest,trend,recovery,
    caloriePct:targets.calories?totals.kcal/targets.calories:null,
    proteinPct:targets.protein&&nutrientKnown(totals,'protein')&&!nutrientPartial(totals,'protein',date)?totals.protein/targets.protein:null,
    stepPct:goal?steps/goal:null
  };
}
function vitaCoachDecision(snapshot=vitaCoachSnapshot()){
  coachUpdateObservationState();
  const s=snapshot,status=coachObservationStatus(),actions=[];
  if(!s.targets.calories||!s.targets.protein){actions.push({priority:100,icon:'🎯',title:'Complète ton profil',text:'Renseigne âge, taille, poids et objectif pour démarrer le suivi personnalisé.',type:'setup'});return{status:'setup',title:'Coach en attente de ton profil',summary:actions[0].text,actions,snapshot:s};}
  const b=DATA.nutritionCoach?.baseline||{};
  const detail=status.phase==='week1'?'Je mémorise simplement ton rythme alimentaire cette semaine. Aucun repas isolé ne déclenche de conseil.':status.phase==='week2'?`Je calibre ta référence personnelle${Number.isFinite(b.mealShares?.['Dîner'])?` · dîner ≈ ${Math.round(b.mealShares['Dîner']*100)} % de tes apports observés`:''}.`:status.phase?.startsWith('recalibration')?'Ton objectif a changé : je conserve tes habitudes connues mais je recalibre la tendance pendant deux semaines.':'Tes données du jour enrichissent la référence personnelle utilisée pour le futur bilan hebdomadaire.';
  actions.push({priority:10,icon:'🧭',title:status.title,text:detail,type:'observation'});
  return{status:'observe',title:status.title,summary:status.text,actions,snapshot:s};
}
function renderVitaCoach(snapshot=vitaCoachSnapshot()){
  const d=vitaCoachDecision(snapshot),box=document.getElementById('dailyCoachActions');
  setText('dailyCoachTitle',d.title);
  if(!box)return d;
  box.innerHTML=d.actions.length?d.actions.map(a=>`<div class="daily-coach-action"><span class="daily-coach-icon">${a.icon}</span><div><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.text)}</span></div></div>`).join(''):'<div class="daily-coach-empty">Continue simplement à enregistrer ta journée.</div>';
  return d;
}
function renderDailySummary(){
  const totals=dayTotals(),targets=currentTargets(),steps=stepsForDate(),goal=stepsGoal(),stepEstimate=estimateStepCalories(steps);
  const sessions=(DATA.sport?.sessionHistory||[]).filter(s=>(s.completedDate||s.date)===TODAY);
  const sportMinutes=sessions.reduce((sum,s)=>sum+Number(s.durationMinutes||s.targetDuration||0),0);
  const sportKcal=sessions.reduce((sum,s)=>sum+(typeof sportKcalForSession==='function'?Number(sportKcalForSession(s))||0:0),0);
  const calPct=targets.calories?totals.kcal/targets.calories:0,proteinPct=targets.protein&&nutrientKnown(totals,'protein')&&!nutrientPartial(totals,'protein')?totals.protein/targets.protein:null,stepPct=goal?steps/goal:0;
  let nutritionLabel='À renseigner',nutritionDetail='Ajoute tes repas pour suivre tes apports.';
  if(totals.kcal>0&&targets.calories){
    nutritionLabel=calPct>=.8&&calPct<=1.1?'Dans la cible':calPct<.8?'En cours':'Au-dessus de la cible';
    nutritionDetail=`${Math.round(totals.kcal)} / ${targets.calories} kcal · ${dayNutrientText(totals,'protein',0,'g')} / ${targets.protein||'—'} g protéines`;
  } else if(totals.kcal>0){ nutritionLabel='Enregistrée'; nutritionDetail=`${Math.round(totals.kcal)} kcal consommées aujourd’hui`; }
  let activityLabel=steps?'En cours':'À renseigner';
  if(steps&&stepPct>=1)activityLabel='Objectif atteint'; else if(steps&&stepPct>=.7)activityLabel='Bien avancée';
  const activityDetail=steps?`${steps.toLocaleString('fr-FR')} / ${goal.toLocaleString('fr-FR')} pas${stepEstimate?` · ≈ ${stepEstimate.distanceKm.toFixed(1).replace('.',',')} km`:''}`:'Aucun pas renseigné aujourd’hui.';
  const sportLabel=sessions.length?'Séance réalisée':'Aucune séance';
  const sportDetail=sessions.length?`${sessions.length} séance${sessions.length>1?'s':''} · ${Math.round(sportMinutes)} min · ≈ ${Math.round(sportKcal)} kcal`:'Aucune séance enregistrée aujourd’hui — le repos peut aussi faire partie du programme.';
  const tr=weightTrend();
  const latest=(DATA.weights||[]).slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
  const weightLabel=latest?`${formatWeight(latest.weight)} kg`:'À renseigner';
  const weightDetail=tr?`Tendance récente : ${tr.delta>0?'+':''}${tr.delta.toFixed(1)} kg`:(latest?`Dernière pesée : ${formatDate(latest.date)}`:'Ajoute au moins deux pesées pour voir une tendance.');
  setText('dailyNutritionStatus',`Nutrition · ${nutritionLabel}`); setText('dailyNutritionDetail',nutritionDetail);
  setText('dailyActivityStatus',`Activité · ${activityLabel}`); setText('dailyActivityDetail',activityDetail);
  setText('dailySportStatus',`Sport · ${sportLabel}`); setText('dailySportDetail',sportDetail);
  setText('dailyWeightStatus',`Poids · ${weightLabel}`); setText('dailyWeightDetail',weightDetail);
  setText('dailyEnergyIn',`Apports : ${totals.kcal>0?Math.round(totals.kcal)+' kcal':'—'}`);
  const activityParts=[]; if(stepEstimate?.kcal)activityParts.push(`pas ≈ ${stepEstimate.kcal} kcal`); if(sportKcal>0)activityParts.push(`sport ≈ ${Math.round(sportKcal)} kcal`);
  setText('dailyEnergyOut',`Activité estimée : ${activityParts.length?activityParts.join(' · '):'—'}`);
  let complete=0; if(totals.kcal>0)complete++; if(steps>0)complete++; if(sessions.length)complete++; if(latest)complete++;
  let status=complete>=4?'Bien renseignée':complete>=2?'En cours':'À compléter';
  setText('dailySummaryStatus',status);
  let msg='Ajoute quelques données aujourd’hui pour obtenir un résumé plus utile.';
  if(totals.kcal>0||steps>0||sessions.length){
    const parts=[];
    if(targets.calories&&calPct>1.1)parts.push('tes apports dépassent actuellement la cible');
    else if(targets.calories&&calPct>=.8)parts.push('tes apports sont proches de la cible');
    if(steps>0&&stepPct>=1)parts.push('ton objectif de pas est atteint');
    else if(steps>0&&stepPct<.5)parts.push('l’activité quotidienne est encore faible par rapport à ton objectif');
    if(sessions.length)parts.push('ta séance du jour est enregistrée');
    if(proteinPct!==null&&proteinPct>0&&proteinPct<.7&&totals.kcal>0)parts.push('les protéines restent encore basses par rapport à la cible');
    msg=parts.length?parts.map((p,i)=>i? p.charAt(0).toLowerCase()+p.slice(1):p.charAt(0).toUpperCase()+p.slice(1)).join(' · ')+'.':'Ta journée est en cours : continue simplement à enregistrer ce que tu fais.';
  }
  setText('dailySummaryMessage',msg);
  renderVitaCoach(vitaCoachSnapshot());
}
function renderHome(){const p=DATA.profile,t=currentTargets(),today=dayTotals();document.getElementById('homeCalories').textContent=Math.round(today.kcal);document.getElementById('homeCaloriesGoal').textContent=t.calories?`${t.calories} kcal`:'—';document.getElementById('homeProtein').textContent=dayNutrientText(today,'protein',0,'g');document.getElementById('homeProteinGoal').textContent=t.protein?`${t.protein} g`:'—';document.getElementById('homeRemaining').textContent=t.calories?Math.max(0,Math.round(t.calories-today.kcal))+' kcal restantes':'Configure ton profil';setBar('homeCalBar',t.calories?Math.min(100,today.kcal/t.calories*100):0);const tr=weightTrend();document.getElementById('homeWeight').textContent=p.weightCurrent?formatWeight(p.weightCurrent)+' kg':'—';document.getElementById('homeTrend').textContent=tr?`${tr.delta>0?'+':''}${tr.delta.toFixed(1)} kg / période récente`:'Pas encore de données';setText('homeCurrentWeight',p.weightCurrent?formatWeight(p.weightCurrent)+' kg':'—');setText('homeWeightGoal',DATA.objective.targetWeight?formatWeight(DATA.objective.targetWeight)+' kg':'—');const ws=DATA.weights.slice().sort((a,b)=>b.date.localeCompare(a.date));setText('nutritionPreviousWeight',ws[1]?formatWeight(ws[1].weight)+' kg':'—');renderWeeklyReport('weeklyReportHome');renderDrinkLog();renderSteps();renderDailySummary();const wl=waterTotal();const wine=DATA.wineLog?.[TODAY]||0;setText('nutritionWaterToday',wl?Math.round(wl)+' ml':'—');setText('nutritionWineToday',wine?wine:'—');}

/* ---------- Food ---------- */
function allFoods(){return FOOD_DB.concat(DATA.customFoods||[]);}
let selectedMealType=mealTypeForHour(new Date().getHours());
let externalFoodResults=[];
let foodSearchTimer=null;
let foodSearchRequest=null;
let foodSearchSeq=0;
let activeFoodCategory='';
let foodUiRows=[];

function ensureFoodLibraryState(){if(!Array.isArray(DATA.foodFavorites))DATA.foodFavorites=[];}
function normalizeFoodBase(value){return String(value||'').toLowerCase().replace(/œ/g,'oe').replace(/æ/g,'ae').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’'`´]/g,' ').replace(/[-_/]/g,' ');}
function normalizeFoodText(value){return normalizeFoodBase(value).replace(/[.,;:()\[\]{}%]/g,' ').replace(/\s+/g,' ').trim();}
function foodKey(food){return `${normalizeFoodText(food?.name)}|${Math.round(Number(food?.kcal)||0)}`;}
function foodByName(name){const n=normalizeFoodText(name);return allFoods().find(f=>normalizeFoodText(f.name)===n)||null;}
function isFoodFavorite(food){ensureFoodLibraryState();return !!food&&DATA.foodFavorites.includes(foodKey(food));}
function foodLogEntries(){
  const rows=[];
  Object.entries(DATA.foodLog||{}).forEach(([date,items])=>(Array.isArray(items)?items:[]).forEach((item,i)=>rows.push({...item,_date:date,_order:`${date}T${item.time||'00:00'}:${String(i).padStart(3,'0')}`})));
  return rows;
}
function foodFrequencyMap(){const counts={};foodLogEntries().forEach(x=>{const k=normalizeFoodText(x.name);if(k)counts[k]=(counts[k]||0)+1;});return counts;}
function recentFoods(limit=6){
  const seen=new Set(),out=[];
  for(const entry of foodLogEntries().sort((a,b)=>b._order.localeCompare(a._order))){
    const k=normalizeFoodText(entry.name);if(!k||seen.has(k))continue;seen.add(k);
    const f=foodByName(entry.name);if(f)out.push(f);if(out.length>=limit)break;
  }
  return out;
}
function frequentFoods(limit=6){
  const counts=foodFrequencyMap();
  return allFoods().filter(f=>counts[normalizeFoodText(f.name)]).sort((a,b)=>(counts[normalizeFoodText(b.name)]||0)-(counts[normalizeFoodText(a.name)]||0)||a.name.localeCompare(b.name,'fr')).slice(0,limit);
}
function favoriteFoods(limit=8){ensureFoodLibraryState();return allFoods().filter(isFoodFavorite).slice(0,limit);}
function foodCategories(){return [...new Set(allFoods().map(f=>f.category).filter(Boolean))];}
function foodCategoryIcon(cat){return({'Protéines':'🥩','Féculents':'🍚','Fruits':'🍎','Légumes':'🥦','Légumineuses':'🫘','Laitiers':'🥛','Matières grasses':'🥜','Snacks':'🍫','Plats':'🍽️'})[cat]||'•';}
function resetFoodUiRows(){foodUiRows=[];}
function foodRowHtml(food,sub=''){
  const idx=foodUiRows.push(food)-1,fav=isFoodFavorite(food);
  const meta=sub||[food.category,food.portionLabel].filter(Boolean).join(' · ')||'100 g';
  return `<div class="sr-item food-library-row" onclick="pickVisibleFood(${idx})"><span class="food-library-main"><strong>${escapeHtml(food.name)}</strong><small>${escapeHtml(meta)}</small></span><span class="food-library-side"><span class="muted">${Math.round(Number(food.kcal)||0)} kcal</span><button type="button" class="food-fav-btn ${fav?'active':''}" aria-label="${fav?'Retirer des favoris':'Ajouter aux favoris'}" onclick="event.stopPropagation();toggleVisibleFoodFavorite(${idx})">${fav?'★':'☆'}</button></span></div>`;
}
function pickVisibleFood(index){const f=foodUiRows[index];if(!f)return;pickedFood=f;showPickedFood();}
function toggleVisibleFoodFavorite(index){const f=foodUiRows[index];if(!f)return;toggleFoodFavoriteObject(f);}
function togglePickedFoodFavorite(){if(pickedFood)toggleFoodFavoriteObject(pickedFood);}
function toggleFoodFavoriteObject(food){
  ensureFoodLibraryState();const key=foodKey(food),i=DATA.foodFavorites.indexOf(key);
  if(i>=0)DATA.foodFavorites.splice(i,1);else DATA.foodFavorites.unshift(key);
  saveState();updatePickedFavoriteButton();refreshFoodDiscovery();toast(i>=0?'Retiré des favoris':'Ajouté aux favoris');
}
function updatePickedFavoriteButton(){const b=document.getElementById('foodPickedFavorite');if(!b||!pickedFood)return;const fav=isFoodFavorite(pickedFood);b.textContent=fav?'★':'☆';b.classList.toggle('active',fav);b.setAttribute('aria-label',fav?'Retirer des favoris':'Ajouter aux favoris');}
function renderFoodCategoryChips(){
  const box=document.getElementById('foodBrowseCategories');if(!box)return;
  box.innerHTML=foodCategories().map(cat=>`<button type="button" class="food-category-chip ${activeFoodCategory===cat?'active':''}" onclick='showFoodCategory(${JSON.stringify(cat)})'>${foodCategoryIcon(cat)} ${escapeHtml(cat)}</button>`).join('');
}
function showFoodCategory(cat){activeFoodCategory=cat;const input=document.getElementById('foodSearch');if(input)input.value='';renderFoodCategoryChips();renderFoodStart();}
function renderFoodSection(title,foods,subtitle=''){
  if(!foods.length)return'';
  const rows=foods.map(f=>foodRowHtml(f,subtitle)).join('');
  return `<div class="food-discovery-section"><div class="food-discovery-title">${title}</div>${rows}</div>`;
}
function renderFoodStart(){
  const box=document.getElementById('foodSearchResults');if(!box)return;resetFoodUiRows();renderFoodCategoryChips();
  if(activeFoodCategory){
    const foods=allFoods().filter(f=>f.category===activeFoodCategory).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
    box.innerHTML=`<div class="food-discovery-heading"><strong>${foodCategoryIcon(activeFoodCategory)} ${escapeHtml(activeFoodCategory)}</strong><button type="button" class="small-link" onclick="activeFoodCategory='';renderFoodCategoryChips();renderFoodStart()">Fermer</button></div>`+foods.map(f=>foodRowHtml(f)).join('');return;
  }
  const favs=favoriteFoods(),recent=recentFoods(),freq=frequentFoods();
  const featured=['Poulet (blanc, cuit)','Œuf entier','Riz basmati cuit','Pâtes cuites','Banane','Pomme','Skyr nature','Saumon (cuit)','Lentilles cuites','Brocoli (cuit)'].map(foodByName).filter(Boolean);
  let html='';
  html+=renderFoodSection('★ Favoris',favs);
  html+=renderFoodSection('🕘 Récents',recent);
  html+=renderFoodSection('↻ Fréquents',freq);
  if(!html)html=renderFoodSection('Aliments courants',featured);
  box.innerHTML=html||'<div class="muted small" style="padding:10px 2px">Recherche un aliment ou parcours une catégorie.</div>';
}
function refreshFoodDiscovery(){const q=document.getElementById('foodSearch')?.value.trim()||'';if(!q){renderFoodStart();return;}renderFoodSearchResults(q,localFoodMatches(q),externalFoodResults,externalFoodResults.length?'ready':'ready');}
function openFoodSheet(){
  pickedFood=null;externalFoodResults=[];activeFoodCategory='';if(foodSearchTimer)clearTimeout(foodSearchTimer);if(foodSearchRequest)foodSearchRequest.abort();selectedMealType=mealTypeForHour(new Date().getHours());
  const input=document.getElementById('foodSearch');if(input)input.value='';document.getElementById('foodPickedBox').style.display='none';document.getElementById('customFoodForm').style.display='none';clearMealDescription(false);document.getElementById('mealDescriptionCard')?.classList.remove('open');renderMealTypeChooser();renderFoodCategoryChips();renderFoodStart();openSheet('foodSheetOverlay');
}
function renderMealTypeChooser(){const box=document.getElementById('mealTypeChooser');if(!box)return;const types=['Petit-déjeuner','Déjeuner','Dîner','En-cas'];box.innerHTML=types.map(t=>`<button type="button" class="meal-chip ${selectedMealType===t?'active':''}" onclick="selectMealType('${t}')">${t}</button>`).join('');}
function selectMealType(type){selectedMealType=type;renderMealTypeChooser();toast(`Repas classé dans « ${type} »`);}
function localFoodMatches(query){
  const nq=normalizeFoodText(query),nqCompact=nq.replace(/\s+/g,''),counts=foodFrequencyMap();
  return allFoods().filter(f=>{const n=normalizeFoodText(f.name);return n.includes(nq)||n.replace(/\s+/g,'').includes(nqCompact);}).sort((a,b)=>{
    const an=normalizeFoodText(a.name),bn=normalizeFoodText(b.name),anCompact=an.replace(/\s+/g,''),bnCompact=bn.replace(/\s+/g,'');
    const aStart=(an.startsWith(nq)||anCompact.startsWith(nqCompact))?1:0,bStart=(bn.startsWith(nq)||bnCompact.startsWith(nqCompact))?1:0;if(aStart!==bStart)return bStart-aStart;
    const af=isFoodFavorite(a)?1:0,bf=isFoodFavorite(b)?1:0;if(af!==bf)return bf-af;
    const ac=counts[an]||0,bc=counts[bn]||0;if(ac!==bc)return bc-ac;
    return a.name.localeCompare(b.name,'fr');
  }).slice(0,14);
}
function renderFoodSearchResults(query,locals,remote,state='ready'){
  const box=document.getElementById('foodSearchResults');if(!box)return;resetFoodUiRows();
  const localKeys=new Set(locals.map(foodKey));
  const remotes=(remote||[]).filter(f=>!localKeys.has(foodKey(f))).slice(0,10);
  const parts=[];
  if(locals.length){parts.push('<div class="muted small food-source-label">VitaTrack</div>');parts.push(locals.map(f=>foodRowHtml(f)).join(''));}
  if(state==='loading')parts.push('<div class="muted small" style="padding:9px 2px">Recherche de produits en ligne…</div>');
  if(remotes.length){parts.push('<div class="muted small food-source-label">OpenFoodFacts · en ligne</div>');parts.push(remotes.map((f,i)=>`<div class="sr-item food-library-row" onclick="pickRemoteFood(${externalFoodResults.indexOf(f)})"><span class="food-library-main"><strong>${escapeHtml(f.name)}</strong>${f.brand?`<small>${escapeHtml(f.brand)}</small>`:''}</span><span class="muted">${Math.round(f.kcal)} kcal</span></div>`).join(''));}
  if(state==='offline')parts.push('<div class="muted small" style="padding:9px 2px">Recherche en ligne indisponible. Les aliments locaux restent accessibles.</div>');
  if(!parts.length)parts.push(`<div class="sr-item muted">Aucun résultat pour « ${escapeHtml(query)} ».</div>`);
  box.innerHTML=parts.join('');
}
function renderFoodSearch(){
  const input=document.getElementById('foodSearch');if(!input)return;const q=input.value.trim();activeFoodCategory='';renderFoodCategoryChips();
  if(foodSearchTimer)clearTimeout(foodSearchTimer);if(foodSearchRequest)foodSearchRequest.abort();externalFoodResults=[];
  if(!q){renderFoodStart();return;}
  const locals=localFoodMatches(q);
  if(q.length<2){renderFoodSearchResults(q,locals,[]);return;}
  renderFoodSearchResults(q,locals,[],'loading');
  const seq=++foodSearchSeq;foodSearchTimer=setTimeout(()=>searchOpenFoodFacts(q,seq,locals),450);
}
async function searchOpenFoodFacts(query,seq,locals){
  foodSearchRequest=new AbortController();
  const fields='code,product_name_fr,product_name,brands,nutriments';
  const url=`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=12&fields=${encodeURIComponent(fields)}`;
  try{
    const r=await fetch(url,{signal:foodSearchRequest.signal,headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const j=await r.json();if(seq!==foodSearchSeq||document.getElementById('foodSearch')?.value.trim()!==query)return;
    const seen=new Set();externalFoodResults=(j.products||[]).map(p=>{const n=p.nutriments||{};const name=(p.product_name_fr||p.product_name||'').trim();const kcal=Number(n['energy-kcal_100g']);if(!name||!Number.isFinite(kcal)||kcal<0)return null;return{name,brand:String(p.brands||'').split(',')[0].trim(),code:p.code||'',kcal,protein:nutrientNumberOrNull(n.proteins_100g),carbs:nutrientNumberOrNull(n.carbohydrates_100g),fat:nutrientNumberOrNull(n.fat_100g),sugar:nutrientNumberOrNull(n.sugars_100g),fiber:nutrientNumberOrNull(n.fiber_100g),satFat:nutrientNumberOrNull(n['saturated-fat_100g']),salt:nutrientNumberOrNull(n.salt_100g),sodium:nutrientNumberOrNull(n.sodium_100g),potassium:nutrientNumberOrNull(n.potassium_100g),calcium:nutrientNumberOrNull(n.calcium_100g),iron:nutrientNumberOrNull(n.iron_100g),magnesium:nutrientNumberOrNull(n.magnesium_100g),vitaminC:nutrientNumberOrNull(n['vitamin-c_100g']),giLabel:'',source:'openfoodfacts'};}).filter(f=>f&&!seen.has(foodKey(f))&&seen.add(foodKey(f)));
    renderFoodSearchResults(query,locals,externalFoodResults,'ready');
  }catch(e){if(e.name==='AbortError')return;if(seq!==foodSearchSeq)return;renderFoodSearchResults(query,locals,[],'offline');}
}
function rememberExternalFood(food){
  if(!food)return null;DATA.customFoods=DATA.customFoods||[];const key=foodKey(food);const existing=DATA.customFoods.find(f=>foodKey(f)===key)||FOOD_DB.find(f=>foodKey(f)===key);if(existing)return existing;
  const saved={name:food.name,kcal:Math.round(Number(food.kcal)||0),protein:nutrientNumberOrNull(food.protein),carbs:nutrientNumberOrNull(food.carbs),fat:nutrientNumberOrNull(food.fat),sugar:nutrientNumberOrNull(food.sugar),fiber:nutrientNumberOrNull(food.fiber),satFat:nutrientNumberOrNull(food.satFat),salt:nutrientNumberOrNull(food.salt),sodium:nutrientNumberOrNull(food.sodium),potassium:nutrientNumberOrNull(food.potassium),calcium:nutrientNumberOrNull(food.calcium),iron:nutrientNumberOrNull(food.iron),magnesium:nutrientNumberOrNull(food.magnesium),vitaminC:nutrientNumberOrNull(food.vitaminC),giLabel:food.giLabel||'',source:food.source||'openfoodfacts',barcode:food.code||''};DATA.customFoods.push(saved);saveState();return saved;
}
function pickRemoteFood(index){const food=externalFoodResults[index];if(!food)return;pickedFood=rememberExternalFood(food);showPickedFood();}
function foodBaseUnit(food){return String(food?.unit||'g').toLowerCase()==='ml'?'ml':'g';}
function foodPortionCount(value){const s=String(value||'').trim().replace(',','.');if(!s)return null;if(/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(s)){const [a,b]=s.split('/').map(Number);return b?Math.max(0,a/b):null;}const n=Number(s);return Number.isFinite(n)&&n>0?n:null;}
function singularizeFoodUnit(unit){const u=String(unit||'').trim(),special={'œufs':'œuf','oeufs':'œuf','morceaux':'morceau','carrés':'carré','petits-suisses':'petit-suisse'};const low=u.toLowerCase();if(special[low])return special[low];return /s$/i.test(u)&&!/ss$/i.test(u)?u.slice(0,-1):u;}
function foodPortionMeasure(food){
  const qty=Number(food?.portionQty);if(!(qty>0))return null;
  const label=String(food?.portionLabel||'').trim();if(!label)return null;
  const left=label.split('·')[0].trim();
  const m=left.match(/^(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?)\s+(.+)$/i);
  if(!m)return null;const count=foodPortionCount(m[1]);let name=String(m[2]||'').trim();if(!(count>0)||!name)return null;if(count>1)name=singularizeFoodUnit(name);
  return{key:'portion',name,count,factor:qty/count,label,baseUnit:foodBaseUnit(food)};
}
function pluralizeFoodUnit(unit,qty){
  const u=String(unit||'').trim();if(Math.abs(Number(qty)-1)<1e-9)return u;
  const special={'œuf':'œufs','oeuf':'œufs','morceau':'morceaux','petit-suisse':'petits-suisses','pizza individuelle':'pizzas individuelles','portion cuite':'portions cuites','petite boîte':'petites boîtes','petite boîte égouttée':'petites boîtes égouttées','petite portion':'petites portions','petite poignée':'petites poignées','petite grappe':'petites grappes','grand bol':'grands bols','petit bol':'petits bols'};
  const low=u.toLowerCase();if(special[low])return special[low];if(low.includes('c. à soupe')||low.includes('c. à café'))return u;if(/[sx]$/i.test(u))return u;return u+'s';
}
function foodUnitOptions(food){const base=foodBaseUnit(food),portion=foodPortionMeasure(food),out=[];if(portion)out.push(portion);out.push({key:'base',name:base,count:100,factor:1,label:`100 ${base}`,baseUnit:base});return out;}
function foodDefaultMeasure(food){const p=foodPortionMeasure(food);return p?{amount:p.count,key:'portion'}:{amount:100,key:'base'};}
function foodUnitOption(food,key){return foodUnitOptions(food).find(x=>x.key===key)||foodUnitOptions(food).slice(-1)[0];}
function formatFoodMeasureNumber(value){const n=Number(value);return Number.isFinite(n)?n.toLocaleString('fr-FR',{maximumFractionDigits:2}):'';}
function foodDisplayMeasure(amount,option){return `${formatFoodMeasureNumber(amount)} ${pluralizeFoodUnit(option?.name||option?.baseUnit||'g',amount)}`;}
function renderFoodMeasureControls(){
  if(!pickedFood)return;const select=document.getElementById('foodUnit'),qty=document.getElementById('foodQty');if(!select||!qty)return;
  const opts=foodUnitOptions(pickedFood),def=foodDefaultMeasure(pickedFood);select.innerHTML=opts.map(o=>`<option value="${o.key}">${escapeHtml(o.name)}</option>`).join('');select.value=def.key;qty.value=def.amount;qty.step=def.key==='base'?'1':'0.5';updateFoodMeasurePreview();
}
function foodMeasureFromInputs(food=pickedFood){
  const qtyEl=document.getElementById('foodQty'),unitEl=document.getElementById('foodUnit');const amount=Number(String(qtyEl?.value||'').replace(',','.'));const option=foodUnitOption(food,unitEl?.value||'base');
  const qty=amount*Number(option?.factor||1);return{amount,option,qty:Math.round(qty*10)/10,baseUnit:foodBaseUnit(food),displayUnit:pluralizeFoodUnit(option?.name||foodBaseUnit(food),amount)};
}
function updateFoodMeasurePreview(){
  if(!pickedFood)return;const m=foodMeasureFromInputs(),preview=document.getElementById('foodMeasurePreview'),qty=document.getElementById('foodQty');if(qty)qty.step=m.option?.key==='base'?'1':'0.5';
  if(!preview)return;if(!(m.amount>0)||!Number.isFinite(m.qty)){preview.textContent='';return;}const kcal=Math.round((Number(pickedFood.kcal)||0)*m.qty/100);
  const converted=m.option?.key==='base'?'':` ≈ ${formatFoodMeasureNumber(m.qty)} ${m.baseUnit}`;preview.innerHTML=`<strong>${escapeHtml(foodDisplayMeasure(m.amount,m.option))}</strong>${converted} · ${kcal} kcal`;
}
function showPickedFood(){if(!pickedFood)return;document.getElementById('foodPickedBox').style.display='block';document.getElementById('foodPickedName').textContent=pickedFood.name;const base=foodBaseUnit(pickedFood);document.getElementById('foodPickedKcal').textContent=`${Math.round(pickedFood.kcal)} kcal / 100 ${base}`;renderPickedInfo();renderFoodMeasureControls();renderFoodPortionQuick();updatePickedFavoriteButton();}
function pickFood(name){pickedFood=foodByName(name);if(!pickedFood)return;showPickedFood();}
function renderPickedInfo(){if(!pickedFood)return;const box=document.getElementById('foodPickedInfo');box.innerHTML=`<div class="mini-stats"><span>🔥 ${pickedFood.kcal} kcal</span><span>🥩 ${nutrientDisplay(pickedFood.protein)}${nutrientNumberOrNull(pickedFood.protein)===null?'':' g'} protéines</span>${pickedFood.giLabel?`<span>🩸 IG ${pickedFood.giLabel}</span>`:''}${pickedFood.category?`<span>🏷️ ${escapeHtml(pickedFood.category)}</span>`:''}</div>`;}
function renderFoodPortionQuick(){const box=document.getElementById('foodPortionQuick');if(!box||!pickedFood)return;const base=foodBaseUnit(pickedFood),p=foodPortionMeasure(pickedFood),opts=[];if(p)opts.push([p.label,p.count,'portion']);opts.push([`100 ${base}`,100,'base']);box.innerHTML=opts.map(([label,amount,key],i)=>`<button type="button" class="food-portion-chip ${i===0&&opts.length>1?'suggested':''}" onclick="setFoodMeasure(${amount},'${key}')">${escapeHtml(label)}</button>`).join('');}
function setFoodMeasure(amount,key='base'){const e=document.getElementById('foodQty'),s=document.getElementById('foodUnit');if(s)s.value=key;if(e)e.value=amount;updateFoodMeasurePreview();}
function setFoodQty(qty){setFoodMeasure(qty,'base');}
function toggleCustomFoodForm(){const f=document.getElementById('customFoodForm');f.style.display=f.style.display==='none'?'block':'none';}
function saveCustomFood(){
  const name=document.getElementById('cf_name').value.trim(),kcal=nutrientInputValue('cf_kcal');
  if(!name||kcal===null){toast('Nom et kcal sont nécessaires');return;}
  if(!nutrientInputInRange('cf_kcal',NUTRITION_LIMITS.kcalPer100)){toast('Les calories doivent être comprises entre 0 et 1 000 kcal / 100 g');return;}
  const macroIds=['cf_protein','cf_carbs','cf_fat','cf_sugar','cf_fiber','cf_satfat','cf_salt'];
  if(macroIds.some(id=>!nutrientInputInRange(id,NUTRITION_LIMITS.macroPer100))){toast('Les nutriments doivent être compris entre 0 et 100 g / 100 g');return;}
  const food={name,kcal,protein:nutrientInputValue('cf_protein'),carbs:nutrientInputValue('cf_carbs'),fat:nutrientInputValue('cf_fat'),sugar:nutrientInputValue('cf_sugar'),fiber:nutrientInputValue('cf_fiber'),satFat:nutrientInputValue('cf_satfat'),salt:nutrientInputValue('cf_salt'),giLabel:document.getElementById('cf_gi').value||'',category:'Personnalisés'};DATA.customFoods.push(food);saveState();toast('Aliment enregistré');document.getElementById('customFoodForm').style.display='none';pickFood(name);
}
function confirmAddFood(){refreshToday();if(!pickedFood)return;const measure=foodMeasureFromInputs();if(!(measure.amount>0)||!validFoodQuantity(measure.qty)){toast('Vérifie la quantité : l’équivalent doit être compris entre 1 et 5 000 g ou ml');return;}rememberDailyCalorieTarget(TODAY);const qty=measure.qty,r=qty/100;const meta=localTimeMeta();const e={id:'f'+Date.now(),name:pickedFood.name,qty,kcal:Math.round(pickedFood.kcal*r),protein:scaledNutrient(pickedFood.protein,r),carbs:scaledNutrient(pickedFood.carbs,r),fat:scaledNutrient(pickedFood.fat,r),sugar:scaledNutrient(pickedFood.sugar,r),fiber:scaledNutrient(pickedFood.fiber,r),satFat:scaledNutrient(pickedFood.satFat,r),salt:scaledNutrient(pickedFood.salt,r,2),sodium:scaledNutrient(pickedFood.sodium,r,2),potassium:scaledNutrient(pickedFood.potassium,r),calcium:scaledNutrient(pickedFood.calcium,r),iron:scaledNutrient(pickedFood.iron,r),magnesium:scaledNutrient(pickedFood.magnesium,r),vitaminC:scaledNutrient(pickedFood.vitaminC,r),time:meta.time,timezone:meta.timezone,unit:measure.baseUnit,displayQty:Math.round(measure.amount*100)/100,displayUnit:measure.displayUnit,unitFactor:Number(measure.option?.factor)||1,mealType:selectedMealType||meta.mealType};if(!DATA.foodLog[TODAY])DATA.foodLog[TODAY]=[];DATA.foodLog[TODAY].push(e);saveState();closeSheet('foodSheetOverlay');toast(`Ajouté : ${foodDisplayMeasure(measure.amount,measure.option)}`);renderAll();}
function removeFood(id){refreshToday();DATA.foodLog[TODAY]=(DATA.foodLog[TODAY]||[]).filter(x=>x.id!==id);saveState();renderAll();}
function foodLogQuantityLabel(item){const dq=Number(item?.displayQty),du=String(item?.displayUnit||'').trim();if(Number.isFinite(dq)&&dq>0&&du)return `${formatFoodMeasureNumber(dq)} ${du}`;const q=Number(item?.qty);return Number.isFinite(q)&&q>0?`${formatFoodMeasureNumber(q)} ${item?.unit||'g'}`:'';}
function renderFood(){
  const t=currentTargets(),d=dayTotals(),
        totalKcal=Math.round(d.kcal),
        list=(DATA.foodLog[TODAY]||[]).slice().sort((a,b)=>(a.time||'').localeCompare(b.time||'')),
        rem=t.calories?Math.max(0,Math.round(t.calories-totalKcal)):null,
        mt=macroTargets(t.calories||2100);

  setText('foodKcalTotal',totalKcal);
  setText('foodGoalLabel',t.calories?`${t.calories} kcal`:'Objectif à calculer');
  const consumedPct=t.calories?Math.max(0,Math.round((totalKcal/t.calories)*100)):0;
  setText('foodRemainingPct',consumedPct+'%');
  setText('foodRemaining',rem===null?'0 kcal':rem+' kcal');

  const sportHistory=typeof window.getSportHistory==='function'?window.getSportHistory():[];
  const sportBurnedToday=Math.round(sportHistory.reduce((sum,a)=>{
    const localDate=a?.recordedAt?new Date(a.recordedAt).toLocaleDateString('en-CA'):String(a?.completedDate||a?.date||'');
    const kcal=Number(a?.estimatedKcal||((typeof window.sportKcalForActivity==='function')?window.sportKcalForActivity(a):0))||0;
    return sum+(localDate===TODAY?kcal:0);
  },0));
  const stepBurnedToday=Math.round(Number(estimateStepCalories(stepsForDate())?.kcal||0));
  const totalBurnedToday=Math.max(0,sportBurnedToday+stepBurnedToday);
  setText('foodBurned',totalBurnedToday);
  setText('foodProteinTotal',dayNutrientText(d,'protein',0,'g'));
  setText('foodProteinGoal',t.protein?`${t.protein} g`:'—');
  setText('foodWeight',DATA.profile.weightCurrent?formatWeight(DATA.profile.weightCurrent)+' kg':'—');
  setText('nutritionCurrentWeight',DATA.profile.weightCurrent?formatWeight(DATA.profile.weightCurrent)+' kg':'—');
  setText('nutritionWeightGoal',DATA.objective.targetWeight?formatWeight(DATA.objective.targetWeight)+' kg':'—');
  setText('nutritionGoalLabel',goalLabel(DATA.objective.type));
  setText('nutritionCalorieTarget',t.calories?t.calories+' kcal/j':'—');

  const ring=document.getElementById('calorieRing');
  if(ring){
    const ratio=t.calories?Math.max(0,Math.min(1,totalKcal/t.calories)):0;
    ring.style.strokeDashoffset=(314.16*(1-ratio)).toFixed(2);
    if(typeof window.updateCalorieExcessRing==='function')window.updateCalorieExcessRing(totalKcal,t.calories);
  }

  setText('macroCarbs',`${dayNutrientText(d,'carbs',0,'g').replace(' g','')} / ${mt.carbs} g`);
  setText('macroProtein',`${dayNutrientText(d,'protein',0,'g').replace(' g','')} / ${t.protein||'—'} g`);
  setText('macroFat',`${dayNutrientText(d,'fat',0,'g').replace(' g','')} / ${mt.fat} g`);
  setText('macroFiber',`${dayNutrientText(d,'fiber',0,'g').replace(' g','')} / ${mt.fiber} g`);
  setBar('macroCarbsBar',nutrientKnown(d,'carbs')?macroPct(d.carbs,mt.carbs):0);
  setBar('macroProteinBar',nutrientKnown(d,'protein')?macroPct(d.protein,t.protein):0);
  setBar('macroFatBar',nutrientKnown(d,'fat')?macroPct(d.fat,mt.fat):0);
  setBar('macroFiberBar',nutrientKnown(d,'fiber')?macroPct(d.fiber,mt.fiber):0);

  setText('proteinIntakeValue',proteinIntakeText(d));

  const water=waterTotal(),waterGoal=(DATA.nutrition.waterTarget||2)*1000,glasses=water/250;
  setText('waterGlasses',`${glasses.toLocaleString('fr-FR',{maximumFractionDigits:1})} ${glasses===1?'verre':'verres'}`);
  setText('waterTotal',`${(water/1000).toFixed(2).replace('.',',')} L`);
  setText('waterGoal',`${(waterGoal/1000).toFixed(2).replace('.',',')} L`);
  const waterPct=Math.min(100,water/waterGoal*100);
  const waterRing=document.getElementById('waterRing');
  if(waterRing)waterRing.style.strokeDashoffset=(131.95*(1-waterPct/100)).toFixed(2);
  setText('waterRingLabel',`${Math.round(waterPct)}%`);

  const groups=[['Petit-déjeuner','☕'],['Déjeuner','🍽️'],['Dîner','🥗'],['En-cas','🍎']];
  const card=document.getElementById('foodListCard');
  if(card){
    card.innerHTML=groups.map(([type,icon])=>{
      // Older entries saved as "Repas tardif" are intentionally shown in Dîner.
      const items=list.filter(f=>((f.mealType==='Repas tardif'?'Dîner':(f.mealType||'Repas'))===type));
      const kcal=items.reduce((sum,f)=>sum+Number(f.kcal||0),0);
      const goal=Math.round((t.calories||2100)*({'Petit-déjeuner':.25,'Déjeuner':.33,'Dîner':.33,'En-cas':.09}[type]));
      const pct=goal?Math.min(100,Math.round(kcal/goal*100)):0;
      const offset=(125.66*(1-pct/100)).toFixed(2);
      const foodRows=items.length?items.map(f=>`
        <div class="meal-food-row">
          <div class="meal-food-time">${f.time||'—'}</div>
          <div class="meal-food-main">
            <strong>${escapeHtml(f.name||'Aliment')}</strong>
            <small>${foodLogQuantityLabel(f)?`${escapeHtml(foodLogQuantityLabel(f))} · `:''}${Math.round(Number(f.kcal||0))} kcal</small>
          </div>
          <button type="button" class="drink-remove meal-food-delete" aria-label="Supprimer ${escapeHtml(f.name||'cet aliment')}" title="Supprimer" onclick="event.preventDefault();event.stopPropagation();removeFood('${f.id}')">×</button>
        </div>`).join(''):`<div class="meal-empty">Aucun aliment enregistré</div>`;
      return `<details class="meal-group">
        <summary class="meal-group-head">
          <span class="meal-ring-wrap" aria-hidden="true"><svg viewBox="0 0 48 48"><circle class="meal-ring-track" cx="24" cy="24" r="20"></circle><circle class="meal-ring-progress" style="stroke-dashoffset:${offset}" cx="24" cy="24" r="20"></circle></svg><span class="meal-ring-label">${pct}%</span></span>
          <div class="meal-main"><strong>${type}</strong><small>${kcal} / ${goal} kcal</small></div>
          <span class="meal-chevron" aria-hidden="true">›</span>
        </summary>
        <div class="meal-food-list">${foodRows}</div>
      </details>`;
    }).join('');
  }
  if(typeof window.renderQuickAddSummary==='function')window.renderQuickAddSummary();
}

function closeNutritionAnalytics(){const p=document.getElementById('nutritionAnalyticsPanel');if(p)p.classList.remove('open');document.body.style.overflow='';}
function nutritionAnalyticsMetric(label,value,sub=''){return `<div class="nutri-metric"><strong>${value}</strong><small>${label}${sub?` · ${sub}`:''}</small></div>`;}
function openNutritionAnalytics(){
  const d=dayTotals(),t=currentTargets(),mt=macroTargets(t.calories||2100),rem=t.calories?Math.max(0,Math.round(t.calories-d.kcal)):null;
  const proteinGoal=t.protein||null,satGoal=20,sugarGoal=50;
  const coverage=(key)=>nutrientKnown(d,key)?(nutrientPartial(d,key)?'total partiel':'total du jour'):'donnée non renseignée';
  const metric=(key,label,target=null,limitLabel='')=>{if(!nutrientKnown(d,key))return nutritionAnalyticsMetric(label,'—','donnée non renseignée');const val=dayNutrientText(d,key,key==='salt'?1:0,key==='salt'?'g':'g');const sub=target?`${Math.min(999,macroPct(d[key],target))}%${limitLabel}`:coverage(key);return nutritionAnalyticsMetric(label,val,sub);};
  const saltKnown=nutrientKnown(d,'salt')||nutrientKnown(d,'sodium');const saltValue=nutrientKnown(d,'salt')?d.salt:(nutrientKnown(d,'sodium')?d.sodium*2.5:null);const saltPartial=nutrientPartial(d,'salt')||(!nutrientKnown(d,'salt')&&nutrientPartial(d,'sodium'));
  const micros=[['Potassium','potassium','mg'],['Calcium','calcium','mg'],['Fer','iron','mg'],['Magnésium','magnesium','mg'],['Vitamine C','vitaminC','mg']];
  let p=document.getElementById('nutritionAnalyticsPanel');if(!p){p=document.createElement('div');p.id='nutritionAnalyticsPanel';p.className='nutri-panel';document.body.appendChild(p)}
  p.innerHTML=`<div class="nutri-panel-head"><h2>📊 Analyse nutrition</h2><button class="sport-close" onclick="closeNutritionAnalytics()">×</button></div>
  <div class="nutri-summary-top"><div class="nutri-hero-metric"><strong>${Math.round(d.kcal)} kcal</strong><span>consommées aujourd’hui</span></div><div class="nutri-hero-metric"><strong>${rem===null?'—':rem+' kcal'}</strong><span>${t.calories?'restantes sur ton objectif':'objectif à définir'}</span></div></div>
  <div class="card nutri-section"><div class="eyebrow">Macros</div><div class="nutri-grid">${nutrientKnown(d,'carbs')?nutritionAnalyticsMetric('Glucides',dayNutrientText(d,'carbs',0,'g'),`${macroPct(d.carbs,mt.carbs)}%${nutrientPartial(d,'carbs')?' · partiel':''}`):nutritionAnalyticsMetric('Glucides','—','donnée non renseignée')}${nutrientKnown(d,'protein')?nutritionAnalyticsMetric('Protéines',dayNutrientText(d,'protein',0,'g'),proteinGoal?`${macroPct(d.protein,proteinGoal)}%${nutrientPartial(d,'protein')?' · partiel':''}`:coverage('protein')):nutritionAnalyticsMetric('Protéines','—','donnée non renseignée')}${nutrientKnown(d,'fat')?nutritionAnalyticsMetric('Lipides',dayNutrientText(d,'fat',0,'g'),`${macroPct(d.fat,mt.fat)}%${nutrientPartial(d,'fat')?' · partiel':''}`):nutritionAnalyticsMetric('Lipides','—','donnée non renseignée')}${nutrientKnown(d,'fiber')?nutritionAnalyticsMetric('Fibres',dayNutrientText(d,'fiber',0,'g'),`${macroPct(d.fiber,mt.fiber)}%${nutrientPartial(d,'fiber')?' · partiel':''}`):nutritionAnalyticsMetric('Fibres','—','donnée non renseignée')}</div></div>
  <div class="card nutri-section"><div class="eyebrow">À surveiller</div><div class="nutri-grid">${nutrientKnown(d,'sugar')?nutritionAnalyticsMetric('Sucres',dayNutrientText(d,'sugar',0,'g'),`${Math.min(999,macroPct(d.sugar,sugarGoal))}% de 50 g${nutrientPartial(d,'sugar')?' · partiel':''}`):nutritionAnalyticsMetric('Sucres','—','donnée non renseignée')}${nutrientKnown(d,'satFat')?nutritionAnalyticsMetric('Graisses saturées',dayNutrientText(d,'satFat',0,'g'),`${Math.min(999,macroPct(d.satFat,satGoal))}% de 20 g${nutrientPartial(d,'satFat')?' · partiel':''}`):nutritionAnalyticsMetric('Graisses saturées','—','donnée non renseignée')}${saltKnown?nutritionAnalyticsMetric('Sel',`${saltPartial?'≈ ':''}${Number(saltValue).toFixed(1).replace('.',',')} g`,saltPartial?'apport partiel':'apport estimé'):nutritionAnalyticsMetric('Sel','—','donnée non renseignée')}${nutritionAnalyticsMetric('Hydratation',`${(waterTotal()/1000).toFixed(2).replace('.',',')} L`,`${Math.min(100,Math.round(waterTotal()/Math.max(1,(DATA.nutrition.waterTarget||2)*1000)*100))}%`)}</div><div class="nutri-pill-row"><span class="nutri-pill">Repas enregistrés : ${(DATA.foodLog[TODAY]||[]).length}</span><span class="nutri-pill">Boissons : ${(Array.isArray(DATA.drinkLog)?DATA.drinkLog:[]).filter(x=>x.date===TODAY).length}</span></div></div>
  <div class="card nutri-section"><div class="eyebrow">Vitamines & minéraux</div><div class="nutri-grid">${micros.map(([label,key,unit])=>nutrientKnown(d,key)?nutritionAnalyticsMetric(label,dayNutrientText(d,key,1,unit),coverage(key)):nutritionAnalyticsMetric(label,'—','donnée non renseignée')).join('')}</div><div class="nutri-note">« — » signifie que la donnée n’est pas fournie par l’aliment. Une valeur à 0 correspond désormais à un zéro réellement renseigné. Le signe ≈ indique qu’une partie des aliments du jour ne fournit pas cette donnée.</div></div>`;
  p.classList.add('open');document.body.style.overflow='hidden';
}
function setBar(id,pct){const e=document.getElementById(id);if(e)e.style.width=Math.max(0,Math.min(100,pct))+'%';}
function setText(id,value){const e=document.getElementById(id);if(e)e.textContent=value;}
let mealDescriptionDraft=[];
const MEAL_DESCRIPTION_ALIASES={
  'Poulet (blanc, cuit)':['poulet','blanc de poulet'],
  'Maïs doux':['maïs','mais','maïs doux','mais doux'],
  'Feta':['feta','féta'],
  'Olives':['olive','olives','olive noire','olives noires','olive verte','olives vertes'],
  'Comté':['comté','comte'],
  'Petit-suisse nature':['petit suisse','petit-suisse','petit suisse nature'],
  'Tomate':['tomate','tomates'],
  'Concombre':['concombre','concombres'],
  'Avocat':['avocat','avocats'],
  'Œuf entier':['œuf','œufs','oeuf','oeufs'],
  'Jambon blanc':['jambon','jambon blanc'],
  'Pain complet':['pain complet'],
  'Pain blanc':['pain','pain blanc'],
  'Confiture':['confiture'],
  'Beurre':['beurre'],
  'Riz basmati cuit':['riz basmati','riz'],
  'Pâtes cuites':['pâtes','pates'],
  'Pomme de terre (cuite)':['pomme de terre','pommes de terre','pommes de terres','patate','patates'],
  'Patate douce (cuite)':['patate douce','patates douces'],
  'Emmental':['emmental'],
  'Camembert':['camembert'],
  'Mozzarella':['mozzarella','mozza'],
  'Skyr nature':['skyr'],
  'Yaourt nature':['yaourt','yaourt nature'],
  'Fromage blanc 0%':['fromage blanc'],
  'Saumon (cuit)':['saumon'],
  'Thon (nature, conserve)':['thon'],
  'Lentilles cuites':['lentilles','lentille'],
  'Pois chiches cuits':['pois chiches','pois chiche'],
  'Brocoli (cuit)':['brocoli','brocolis'],
  'Carotte cuite':['carotte','carottes'],
  'Salade verte':['salade verte','laitue'],
  'Pomme':['pomme','pommes'],
  'Banane':['banane','bananes'],
  'Orange':['orange','oranges'],
  'Figue fraîche':['figue','figues'],
  'Huile d’olive':['huile d olive','huile olive','huile d’olive'],
  'Amandes':['amandes','amande'],
  'Noix':['noix']
};
const MEAL_DESCRIPTION_GENERIC_GROUPS=[
  {label:'Fromage',aliases:['fromage','fromages'],foods:['Emmental','Comté','Camembert','Mozzarella','Feta']},
  {label:'Poisson',aliases:['poisson','poissons'],foods:['Saumon (cuit)','Cabillaud (cuit)','Thon (nature, conserve)','Sardines en conserve','Maquereau cuit']},
  {label:'Viande',aliases:['viande','viandes'],foods:['Poulet (blanc, cuit)','Dinde (escalope, cuite)','Bœuf haché 5%','Steak de bœuf grillé','Filet mignon de porc cuit']}
];
function normalizeMealSentence(value){return normalizeFoodBase(value).replace(/[^a-z0-9.,%]+/g,' ').replace(/\s+/g,' ').trim();}
function simplifiedMealBankAlias(value){return normalizeMealSentence(value).replace(/\b(cuit|cuite|cuits|cuites|grille|grillee|grilles|grillees)\b/g,' ').replace(/\s+/g,' ').trim();}
function mealAliasCandidates(){
  const out=[];
  Object.entries(MEAL_DESCRIPTION_ALIASES).forEach(([name,aliases])=>{const food=foodByName(name);if(!food)return;[name,...aliases].forEach(alias=>out.push({food,alias:normalizeMealSentence(alias)}));});
  // Bank names are accepted both in full and without parenthetical cooking/details.
  allFoods().forEach(food=>{
    const raw=String(food.name||''),full=normalizeMealSentence(raw),base=normalizeMealSentence(raw.replace(/\([^)]*\)/g,' ')),simple=simplifiedMealBankAlias(raw.replace(/\([^)]*\)/g,' '));
    out.push({food,alias:full});if(base&&base!==full)out.push({food,alias:base});if(simple&&simple!==full&&simple!==base)out.push({food,alias:simple});
  });
  MEAL_DESCRIPTION_GENERIC_GROUPS.forEach(group=>{
    const choices=group.foods.map(foodByName).filter(Boolean);if(!choices.length)return;
    group.aliases.forEach(alias=>out.push({food:choices[0],alias:normalizeMealSentence(alias),choices,genericLabel:group.label}));
  });
  const seen=new Set();return out.filter(x=>x.alias&&!seen.has((x.genericLabel||foodKey(x.food))+'|'+x.alias)&&seen.add((x.genericLabel||foodKey(x.food))+'|'+x.alias)).sort((a,b)=>b.alias.length-a.alias.length);
}
function mealAliasPositions(text,alias){
  if(!alias)return[];const out=[];let from=0,pos;
  while((pos=text.indexOf(alias,from))>=0){
    const end=pos+alias.length,before=pos===0?' ':text[pos-1],after=end>=text.length?' ':text[end];
    if((pos===0||/\s/.test(before))&&(end===text.length||/[\s,.%]/.test(after)))out.push(pos);
    from=pos+Math.max(1,alias.length);
  }
  return out;
}
function mealWordsNumber(v){const n={'un':1,'une':1,'deux':2,'trois':3,'quatre':4,'cinq':5};return n[v]||Number(String(v).replace(',','.'))||1;}
function mealUnitQty(food,unit){
  const u=normalizeMealSentence(unit),label=normalizeMealSentence(food.portionLabel||'');
  if(Number(food.portionQty)>0&&u&&label.includes(u.replace(/s$/,'')))return Number(food.portionQty);
  if(u.startsWith('tranche')){if(normalizeFoodText(food.name).includes('poulet'))return 40;if(food.category==='Laitiers')return 30;return Number(food.portionQty)||35;}
  if(u.startsWith('morceau'))return food.category==='Laitiers'?30:(Number(food.portionQty)||40);
  if(u.startsWith('pot'))return Number(food.portionQty)||125;
  if(u.startsWith('petit suisse'))return Number(food.portionQty)||60;
  if(u.startsWith('salade')||u.startsWith('bol')||u.startsWith('portion'))return Number(food.portionQty)||150;
  if(u.startsWith('poignee'))return Number(food.portionQty)||30;
  if(u.includes('cuillere')&&u.includes('soupe'))return Number(food.portionQty)||15;
  if(u.includes('cuillere'))return Number(food.portionQty)||5;
  if(u.startsWith('verre'))return Number(food.portionQty)||200;
  return Number(food.portionQty)||100;
}
function mealDescriptionMeasure(food,before){
  const tail=before.slice(-55).trim(),base=foodBaseUnit(food),portion=foodPortionMeasure(food);
  let m=tail.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl)\s*(?:de|du|des|d)?\s*$/i);
  if(m){let raw=Number(m[1].replace(',','.')),q=raw;const unit=m[2].toLowerCase();if(unit==='kg')q*=1000;if(unit==='cl')q*=10;return{qty:Math.max(1,Math.round(q*10)/10),displayQty:Math.max(1,Math.round(q*10)/10),unitKey:'base',displayUnit:base};}
  m=tail.match(/(un|une|deux|trois|quatre|cinq|\d+(?:[.,]\d+)?)\s+(tranches?|morceaux?|pots?|portions?|salades?|bols?|poignees?|petits?\s+suisses?|cuilleres?\s+a\s+soupe|cuilleres?|verres?)\s*(?:de|du|des|d)?\s*$/i);
  if(m){const count=mealWordsNumber(m[1]),q=Math.max(1,Math.round(count*mealUnitQty(food,m[2])*10)/10);if(portion)return{qty:q,displayQty:count,unitKey:'portion',displayUnit:pluralizeFoodUnit(portion.name,count)};return{qty:q,displayQty:q,unitKey:'base',displayUnit:base};}
  m=tail.match(/(un|une|deux|trois|quatre|cinq|\d+(?:[.,]\d+)?)\s*$/i);
  if(m&&portion){const count=mealWordsNumber(m[1]);return{qty:Math.max(1,Math.round(count*portion.factor*10)/10),displayQty:count,unitKey:'portion',displayUnit:pluralizeFoodUnit(portion.name,count)};}
  if(portion)return{qty:Number(food.portionQty),displayQty:portion.count,unitKey:'portion',displayUnit:pluralizeFoodUnit(portion.name,portion.count)};
  return{qty:100,displayQty:100,unitKey:'base',displayUnit:base};
}
function estimateMealDescriptionQty(food,before){return mealDescriptionMeasure(food,before).qty;}
function analyzeMealDescription(){
  const input=document.getElementById('mealDescriptionText'),text=(input?.value||'').trim();
  if(!text){toast('Décris simplement ce que tu as mangé');return;}
  const norm=normalizeMealSentence(text),used=[],foodsSeen=new Set(),genericSeen=new Set(),matches=[];
  for(const c of mealAliasCandidates()){
    for(const pos of mealAliasPositions(norm,c.alias)){
      const end=pos+c.alias.length;if(used.some(r=>pos<r[1]&&end>r[0]))continue;
      if(c.genericLabel){if(genericSeen.has(c.genericLabel))continue;}else if(foodsSeen.has(foodKey(c.food)))continue;
      used.push([pos,end]);if(c.genericLabel)genericSeen.add(c.genericLabel);else foodsSeen.add(foodKey(c.food));
      const before=norm.slice(0,pos),measure=mealDescriptionMeasure(c.food,before);
      matches.push({food:c.food,qty:measure.qty,displayQty:measure.displayQty,unitKey:measure.unitKey,displayUnit:measure.displayUnit,estimated:true,pos,choices:c.choices||null,genericLabel:c.genericLabel||''});
      break;
    }
  }
  matches.sort((a,b)=>a.pos-b.pos);
  mealDescriptionDraft=matches.map((x,i)=>({id:'md'+Date.now()+i,food:x.food,qty:x.qty,displayQty:x.displayQty,unitKey:x.unitKey||'base',displayUnit:x.displayUnit||foodBaseUnit(x.food),estimated:true,choices:x.choices||null,genericLabel:x.genericLabel||''}));
  if(!mealDescriptionDraft.length){renderMealDescriptionReview('none');toast('Je ne reconnais pas encore les aliments de cette phrase');return;}
  renderMealDescriptionReview();
}
function mealDescriptionCalories(item){return Math.round((Number(item.food?.kcal)||0)*(Number(item.qty)||0)/100);}
function renderMealDescriptionReview(state='ready'){
  const box=document.getElementById('mealDescriptionReview');if(!box)return;
  if(state==='none'){box.classList.add('open');box.innerHTML='<div class="meal-description-note">Aucun aliment reconnu. Essaie des mots simples comme « maïs », « poulet », « comté », « petit-suisse », ou utilise la recherche juste en dessous.</div>';return;}
  if(!mealDescriptionDraft.length){box.classList.remove('open');box.innerHTML='';return;}
  const total=mealDescriptionDraft.reduce((s,x)=>s+mealDescriptionCalories(x),0);
  box.classList.add('open');
  box.innerHTML=`<div class="meal-description-note">${mealDescriptionDraft.length} aliment${mealDescriptionDraft.length>1?'s':''} reconnu${mealDescriptionDraft.length>1?'s':''}. Les quantités sont des estimations : vérifie-les avant d’ajouter.</div>`+
    mealDescriptionDraft.map((item,i)=>{const opts=foodUnitOptions(item.food),shown=Number(item.displayQty)||Number(item.qty)||0;return`<div class="meal-desc-row"><div class="meal-desc-main"><strong>${escapeHtml(item.genericLabel?item.genericLabel+' · '+item.food.name:item.food.name)}</strong>${item.choices?.length?`<select class="meal-desc-choice" onchange="updateMealDescriptionFood(${i},this.value)">${item.choices.map(f=>`<option value="${escapeHtml(f.name)}" ${f.name===item.food.name?'selected':''}>${escapeHtml(f.name)}</option>`).join('')}</select>`:''}<small>${item.food.portionLabel?`Repère : ${escapeHtml(item.food.portionLabel)}`:'Quantité estimée'} · <span id="mealDescKcal${i}">${mealDescriptionCalories(item)} kcal</span></small></div><div class="meal-desc-qty"><input type="number" min="0.1" max="5000" step="0.5" value="${shown}" oninput="updateMealDescriptionMeasure(${i},this.value,null)"><select onchange="updateMealDescriptionMeasure(${i},null,this.value)">${opts.map(o=>`<option value="${o.key}" ${o.key===(item.unitKey||'base')?'selected':''}>${escapeHtml(o.name)}</option>`).join('')}</select></div><button type="button" class="meal-desc-remove" aria-label="Retirer ${escapeHtml(item.food.name)}" onclick="removeMealDescriptionItem(${i})">×</button></div>`;}).join('')+
    `<div class="meal-description-summary"><span>Total estimé</span><strong id="mealDescriptionTotal">${total} kcal</strong></div><button type="button" class="btn btn-primary btn-block" style="margin-top:8px" onclick="confirmMealDescription()">Ajouter ces aliments au repas</button>`;
}
function updateMealDescriptionFood(index,name){const item=mealDescriptionDraft[index],food=foodByName(name);if(!item||!food)return;item.food=food;if(item.estimated){const d=foodDefaultMeasure(food),o=foodUnitOption(food,d.key);item.displayQty=d.amount;item.unitKey=d.key;item.qty=Math.round(d.amount*o.factor*10)/10;item.displayUnit=pluralizeFoodUnit(o.name,d.amount);}renderMealDescriptionReview();}
function updateMealDescriptionMeasure(index,value,key){const item=mealDescriptionDraft[index];if(!item)return;const amount=value===null?Number(item.displayQty):Number(String(value).replace(',','.')),unitKey=key===null?(item.unitKey||'base'):key,o=foodUnitOption(item.food,unitKey);item.displayQty=amount;item.unitKey=unitKey;item.displayUnit=pluralizeFoodUnit(o.name,amount);item.qty=Math.round(amount*Number(o.factor||1)*10)/10;const valid=amount>0&&validFoodQuantity(item.qty),kcal=document.getElementById('mealDescKcal'+index);if(kcal)kcal.textContent=valid?mealDescriptionCalories(item)+' kcal':'quantité invalide';const total=document.getElementById('mealDescriptionTotal');if(total)total.textContent=mealDescriptionDraft.every(x=>Number(x.displayQty)>0&&validFoodQuantity(x.qty))?mealDescriptionDraft.reduce((s,x)=>s+mealDescriptionCalories(x),0)+' kcal':'—';if(key!==null)renderMealDescriptionReview();}
function updateMealDescriptionQty(index,value){updateMealDescriptionMeasure(index,value,'base');}
function removeMealDescriptionItem(index){mealDescriptionDraft.splice(index,1);renderMealDescriptionReview();}
function clearMealDescription(clearText=true){mealDescriptionDraft=[];const box=document.getElementById('mealDescriptionReview');if(box){box.classList.remove('open');box.innerHTML='';}if(clearText){const input=document.getElementById('mealDescriptionText');if(input)input.value='';}}
function confirmMealDescription(){
  if(!mealDescriptionDraft.length){toast('Aucun aliment à ajouter');return;}
  if(mealDescriptionDraft.some(item=>!(Number(item.displayQty)>0)||!validFoodQuantity(item.qty))){toast('Vérifie chaque quantité : l’équivalent doit rester entre 1 et 5 000 g ou ml');return;}
  refreshToday();
  const meta=localTimeMeta();rememberDailyCalorieTarget(TODAY);if(!DATA.foodLog[TODAY])DATA.foodLog[TODAY]=[];
  mealDescriptionDraft.forEach((item,i)=>{const f=item.food,qty=Number(item.qty)||0,r=qty/100,o=foodUnitOption(f,item.unitKey||'base'),dq=Number(item.displayQty)||qty;DATA.foodLog[TODAY].push({id:'f'+Date.now()+i,name:f.name,qty:Math.round(qty*10)/10,kcal:Math.round((f.kcal||0)*r),protein:scaledNutrient(f.protein,r),carbs:scaledNutrient(f.carbs,r),fat:scaledNutrient(f.fat,r),sugar:scaledNutrient(f.sugar,r),fiber:scaledNutrient(f.fiber,r),satFat:scaledNutrient(f.satFat,r),salt:scaledNutrient(f.salt,r,2),sodium:scaledNutrient(f.sodium,r,2),potassium:scaledNutrient(f.potassium,r),calcium:scaledNutrient(f.calcium,r),iron:scaledNutrient(f.iron,r),magnesium:scaledNutrient(f.magnesium,r),vitaminC:scaledNutrient(f.vitaminC,r),time:meta.time,timezone:meta.timezone,unit:foodBaseUnit(f),displayQty:Math.round(dq*100)/100,displayUnit:pluralizeFoodUnit(o.name,dq),unitFactor:Number(o.factor)||1,mealType:selectedMealType||meta.mealType,source:'description'});});
  const count=mealDescriptionDraft.length;saveState();clearMealDescription();closeSheet('foodSheetOverlay');toast(`${count} aliment${count>1?'s':''} ajouté${count>1?'s':''}`);renderAll();
}


/* ---------- Add / scanners ---------- */
function stopCamera(id){const v=document.getElementById(id);if(v?.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null;}if(v)v.style.display='none';}
function stopNutritionScanners(){stopCamera('barcodeVideo');stopMealDictation();const status=document.getElementById('barcodeStatus');if(status)status.textContent='';}
async function scanBarcode(){
  const video=document.getElementById('barcodeVideo'); if(!video)return;
  if(!('BarcodeDetector' in window)){toast('Scanner code-barres indisponible sur ce navigateur.');return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
    video.srcObject=stream;video.style.display='block';await video.play();toast('Cadre le code-barres dans la caméra');
    const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']});
    let running=true;
    const tick=async()=>{if(!running||!video.srcObject)return;try{const codes=await detector.detect(video);if(codes.length){running=false;const code=codes[0].rawValue;stopCamera('barcodeVideo');await lookupBarcode(code);return;}}catch(e){}requestAnimationFrame(tick);};
    tick();
  }catch(e){stopCamera('barcodeVideo');toast('Impossible d’ouvrir la caméra. Vérifie l’autorisation.');}
}
async function lookupBarcode(code){
  code=(code||'').trim();if(!code)return;
  const status=document.getElementById('barcodeStatus');if(status)status.textContent='Recherche du produit…';
  try{
    const r=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    const j=await r.json();const p=j.product;
    if(!p||j.status!==1){toast('Produit non trouvé');if(status)status.textContent='Produit non trouvé.';return;}
    const n=p.nutriments||{};
    const f={name:p.product_name_fr||p.product_name||'Produit scanné',code,kcal:nutrientNumberOrNull(n['energy-kcal_100g']),protein:nutrientNumberOrNull(n.proteins_100g),carbs:nutrientNumberOrNull(n.carbohydrates_100g),fat:nutrientNumberOrNull(n.fat_100g),sugar:nutrientNumberOrNull(n.sugars_100g),fiber:nutrientNumberOrNull(n.fiber_100g),satFat:nutrientNumberOrNull(n['saturated-fat_100g']),salt:nutrientNumberOrNull(n.salt_100g),sodium:nutrientNumberOrNull(n.sodium_100g),potassium:nutrientNumberOrNull(n.potassium_100g),calcium:nutrientNumberOrNull(n.calcium_100g),iron:nutrientNumberOrNull(n.iron_100g),magnesium:nutrientNumberOrNull(n.magnesium_100g),vitaminC:nutrientNumberOrNull(n['vitamin-c_100g']),giLabel:'',source:'openfoodfacts'};
    if(f.kcal===null){toast('Calories non renseignées pour ce produit');if(status)status.textContent='Données nutritionnelles insuffisantes.';return;}pickedFood=rememberExternalFood(f);showPickedFood();toast('Produit trouvé — indique la quantité');if(status)status.textContent='';
  }catch(e){toast('Recherche du code-barres impossible');if(status)status.textContent='Vérifie ta connexion internet.';}
}
let mealSpeechRecognition=null,mealSpeechListening=false;
function openMealDescription(){
  const overlay=document.getElementById('foodSheetOverlay');
  if(!overlay?.classList.contains('open'))openFoodSheet();
  const card=document.getElementById('mealDescriptionCard'),input=document.getElementById('mealDescriptionText');if(!card||!input)return;
  card.classList.add('open');
  card.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>input.focus(),220);
}
function focusMealDescription(){openMealDescription();}
function setMealDictationUi(active){
  mealSpeechListening=!!active;
  const btn=document.getElementById('mealDictateBtn'),status=document.getElementById('mealDictationStatus');
  if(btn){btn.classList.toggle('listening',mealSpeechListening);btn.setAttribute('aria-pressed',mealSpeechListening?'true':'false');btn.textContent=mealSpeechListening?'Arrêter':'🎙️ Parler';}
  if(status)status.classList.toggle('active',mealSpeechListening);
}
function stopMealDictation(){
  const recognition=mealSpeechRecognition;mealSpeechRecognition=null;
  if(recognition){try{recognition.stop();}catch(e){}}
  setMealDictationUi(false);
}
async function ensureMealMicrophoneAccess(){
  if(!window.isSecureContext){
    toast('Le micro nécessite une page sécurisée (HTTPS). Ouvre VitaTrack depuis son adresse HTTPS.');
    return false;
  }
  try{
    if(window.top!==window.self){
      toast('Le micro peut être bloqué dans cet aperçu. Ouvre VitaTrack directement dans un onglet puis réessaie.');
      return false;
    }
  }catch(e){}
  if(!navigator.mediaDevices?.getUserMedia){
    // Certains navigateurs exposent SpeechRecognition sans getUserMedia.
    return true;
  }
  try{
    if(navigator.permissions?.query){
      try{
        const permission=await navigator.permissions.query({name:'microphone'});
        if(permission.state==='denied'){
          toast('Le micro est bloqué pour VitaTrack. Dans les réglages du site, mets Micro sur Autoriser puis recharge la page.');
          return false;
        }
      }catch(e){}
    }
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    stream.getTracks().forEach(track=>track.stop());
    return true;
  }catch(e){
    const name=e?.name||'';
    if(name==='NotAllowedError'||name==='PermissionDeniedError'){
      toast('Accès micro refusé. Autorise le microphone dans les réglages de ce site, puis appuie à nouveau sur Parler.');
    }else if(name==='NotFoundError'||name==='DevicesNotFoundError'){
      toast('Aucun microphone n’est disponible sur cet appareil.');
    }else if(name==='NotReadableError'||name==='TrackStartError'){
      toast('Le microphone est déjà utilisé ou indisponible. Ferme l’autre application qui l’utilise puis réessaie.');
    }else{
      toast('Impossible d’accéder au microphone sur cette page. Tu peux toujours écrire ton repas.');
    }
    return false;
  }
}
async function toggleMealDictation(){
  if(mealSpeechListening){stopMealDictation();return;}
  openMealDescription();
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){toast('La dictée vocale n’est pas disponible sur ce navigateur. Tu peux écrire ton repas.');return;}
  const input=document.getElementById('mealDescriptionText');if(!input)return;
  if(!(await ensureMealMicrophoneAccess())){input.focus();return;}
  const recognition=new Recognition();mealSpeechRecognition=recognition;
  recognition.lang='fr-FR';recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=1;
  const base=input.value.trim();let finalText='';
  recognition.onresult=event=>{
    let interim='';
    for(let i=event.resultIndex;i<event.results.length;i++){
      const text=(event.results[i][0]?.transcript||'').trim();
      if(event.results[i].isFinal)finalText+=(finalText?' ':'')+text;else interim+=(interim?' ':'')+text;
    }
    input.value=[base,finalText,interim].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  };
  recognition.onerror=event=>{
    const messages={'not-allowed':'Le micro est bloqué pour cette page. Autorise-le dans les réglages du site puis réessaie.','service-not-allowed':'La reconnaissance vocale est bloquée par ce navigateur.','no-speech':'Je n’ai rien entendu. Réessaie en parlant près du téléphone.','audio-capture':'Aucun microphone disponible.'};
    if(event.error!=='aborted')toast(messages[event.error]||'La dictée vocale a été interrompue.');
  };
  recognition.onend=()=>{if(mealSpeechRecognition===recognition)mealSpeechRecognition=null;setMealDictationUi(false);input.focus();};
  try{recognition.start();setMealDictationUi(true);}catch(e){mealSpeechRecognition=null;setMealDictationUi(false);toast('Impossible de démarrer la dictée vocale.');}
}


/* ---------- Guide ---------- */
function normalizeGuideString(v){return normalizeFoodText(v);}
function guideIncludes(value,parts){const str=normalizeGuideString(value);return parts.some(part=>str.includes(normalizeGuideString(part)));}
function guideQualityMeta(food){
  const name=normalizeGuideString(food?.name||''),category=normalizeGuideString(food?.category||'');
  const kcal=Number(food?.kcal)||0,protein=Number(food?.protein)||0,fiber=Number(food?.fiber)||0,sugar=Number(food?.sugar)||0,fat=Number(food?.fat)||0;
  const has=items=>items.some(item=>name.includes(normalizeGuideString(item)));
  const starNames=['œuf','oeuf','skyr','fromage blanc 0','yaourt grec nature','saumon','sardines','maquereau','cabillaud','thon','crevettes','poulet (blanc','dinde','lentilles','pois chiches','haricots rouges','haricots blancs','brocoli','épinards','epinards','courgette','champignons','salade verte','concombre','poivron','fraises','framboises','myrtilles','kiwi','pomme de terre','patate douce','avoine','quinoa','riz complet'];
  const limitNames=['nutella','chips','petit beurre','confiture','miel','chocolat au lait','frites','pizza','quiche','croque','lasagnes','pain blanc','baguette','beurre'];
  const doseNames=['avocat','huile','amandes','noix','noisettes','beurre de cacahuète','beurre de cacahuete','olives','mozzarella','emmental','camembert','comté','comte','feta','chocolat noir'];
  if(has(starNames))return{key:'star',short:'Stars',badge:'⭐ Aliment star',hint:'Excellent choix au quotidien',cardNote:'Très intéressant pour la satiété, la qualité nutritionnelle ou l’objectif.'};
  if(category==='snacks'||category==='plats'&&kcal>=260||has(limitNames)||sugar>=40||kcal>=480&&protein<15)return{key:'limit',short:'À limiter',badge:'🔴 À limiter',hint:'À garder occasionnel',cardNote:'Plus dense en calories, en sucres ajoutés ou en graisses. À garder occasionnellement.'};
  if(category==='matieres grasses'||category==='matières grasses'||has(doseNames)||fat>=15&&kcal>=140||category==='laitiers'&&fat>=15)return{key:'dose',short:'À doser',badge:'🟡 À doser',hint:'Bon aliment, portion à surveiller',cardNote:'Peut être intéressant, mais la portion compte vite car l’aliment est plus dense.'};
  if(category==='legumes'||category==='légumes'||category==='fruits'||category==='legumineuses'||category==='légumineuses'||protein>=18&&kcal<=240||fiber>=5||has(['complet','seigle','boulgour','avoine','quinoa']))return{key:'good',short:'À privilégier',badge:'🟢 À privilégier',hint:'Très bon repère pour le quotidien',cardNote:'Bon choix pour une alimentation équilibrée et compatible avec une perte de poids.'};
  return{key:'good',short:'À privilégier',badge:'🟢 À privilégier',hint:'Peut s’intégrer facilement',cardNote:'Peut parfaitement trouver sa place dans une alimentation équilibrée si la portion reste adaptée.'};
}
function guideQualityLabel(key){return({all:'Toutes les catégories',star:'Aliments stars',good:'À privilégier',dose:'À doser',limit:'À limiter'})[key]||'Toutes les catégories';}
function syncGuideToolbar(){
  const searchShell=document.getElementById('guideSearchShell'),filtersCard=document.getElementById('guideFiltersCard');
  const searchBtn=document.getElementById('guideSearchToggle'),filterBtn=document.getElementById('guideFiltersToggle');
  searchShell?.classList.toggle('open',guideSearchOpen||!!currentGuideQuery);
  filtersCard?.classList.toggle('open',guideFiltersOpen);
  searchBtn?.classList.toggle('active',guideSearchOpen||!!currentGuideQuery);
  filterBtn?.classList.toggle('active',guideFiltersOpen);
  if(searchBtn)searchBtn.setAttribute('aria-pressed',guideSearchOpen||!!currentGuideQuery?'true':'false');
  if(filterBtn)filterBtn.setAttribute('aria-pressed',guideFiltersOpen?'true':'false');
}
function openGuideCatalog(){const p=document.getElementById('guideCatalogPanel');if(!p)return;guideSearchOpen=!!currentGuideQuery;guideFiltersOpen=true;p.classList.add('open');p.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';syncGuideToolbar();renderGuide();setTimeout(()=>{if(guideSearchOpen)document.getElementById('guideSearch')?.focus();},80);}
function closeGuideCatalog(){const p=document.getElementById('guideCatalogPanel');if(!p)return;p.classList.remove('open');p.setAttribute('aria-hidden','true');document.body.style.overflow='';}
function toggleGuideSearch(){guideSearchOpen=!guideSearchOpen;syncGuideToolbar();if(guideSearchOpen)setTimeout(()=>document.getElementById('guideSearch')?.focus(),60);}
function toggleGuideFilters(){guideFiltersOpen=!guideFiltersOpen;syncGuideToolbar();}
function openGuideFood(name){const f=allFoods().find(x=>x.name===name);if(!f)return;const meta=guideQualityMeta(f);const macro=v=>nutrientNumberOrNull(v)===null?'—':nutrientDisplay(v)+' g';document.getElementById('guideTitle').textContent=f.name;document.getElementById('guideDetail').innerHTML=`<div class="guide-detail-top"><span class="guide-quality-badge ${meta.key}">${meta.badge}</span><span class="guide-detail-sub">${escapeHtml(f.category||'Aliment')}</span></div><div class="guide-hero"><div class="num">${Math.round(Number(f.kcal)||0)}</div><span>kcal / 100 g</span></div><div class="mini-stats"><span>🥩 ${macro(f.protein)} protéines</span><span>🍬 ${macro(f.sugar)} sucres</span><span>🌾 ${macro(f.fiber)} fibres</span></div><div class="guide-detail-grid"><div class="metric"><strong>${macro(f.carbs)}</strong><span>Glucides</span></div><div class="metric"><strong>${macro(f.fat)}</strong><span>Lipides</span></div><div class="metric"><strong>${f.giLabel?escapeHtml(f.giLabel):'—'}</strong><span>Indice glycémique</span></div><div class="metric"><strong>${escapeHtml(f.portionLabel||'100 g')}</strong><span>Portion repère</span></div></div><div class="guide-gi"><strong>🎯 Repère rapide</strong><div>${meta.hint}</div></div><div class="coach-note"><strong>${meta.badge}</strong><p>${foodAdvice(f)}</p></div>`;openSheet('guideSheetOverlay');}
function foodAdvice(f){const meta=guideQualityMeta(f);if(meta.key==='star')return'Excellent repère pour ton objectif : cet aliment apporte soit beaucoup de protéines, soit beaucoup de fibres, soit une très bonne satiété pour une portion raisonnable.';if(meta.key==='limit')return'À consommer surtout de manière occasionnelle : cet aliment est souvent plus riche en calories, en sucres ajoutés, en graisses ou moins rassasiant.';if(meta.key==='dose')return'Bon aliment, mais la portion compte beaucoup. Il peut être très intéressant, simplement pas en grande quantité si ton objectif est de perdre du poids.';if(Number(f.kcal)>=500&&Number(f.protein)<12)return'À intégrer avec attention : cet aliment peut vite faire monter les calories si la portion grossit.';if(Number(f.protein)>=20&&Number(f.kcal)<=220)return'Très intéressant pour ton objectif : beaucoup de protéines pour une quantité de calories modérée.';if(Number(f.kcal)<=100)return'Facile à intégrer dans une journée de perte de gras, surtout si la portion reste adaptée à ton objectif.';return'Peut parfaitement trouver sa place dans une alimentation équilibrée. La quantité et l’ensemble de ta journée comptent plus que l’idée de bon ou mauvais aliment.';}
function guideGiRank(label){return({faible:1,moyen:2,'élevé':3,eleve:3})[String(label||'').toLowerCase()]||9;}
function renderGuideCategories(){
  const box=document.getElementById('guideCategories');if(!box)return;
  const cats=[...new Set(allFoods().map(f=>f.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const values=['all',...cats];
  box.innerHTML=values.map(cat=>`<button type="button" class="guide-chip ${currentGuideCategory===cat?'active':''}" onclick='setGuideCategory(${JSON.stringify(cat)})'>${cat==='all'?'Tous':escapeHtml(cat)}</button>`).join('');
}
function renderGuideQualityFilters(){
  const box=document.getElementById('guideQualityFilters');if(!box)return;
  const defs=[['all','✨ Tous'],['star','⭐ Stars'],['good','🟢 À privilégier'],['dose','🟡 À doser'],['limit','🔴 À limiter']];
  box.innerHTML=defs.map(([value,label])=>`<button type="button" class="guide-chip ${currentGuideQuality===value?'active':''}" onclick="setGuideQuality('${value}')">${label}</button>`).join('');
}
function renderGuide(){
  const listEl=document.getElementById('guideList');if(!listEl)return;
  syncGuideToolbar();
  renderGuideCategories();
  renderGuideQualityFilters();
  const q=normalizeFoodText(currentGuideQuery);
  let res=allFoods().filter(f=>{
    const matchesQ=!q||normalizeFoodText(f.name).includes(q)||normalizeFoodText(f.name).replace(/\s+/g,'').includes(q.replace(/\s+/g,''));
    const matchesCat=currentGuideCategory==='all'||f.category===currentGuideCategory;
    const quality=guideQualityMeta(f);
    const matchesQuality=currentGuideQuality==='all'||quality.key===currentGuideQuality;
    return matchesQ&&matchesCat&&matchesQuality;
  });
  const compareValue=(f,key)=>{
    if(key==='gi'){const rank=guideGiRank(f.giLabel);return rank===9?null:rank;}
    return nutrientNumberOrNull(f?.[key]);
  };
  if(currentGuideCompare){
    const dir=currentGuideCompareDir==='desc'?-1:1;
    res=res.slice().sort((a,b)=>{
      const av=compareValue(a,currentGuideCompare),bv=compareValue(b,currentGuideCompare);
      if(av===null&&bv===null)return a.name.localeCompare(b.name,'fr');
      if(av===null)return 1;if(bv===null)return -1;
      return (av-bv)*dir||a.name.localeCompare(b.name,'fr');
    });
  }else res=res.slice().sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  const count=document.getElementById('guideCount');if(count)count.textContent=`${res.length} aliment${res.length>1?'s':''}`;
  const hint=document.getElementById('guideActiveHint');if(hint)hint.textContent=`${guideQualityLabel(currentGuideQuality)}${currentGuideCategory!=='all'?' · '+currentGuideCategory:''}`;
  document.querySelectorAll('[data-guide-compare]').forEach(btn=>{
    const active=btn.dataset.guideCompare===currentGuideCompare;
    btn.classList.toggle('active',active);
    const base=({kcal:'Calories',gi:'IG',protein:'Protéines',carbs:'Glucides',fat:'Lipides',fiber:'Fibres'})[btn.dataset.guideCompare]||btn.textContent;
    btn.innerHTML=active?`${base}<span class="guide-compare-arrow">${currentGuideCompareDir==='asc'?'↑':'↓'}</span>`:base;
    btn.setAttribute('aria-pressed',active?'true':'false');
    btn.setAttribute('aria-label',active?`${base}, ordre ${currentGuideCompareDir==='asc'?'croissant':'décroissant'}`:`Classer par ${base}`);
  });
  listEl.innerHTML=res.length?res.map(f=>{
    const gi=f.giLabel?String(f.giLabel).toLowerCase():'';
    const macro=v=>nutrientDisplay(v);
    const quality=guideQualityMeta(f);
    return `<div class="guide-food-card"><div class="guide-food-top"><span class="guide-food-category">${escapeHtml(f.category||'Aliment')}</span><span class="guide-quality-badge ${quality.key}">${quality.short}</span></div><strong>${escapeHtml(f.name)}</strong><span class="guide-food-kcal"><b>${Math.round(Number(f.kcal)||0)}</b> kcal <small>/ 100 g</small></span><div class="guide-food-macros"><span><b>${macro(f.protein)}</b><small>Prot.</small></span><span><b>${macro(f.carbs)}</b><small>Gluc.</small></span><span><b>${macro(f.fat)}</b><small>Lip.</small></span><span><b>${macro(f.fiber)}</b><small>Fibres</small></span></div><span class="guide-food-bottom"><span class="guide-gi-badge ${gi==='élevé'?'high':gi==='moyen'?'medium':gi==='faible'?'low':''}">${gi?'IG '+escapeHtml(gi):'IG —'}</span><span>${escapeHtml(f.portionLabel||'100 g')}</span></span></div>`;
  }).join(''):'<div class="guide-empty">Aucun aliment ne correspond à cette sélection.</div>';
}
function filterGuide(v){currentGuideQuery=v;guideSearchOpen=!!String(v||'').trim();renderGuide();}
function setGuideCategory(v){currentGuideCategory=v;renderGuide();}
function setGuideQuality(v){currentGuideQuality=v;renderGuide();}
function setGuideCompare(v){if(currentGuideCompare===v)currentGuideCompareDir=currentGuideCompareDir==='asc'?'desc':'asc';else{currentGuideCompare=v;currentGuideCompareDir='asc';}renderGuide();}
function clearGuideCompareFromRow(event){if(event.target!==event.currentTarget||!currentGuideCompare)return;currentGuideCompare='';currentGuideCompareDir='asc';renderGuide();}

/* ---------- Weight / weekly report ---------- */
function openWeightEntry(){const f=document.getElementById('weightEntryForm');if(!f)return;const h=document.getElementById('nutritionWeightHistory');if(h)h.style.display='none';const hidden=getComputedStyle(f).display==='none';f.style.display=hidden?'block':'none';if(f.style.display==='block')setTimeout(()=>document.getElementById('newWeight')?.focus(),50);}
function logWeight(){refreshToday();const w=+document.getElementById('newWeight').value;if(!Number.isFinite(w)||w<35||w>300){toast('Indique un poids entre 35 et 300 kg');return;}const waist=+document.getElementById('newWaist').value||null;const visceral=+document.getElementById('newVisceralFat').value||null;DATA.weights.push({date:TODAY,weight:w,waist,visceralFat:visceral});DATA.profile.weightCurrent=w;DATA.profile.waist=waist||DATA.profile.waist;DATA.profile.visceralFat=visceral||DATA.profile.visceralFat;if(!DATA.profile.startingWeight)DATA.profile.startingWeight=w;saveState();document.getElementById('newWeight').value='';document.getElementById('newWaist').value='';document.getElementById('newVisceralFat').value='';const form=document.getElementById('weightEntryForm');if(form)form.style.display='none';toast('Pesée enregistrée');renderAll();}
let bodyCompMetric='weight';
let bodyCompRange=30;
const BODY_COMP_METRICS={
  weight:{key:'weight',label:'Poids',unit:'kg',digits:1},
  bodyFat:{key:'bodyFat',label:'Masse grasse',unit:'%',digits:1},
  muscleMass:{key:'muscleMass',label:'Masse musculaire',unit:'kg',digits:1},
  visceralFat:{key:'visceralFat',label:'Graisse viscérale',unit:'',digits:1}
};
function bodyCompNumber(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function bodyCompFormat(v,metric=bodyCompMetric){const cfg=BODY_COMP_METRICS[metric]||BODY_COMP_METRICS.weight,n=bodyCompNumber(v);if(n===null)return '—';const text=n.toFixed(cfg.digits).replace('.',',');return `${text}${cfg.unit?' '+cfg.unit:''}`;}
function weightSortValue(x){const t=Number(x?.timestamp);if(Number.isFinite(t)&&t>0)return t;const d=Date.parse(String(x?.date||''));return Number.isFinite(d)?d:0;}
function latestWeightRecord(){return DATA.weights.slice().sort((a,b)=>weightSortValue(b)-weightSortValue(a))[0]||null;}
function bodyCompSeries(metric=bodyCompMetric,days=bodyCompRange){const cfg=BODY_COMP_METRICS[metric]||BODY_COMP_METRICS.weight;const all=DATA.weights.filter(x=>bodyCompNumber(x[cfg.key])!==null).slice().sort((a,b)=>weightSortValue(a)-weightSortValue(b));if(!all.length)return[];const latest=weightSortValue(all[all.length-1])||Date.now(),cut=latest-days*86400000;return all.filter(x=>weightSortValue(x)>=cut);}
function bodyCompDelta(metric,days=30){const pts=bodyCompSeries(metric,days);if(pts.length<2)return null;const cfg=BODY_COMP_METRICS[metric],first=bodyCompNumber(pts[0][cfg.key]),last=bodyCompNumber(pts[pts.length-1][cfg.key]);return first===null||last===null?null:last-first;}
function bodyCompDeltaText(metric,days=30){const d=bodyCompDelta(metric,days),cfg=BODY_COMP_METRICS[metric];if(d===null)return 'Pas assez de données';const sign=d>0?'+':'';const suffix=metric==='bodyFat'?' pt':cfg.unit?` ${cfg.unit}`:'';return `${sign}${d.toFixed(1).replace('.',',')}${suffix} / ${days} j`;}
function setBodyCompMetric(metric){if(!BODY_COMP_METRICS[metric])return;bodyCompMetric=metric;renderBodyComposition();}
function setBodyCompRange(days){bodyCompRange=[7,30,90,365].includes(Number(days))?Number(days):30;renderBodyComposition();}
function renderWeightList(){const count=DATA.weights.length;setText('nutritionWeightHistoryCount',count?`${count} pesée${count>1?'s':''}`:'Aucune pesée');const targets=document.querySelectorAll('#weightListCard,#homeWeightListCard');targets.forEach(c=>{if(!c)return;if(!count){c.innerHTML=emptyState('⚖️','Aucune pesée enregistrée.');return;}const sorted=DATA.weights.map((x,i)=>({...x,idx:i})).sort((a,b)=>weightSortValue(b)-weightSortValue(a));c.innerHTML=sorted.map(x=>`<div class="item-row weight-row-clickable" role="button" tabindex="0" onclick="openWeightDetail(${x.idx})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openWeightDetail(${x.idx})}"><div class="item-ico">⚖️</div><div class="item-main"><div class="item-title">${formatWeight(x.weight)} kg${x.source==='withings'?'<span class="weight-source">Withings</span>':''}</div><div class="item-sub">${formatWeightRecordDate(x)}${x.waist?` · tour ${x.waist} cm`:''}</div></div><span class="weight-history-chevron" aria-hidden="true">›</span><button class="item-del" onclick="event.stopPropagation();removeWeight(${x.idx})" aria-label="Supprimer cette pesée">×</button></div>`).join('');});renderBodyComposition();}
function formatWeightRecordDate(x){if(Number(x?.timestamp)>0){try{return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(Number(x.timestamp)));}catch(e){}}return formatDate(x.date);}
function openWeightDetail(i){const x=DATA.weights[i];if(!x)return;setText('weightDetailTitle',formatWeightRecordDate(x));const el=document.getElementById('weightDetailContent');if(!el)return;const cells=[];const add=(label,value)=>{if(value===null||value===undefined||value==='')return;cells.push(`<div class="weight-detail-cell"><span>${label}</span><strong>${value}</strong></div>`);};add('Poids',bodyCompFormat(x.weight,'weight'));add('Taux de graisse',bodyCompFormat(x.bodyFat,'bodyFat'));add('Masse grasse (kg)',bodyCompNumber(x.fatMass)!==null?`${bodyCompNumber(x.fatMass).toFixed(1).replace('.',',')} kg`:null);add('Masse musculaire',bodyCompFormat(x.muscleMass,'muscleMass'));add('Graisse viscérale',bodyCompFormat(x.visceralFat,'visceralFat'));add('Masse maigre',bodyCompNumber(x.fatFreeMass)!==null?`${bodyCompNumber(x.fatFreeMass).toFixed(1).replace('.',',')} kg`:null);add('Hydratation',bodyCompNumber(x.hydration)!==null?`${bodyCompNumber(x.hydration).toFixed(1).replace('.',',')} kg`:null);add('Masse osseuse',bodyCompNumber(x.boneMass)!==null?`${bodyCompNumber(x.boneMass).toFixed(1).replace('.',',')} kg`:null);add('Tour de taille',x.waist?`${x.waist} cm`:null);el.innerHTML=`<div class="weight-detail-grid">${cells.join('')||'<div class="muted">Aucun détail disponible.</div>'}</div><div class="weight-detail-source">Source : ${x.source==='withings'?'Withings':'saisie manuelle'}${x.withingsId?' · import automatique':''}</div>`;openSheet('weightDetailOverlay');}
function removeWeight(i){DATA.weights.splice(i,1);const sorted=DATA.weights.slice().sort((a,b)=>weightSortValue(a)-weightSortValue(b));const latest=sorted.length?sorted[sorted.length-1]:null;DATA.profile.weightCurrent=latest?(Number(latest.weight)||null):null;saveState();renderAll();}
function formatDate(d){const [y,m,day]=String(d||'').split('-');return day&&m&&y?`${day}/${m}/${y}`:'—';}
function renderBodyComposition(){const panel=document.getElementById('bodyCompPanel');if(!panel)return;const latest=latestWeightRecord();setText('bodyCompLastDate',latest?`${formatWeightRecordDate(latest)}${latest.source==='withings'?' · Withings':''}`:'Ajoute une pesée pour commencer');setText('bodyCompWeight',latest?bodyCompFormat(latest.weight,'weight'):'—');setText('bodyCompFat',latest?bodyCompFormat(latest.bodyFat,'bodyFat'):'—');setText('bodyCompMuscle',latest?bodyCompFormat(latest.muscleMass,'muscleMass'):'—');setText('bodyCompVisceral',latest?bodyCompFormat(latest.visceralFat,'visceralFat'):'—');setText('bodyCompWeightDelta',bodyCompDeltaText('weight',30));setText('bodyCompFatDelta',bodyCompDeltaText('bodyFat',30));setText('bodyCompMuscleDelta',bodyCompDeltaText('muscleMass',30));setText('bodyCompVisceralDelta',bodyCompDelta('visceralFat',30)===null?'indice':bodyCompDeltaText('visceralFat',30));document.querySelectorAll('[data-bodycomp-metric]').forEach(b=>b.classList.toggle('active',b.dataset.bodycompMetric===bodyCompMetric));document.querySelectorAll('[data-bodycomp-card]').forEach(b=>b.classList.toggle('active',b.dataset.bodycompCard===bodyCompMetric));document.querySelectorAll('[data-bodycomp-range]').forEach(b=>b.classList.toggle('active',Number(b.dataset.bodycompRange)===bodyCompRange));renderBodyCompChart();}
function renderBodyCompChart(){const svg=document.getElementById('bodyCompChart'),empty=document.getElementById('bodyCompChartEmpty');if(!svg)return;const cfg=BODY_COMP_METRICS[bodyCompMetric],pts=bodyCompSeries(bodyCompMetric,bodyCompRange);const latest=pts.length?pts[pts.length-1]:null;setText('bodyCompChartMetricLabel',cfg.label);setText('bodyCompChartValue',latest?bodyCompFormat(latest[cfg.key],bodyCompMetric):'—');setText('bodyCompChartTrend',bodyCompDeltaText(bodyCompMetric,bodyCompRange));const d30=bodyCompDelta(bodyCompMetric,30);const insight=document.getElementById('bodyCompInsight');if(insight){const trend=d30===null?'Pas encore assez de mesures pour calculer une tendance sur 30 jours.':Math.abs(d30)<0.05?'La tendance sur 30 jours est globalement stable.':`Sur 30 jours, ${cfg.label.toLowerCase()} ${d30<0?'baisse':'augmente'} de ${Math.abs(d30).toFixed(1).replace('.',',')}${bodyCompMetric==='bodyFat'?' point':cfg.unit?' '+cfg.unit:''}.`;insight.innerHTML=`<strong>Tendance :</strong> ${trend} <span>Les mesures de composition corporelle sont surtout utiles suivies dans le temps.</span>`;}if(pts.length<2){svg.innerHTML='';if(empty){empty.style.display='flex';empty.textContent=pts.length===1?'Encore une mesure et la tendance apparaîtra.':'Aucune donnée pour cette mesure sur la période.';}return;}if(empty)empty.style.display='none';const W=340,H=154,padL=18,padR=10,padT=15,padB=23;const vals=pts.map(p=>bodyCompNumber(p[cfg.key])).filter(v=>v!==null);let min=Math.min(...vals),max=Math.max(...vals);let span=max-min;if(span<0.0001)span=Math.max(1,Math.abs(max)*0.02);const margin=Math.max(span*.18,bodyCompMetric==='weight'?.25:bodyCompMetric==='bodyFat'?.3:.15);min-=margin;max+=margin;const firstT=weightSortValue(pts[0]),lastT=weightSortValue(pts[pts.length-1]),tSpan=Math.max(1,lastT-firstT);const X=p=>padL+(weightSortValue(p)-firstT)/tSpan*(W-padL-padR),Y=v=>padT+(max-v)/(max-min)*(H-padT-padB);const path=pts.map((p,i)=>`${i?'L':'M'}${X(p).toFixed(1)},${Y(bodyCompNumber(p[cfg.key])).toFixed(1)}`).join(' ');const area=`${path} L${X(pts[pts.length-1]).toFixed(1)},${H-padB} L${X(pts[0]).toFixed(1)},${H-padB} Z`;const fmtDate=x=>{try{return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short'}).format(new Date(weightSortValue(x)));}catch(e){return'';}};const grid=[0,.5,1].map(r=>{const yy=padT+r*(H-padT-padB);return `<line x1="${padL}" y1="${yy}" x2="${W-padR}" y2="${yy}" stroke="var(--border)" stroke-width="1"/>`;}).join('');svg.innerHTML=`${grid}<path d="${area}" fill="var(--primary)" opacity=".08"/><path d="${path}" fill="none" stroke="var(--primary)" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>${pts.map(p=>`<circle cx="${X(p).toFixed(1)}" cy="${Y(bodyCompNumber(p[cfg.key])).toFixed(1)}" r="3.3" fill="var(--surface)" stroke="var(--primary)" stroke-width="2" vector-effect="non-scaling-stroke"><title>${formatWeightRecordDate(p)} · ${bodyCompFormat(p[cfg.key],bodyCompMetric)}</title></circle>`).join('')}<text x="${padL}" y="${H-6}" fill="var(--ink-soft)" font-size="9">${fmtDate(pts[0])}</text><text x="${W-padR}" y="${H-6}" fill="var(--ink-soft)" font-size="9" text-anchor="end">${fmtDate(pts[pts.length-1])}</text>`;}
function renderWeightChart(){renderBodyComposition();const svg=document.getElementById('homeWeightChart');if(!svg)return;const pts=DATA.weights.slice().sort((a,b)=>weightSortValue(a)-weightSortValue(b)).slice(-12);if(pts.length<2){svg.innerHTML='<text x="10" y="70" fill="var(--ink-soft)" font-size="13">Ajoute au moins 2 pesées pour voir la tendance</text>';return;}const W=Math.max(300,svg.parentElement.clientWidth),H=150,pad=22;svg.setAttribute('width',W);svg.setAttribute('viewBox',`0 0 ${W} ${H}`);const vals=pts.map(x=>x.weight),min=Math.min(...vals)-.5,max=Math.max(...vals)+.5,x=i=>pad+i/(pts.length-1)*(W-pad*2),y=v=>H-pad-(v-min)/(max-min)*(H-pad*2),path=pts.map((p,i)=>(i?'L':'M')+x(i)+','+y(p.weight)).join(' ');svg.innerHTML=`<path d="${path}" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round"/>${pts.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.weight)}" r="4" fill="var(--primary)"/>`).join('')}`;}
function renderWeeklyReport(targetId='weeklyReportHome'){
  coachUpdateObservationState();
  const el=document.getElementById(targetId);if(!el)return;
  const target=currentTargets();
  if(!target.calories){el.innerHTML='<div class="card"><h2>Ton coach nutrition</h2><p class="muted">Complète ton profil pour commencer.</p><button class="btn btn-primary btn-block" style="margin-top:12px" onclick="go(\'food\')">Compléter mon profil</button></div>';return;}
  const st=coachEnsureState(),status=coachObservationStatus(),phase=coachObservationPhase(),b=st.baseline||{},w=st.lastWeek||{};
  if(phase!=='active'){
    const dinner=Number(b.mealShares?.['Dîner']||0),lunch=Number(b.mealShares?.['Déjeuner']||0);
    const rhythm=(b.daysWithNutrition||0)>=3?`Déjeuner ≈ ${Math.round(lunch*100)} % · Dîner ≈ ${Math.round(dinner*100)} %`:'Répartition en cours d’apprentissage';
    el.innerHTML=`<div class="card"><div class="eyebrow">Coach nutrition · observation</div><h2>${escapeHtml(status.title)}</h2><p>${escapeHtml(status.text)}</p><div class="report-grid"><div><strong>${w.avgCalories?Math.round(w.avgCalories):'—'}</strong><span>kcal moy./j · 7 j</span></div><div><strong>${w.avgProtein?Math.round(w.avgProtein):'—'} g</strong><span>protéines moy./j</span></div><div><strong>${b.daysWithNutrition||0}</strong><span>jours observés · 14 j</span></div><div><strong>${b.avgDrinkKcal?Math.round(b.avgDrinkKcal):'—'}</strong><span>kcal boissons moy./j</span></div></div><div class="coach-note"><strong>🧭 Ton rythme en construction</strong><p>${escapeHtml(rhythm)}. Collations moyennes : ${Number.isFinite(b.avgSnackCount)?Number(b.avgSnackCount).toFixed(1).replace('.',','):'—'} / jour observé.</p></div><div class="coach-note"><strong>🔒 Pour l’instant</strong><p>Aucune cible calorique n’est modifiée. Cette phase sert à construire une référence personnelle fiable.</p></div></div>`;
    return;
  }
  const r=st.lastGeneratedReport?.endDate===TODAY?st.lastGeneratedReport:null;
  if(!r){
    el.innerHTML=`<div class="card"><div class="eyebrow">Coach nutrition · bilan hebdomadaire</div><h2>Ton bilan est prêt à être analysé</h2><p class="muted">L’analyse complète se lance uniquement quand tu la demandes. Elle n’alourdit donc pas le démarrage de VitaTrack.</p><div class="report-grid"><div><strong>${w.avgCalories?Math.round(w.avgCalories):'—'}</strong><span>kcal moy./j · 7 j</span></div><div><strong>${w.avgProtein?Math.round(w.avgProtein):'—'} g</strong><span>protéines moy./j</span></div><div><strong>${w.daysWithNutrition||0}</strong><span>jours enregistrés</span></div><div><strong>${w.drinkKcal?Math.round(w.drinkKcal):0}</strong><span>kcal boissons · semaine</span></div></div><button class="btn btn-primary btn-block" style="margin-top:14px" onclick="const rr=coachGenerateWeeklyReport();if(rr.status==='insufficient')toast('Pas assez de jours enregistrés pour un bilan fiable');renderWeeklyReport('weeklyReportHome')">✨ Générer mon bilan</button></div>`;
    return;
  }
  if(r.status!=='ready'){el.innerHTML=`<div class="card"><h2>Bilan indisponible</h2><p class="muted">Les données de cette semaine ne sont pas encore suffisantes pour une analyse fiable.</p></div>`;return;}
  const weightText=Number.isFinite(r.cap.weightWeeklyRate)?`${r.cap.weightWeeklyRate>0?'+':''}${r.cap.weightWeeklyRate.toFixed(2).replace('.',',')} kg/sem`:'Tendance insuffisante';
  const positives=r.positives?.length?r.positives.map(x=>`<li>${escapeHtml(x)}</li>`).join(''):'<li>Rien de particulier à signaler positivement cette semaine — je préfère ne rien inventer.</li>';
  const observations=r.observations?.length?r.observations.map(x=>`<li>${escapeHtml(x)}</li>`).join(''):'<li>Rien de particulier à signaler cette semaine. Ton équilibre paraît raisonnable.</li>';
  const q=r.question;
  const questionHtml=q?`<div class="coach-note"><strong>Une question pour mieux comprendre</strong><p>${escapeHtml(q.text)}</p>${q.answered?`<span class="chip">Réponse : ${escapeHtml(q.answered)}</span>`:`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${q.choices.map(c=>`<button class="btn btn-ghost btn-sm" onclick="coachAnswerContext('${q.id}','${c}')">${c}</button>`).join('')}</div>`}</div>`:'';
  el.innerHTML=`<div class="card"><div class="eyebrow">Coach nutrition · bilan hebdomadaire</div><h2>Ta semaine en 5 points</h2>
    <div class="coach-note"><strong>1 · Ton cap</strong><p>${Math.round(r.cap.avgCalories||0)} / ${Math.round(r.cap.avgTarget||target.calories)} kcal en moyenne · ${r.cap.loggedDays}/7 jours enregistrés<br>${escapeHtml(weightText)}</p></div>
    <div class="coach-note"><strong>2 · Ce qui va bien</strong><ul style="margin:7px 0 0;padding-left:18px">${positives}</ul></div>
    <div class="coach-note"><strong>3 · Ce que j’ai remarqué</strong><ul style="margin:7px 0 0;padding-left:18px">${observations}</ul></div>
    ${questionHtml}
    <div class="coach-note"><strong>4 · Ta priorité</strong><p>${escapeHtml(r.priority)}</p></div>
    <div class="coach-note"><strong>5 · Calories</strong><p><b>${escapeHtml(r.calorie.text)}</b><br>${escapeHtml(r.calorie.reason)}</p>${r.calorie?.proposal?.eligible&&!r.calorie.applied&&!r.calorie.dismissed?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn btn-primary btn-sm" onclick="coachApplyCalorieProposal()">Appliquer ${Math.round(r.calorie.proposal.to)} kcal</button><button class="btn btn-ghost btn-sm" onclick="coachDismissCalorieProposal()">Garder ma cible</button></div>`:''}${r.calorie?.applied?`<div style="margin-top:8px"><span class="chip">✓ Cible appliquée</span></div>`:''}</div>
    <button class="btn btn-ghost btn-block" style="margin-top:12px" onclick="coachClearGeneratedReport()">↻ Recalculer le bilan</button></div>`;
}
function weeklyFoodSuggestion(){const d=dayTotals(),pt=proteinTarget();if(pt&&nutrientKnown(d,'protein')&&!nutrientPartial(d,'protein')&&d.protein<pt*0.7)return'Ajoute une source de protéines simple à un repas que tu manges déjà : skyr, fromage blanc, œufs, poulet, poisson ou légumineuses.';if(d.kcal>calorieTarget())return'Privilégie les aliments rassasiants et peu denses en calories : légumes, fruits entiers, pommes de terre, soupes, protéines maigres.';return'Garde les aliments que tu apprécies. Pour varier, compare leurs fiches dans le Guide nutritionnel et choisis une alternative qui te convient.';}

function renderNutritionCoach(){const r=weeklyReport();setText('nutritionCoachTitle',r.title);setText('nutritionCoachText',r.text);}

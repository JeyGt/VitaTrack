/* ===================== Référentiels ===================== */

// Aliments courants : kcal / protéines / glucides / lipides pour 100g (ou 100ml)
const FOOD_DB = [
  {name:"Poulet (blanc, cuit)", kcal:165, protein:31, carbs:0, fat:3.6},
  {name:"Œuf entier", kcal:155, protein:13, carbs:1.1, fat:11},
  {name:"Riz blanc cuit", kcal:130, protein:2.7, carbs:28, fat:0.3},
  {name:"Riz complet cuit", kcal:123, protein:2.6, carbs:25.8, fat:1},
  {name:"Pâtes cuites", kcal:158, protein:5.8, carbs:31, fat:0.9},
  {name:"Pain complet", kcal:247, protein:9, carbs:41, fat:3.4},
  {name:"Pain blanc", kcal:265, protein:9, carbs:49, fat:3.2},
  {name:"Avoine (flocons)", kcal:389, protein:16.9, carbs:66, fat:6.9},
  {name:"Banane", kcal:89, protein:1.1, carbs:23, fat:0.3},
  {name:"Pomme", kcal:52, protein:0.3, carbs:14, fat:0.2},
  {name:"Yaourt nature", kcal:61, protein:3.5, carbs:4.7, fat:3.3},
  {name:"Fromage blanc 0%", kcal:46, protein:7.5, carbs:4, fat:0.2},
  {name:"Lait demi-écrémé", kcal:46, protein:3.3, carbs:4.8, fat:1.6},
  {name:"Amandes", kcal:579, protein:21, carbs:22, fat:50},
  {name:"Beurre de cacahuète", kcal:588, protein:25, carbs:20, fat:50},
  {name:"Saumon (cuit)", kcal:208, protein:20, carbs:0, fat:13},
  {name:"Thon (nature, conserve)", kcal:116, protein:26, carbs:0, fat:1},
  {name:"Bœuf haché 5%", kcal:137, protein:21, carbs:0, fat:5},
  {name:"Lentilles cuites", kcal:116, protein:9, carbs:20, fat:0.4},
  {name:"Pois chiches cuits", kcal:164, protein:8.9, carbs:27, fat:2.6},
  {name:"Avocat", kcal:160, protein:2, carbs:8.5, fat:14.7},
  {name:"Brocoli (cuit)", kcal:35, protein:2.4, carbs:7, fat:0.4},
  {name:"Patate douce (cuite)", kcal:86, protein:1.6, carbs:20, fat:0.1},
  {name:"Pomme de terre (cuite)", kcal:87, protein:1.9, carbs:20, fat:0.1},
  {name:"Huile d'olive", kcal:884, protein:0, carbs:0, fat:100},
  {name:"Tofu", kcal:76, protein:8, carbs:1.9, fat:4.8},
  {name:"Whey (poudre)", kcal:400, protein:80, carbs:8, fat:6},
  {name:"Chocolat noir 70%", kcal:598, protein:7.8, carbs:46, fat:43},
  {name:"Miel", kcal:304, protein:0.3, carbs:82, fat:0},
  {name:"Quinoa cuit", kcal:120, protein:4.4, carbs:21, fat:1.9},
];

// Sports : MET (équivalent métabolique) pour estimation calorique
const SPORT_DB = [
  {name:"Musculation", icon:"🏋️", met:5},
  {name:"Course à pied", icon:"🏃", met:9.8},
  {name:"Vélo", icon:"🚴", met:7.5},
  {name:"Natation", icon:"🏊", met:8},
  {name:"Marche rapide", icon:"🚶", met:4.3},
  {name:"Yoga", icon:"🧘", met:2.5},
  {name:"HIIT", icon:"⚡", met:8.5},
  {name:"Football", icon:"⚽", met:7},
  {name:"Basket", icon:"🏀", met:6.5},
  {name:"Tennis", icon:"🎾", met:7.3},
  {name:"Escalade", icon:"🧗", met:6.5},
  {name:"Rameur", icon:"🚣", met:7},
  {name:"Boxe", icon:"🥊", met:9},
  {name:"Étirements", icon:"🤸", met:2.3},
];

/* Données par défaut, pré-remplies à partir de l'export fourni */
function defaultData(){
  return {
    profile:{
      name:"", age:0, sex:"homme", height:0,
      weightCurrent:0, startingWeight:0,
      activity:"moderate",
      dailyActivity:"moderate",
      sportSessionsPerWeek:0,
      sportTypes:[],
      waist:"", bodyFat:null,
      chest:"", arm:"", thigh:""
    },
    objective:{
      type:"fat_loss",
      targetWeight:null,
      targetBodyFat:null,
      targetWaist:null,
      pace:"coach"
    },
    nutrition:{
      caloriesTarget:null,
      proteinTarget:null,
      fatTarget:null,
      carbsTarget:null,
      lastCoachDecision:null
    },
    settings:{
      theme:"light", dailyStepGoal:10000, waterGoalMl:2650, sportGoalMin:30, waterCupMl:250, chartDays:30
    },
    foodLog:{}, sportLog:{}, water:{}, sleep:{}, steps:{},
    habits:{
      config:[
        {id:"sport", label:"Sport effectué"},
        {id:"steps", label:"10 000 pas"},
        {id:"water", label:"2 litres d'eau"},
        {id:"fruitveg", label:"5 fruits/légumes"},
        {id:"read", label:"Lecture"},
        {id:"meditate", label:"Méditation"},
        {id:"early", label:"Couché avant 23h"}
      ],
      logs:{}
    },
    weights:[],
    customFoods:[],
    favorites:[],
    customEntries:[],
    coachDecisions:[]
  };
}

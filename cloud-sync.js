/* VitaTrack Cloud Sync v1 — local-first, Supabase-backed accounts */
(function(){
  const META_KEY='vitatrack_cloud_meta_v1';
  const API='/api/cloud';
  let account={configured:false,authenticated:false,user:null,cloudUpdatedAt:null};
  let syncing=false,pushTimer=null,initialised=false,suppressDirty=false;

  function meta(){try{return JSON.parse(localStorage.getItem(META_KEY)||'{}')}catch{return{}}}
  function setMeta(patch){localStorage.setItem(META_KEY,JSON.stringify({...meta(),...patch}));}
  function hasMeaningfulLocalData(state){
    if(!state)return false;
    return !!(
      state.profile?.age || state.profile?.height || state.profile?.weightCurrent ||
      (state.weights||[]).length || Object.keys(state.foodLog||{}).length ||
      Object.keys(state.stepsLog||{}).length || (state.drinkLog||[]).length ||
      (state.sport?.sessionHistory||[]).length
    );
  }
  async function request(action,options={}){
    const r=await fetch(`${API}?action=${encodeURIComponent(action)}`,{
      credentials:'same-origin',
      ...options,
      headers:{'Content-Type':'application/json',...(options.headers||{})}
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Erreur de synchronisation');
    return d;
  }
  function fmtDate(v){if(!v)return 'Jamais';try{return new Date(v).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})}catch{return String(v)}}

  function renderCloudUI(){
    const box=document.getElementById('cloudAccountBox'); if(!box)return;
    if(!account.configured){
      box.innerHTML='<div class="row"><div><strong>☁️ Compte VitaTrack</strong><div class="muted small">Synchronisation cloud non configurée sur le serveur</div></div></div>';
      return;
    }
    if(!account.authenticated){
      box.innerHTML=`<strong>☁️ Compte VitaTrack</strong><div class="muted small" style="margin-top:4px">Sauvegarde et retrouve tes données sur plusieurs appareils.</div>
        <div class="field" style="margin-top:10px"><label>E-mail</label><input id="cloudEmail" type="email" autocomplete="email" placeholder="toi@exemple.com"></div>
        <div class="field"><label>Mot de passe</label><input id="cloudPassword" type="password" autocomplete="current-password" placeholder="8 caractères minimum"></div>
        <div class="field-row"><button class="btn btn-primary" onclick="cloudLogin()">Se connecter</button><button class="btn btn-ghost" onclick="cloudSignup()">Créer un compte</button></div>`;
      return;
    }
    const m=meta();
    box.innerHTML=`<div class="row"><div><strong>☁️ ${escapeHtml(account.user?.email||'Compte VitaTrack')}</strong><div class="muted small" style="margin-top:3px">Dernière synchro : ${fmtDate(m.lastSyncedAt||account.cloudUpdatedAt)}</div></div><span class="chip">Connecté</span></div>
      <div class="field-row" style="margin-top:10px"><button class="btn btn-primary" onclick="cloudSyncNow()">↻ Synchroniser</button><button class="btn btn-ghost" onclick="cloudLogout()">Déconnexion</button></div>`;
  }

  async function refreshStatus(){
    try{account=await request('status');}catch(e){account={configured:false,authenticated:false,user:null};}
    renderCloudUI();
    return account;
  }
  function markDirty(){
    if(suppressDirty||!initialised)return;
    setMeta({dirty:true,lastLocalChange:new Date().toISOString()});
    if(account.authenticated){clearTimeout(pushTimer);pushTimer=setTimeout(()=>pushState(true),1800);}
  }
  function cloudSafeState(){
    const copy=JSON.parse(JSON.stringify(DATA));
    if(copy.sport)delete copy.sport.progressPhotos;
    return copy;
  }
  async function pushState(silent){
    if(syncing||!account.authenticated)return false;
    syncing=true;
    try{
      const d=await request('push',{method:'POST',body:JSON.stringify({state:cloudSafeState()})});
      setMeta({dirty:false,lastSyncedAt:d.updatedAt||new Date().toISOString(),cloudUserId:account.user?.id||null});
      account.cloudUpdatedAt=d.updatedAt||account.cloudUpdatedAt;
      renderCloudUI(); if(!silent)toast('Données synchronisées'); return true;
    }catch(e){if(!silent)toast(e.message||'Synchronisation impossible');return false;}
    finally{syncing=false;}
  }
  async function applyCloudState(state,updatedAt){
    if(!state)return false;
    suppressDirty=true;
    try{
      const localPhotos=Array.isArray(DATA?.sport?.progressPhotos)?DATA.sport.progressPhotos:[];
      DATA=migrate(state);
      if(localPhotos.length){DATA.sport=DATA.sport||{};DATA.sport.progressPhotos=localPhotos;}
      localStorage.setItem(STORAGE_KEY,JSON.stringify(DATA));
      document.body.dataset.theme=DATA.settings?.theme||'light';
      setMeta({dirty:false,lastSyncedAt:updatedAt||new Date().toISOString(),cloudUserId:account.user?.id||null});
      renderAll();
      return true;
    }finally{suppressDirty=false;}
  }
  async function reconcileAfterLogin(){
    const d=await request('pull');
    account.cloudUpdatedAt=d.updatedAt||null;
    const cloud=d.state, localHas=hasMeaningfulLocalData(DATA), m=meta();
    if(!cloud){ await pushState(true); toast('Compte connecté · données locales sauvegardées'); return; }
    if(!localHas){ await applyCloudState(cloud,d.updatedAt); toast('Données cloud récupérées'); return; }
    if(m.cloudUserId===account.user?.id && !m.dirty){ await applyCloudState(cloud,d.updatedAt); toast('Données synchronisées'); return; }
    const useCloud=confirm('Ce compte VitaTrack contient déjà des données.\n\nOK : utiliser les données du cloud sur cet appareil\nAnnuler : conserver cet appareil et remplacer la sauvegarde cloud');
    if(useCloud){await applyCloudState(cloud,d.updatedAt);toast('Données cloud récupérées');}
    else {await pushState(true);toast('Sauvegarde cloud mise à jour');}
  }

  window.cloudLogin=async function(){
    const email=document.getElementById('cloudEmail')?.value.trim(),password=document.getElementById('cloudPassword')?.value||'';
    if(!email||!password){toast('E-mail et mot de passe requis');return;}
    try{const d=await request('login',{method:'POST',body:JSON.stringify({email,password})});account={...account,...d,configured:true};renderCloudUI();await reconcileAfterLogin();}
    catch(e){toast(e.message||'Connexion impossible');}
  };
  window.cloudSignup=async function(){
    const email=document.getElementById('cloudEmail')?.value.trim(),password=document.getElementById('cloudPassword')?.value||'';
    if(!email||!password){toast('E-mail et mot de passe requis');return;}
    try{const d=await request('signup',{method:'POST',body:JSON.stringify({email,password})});
      if(d.authenticated){account={...account,...d,configured:true};renderCloudUI();await reconcileAfterLogin();}
      else toast(d.message||'Vérifie ton e-mail pour confirmer le compte');
    }catch(e){toast(e.message||'Création du compte impossible');}
  };
  window.cloudLogout=async function(){
    try{await request('logout',{method:'POST',body:'{}'});}catch{}
    account={configured:true,authenticated:false,user:null,cloudUpdatedAt:null};setMeta({cloudUserId:null});renderCloudUI();toast('Déconnecté du cloud');
    if(typeof refreshWithingsUI==='function')refreshWithingsUI();
  };
  window.cloudSyncNow=async function(){
    if(!account.authenticated)return;
    const m=meta();
    if(m.dirty){await pushState(false);return;}
    try{const d=await request('pull');if(d.state)await applyCloudState(d.state,d.updatedAt);toast('Données synchronisées');renderCloudUI();}
    catch(e){toast(e.message||'Synchronisation impossible');}
  };

  // All existing modules keep calling saveState(). Wrap it once to make every
  // change local-first and schedule a cloud push without changing their code.
  const originalSaveState=window.saveState;
  if(typeof originalSaveState==='function'){
    window.saveState=function(){originalSaveState();markDirty();};
  }

  async function init(){
    initialised=true;
    await refreshStatus();
    if(account.authenticated){
      const m=meta();
      if(m.cloudUserId&&m.cloudUserId!==account.user?.id){setMeta({dirty:false,cloudUserId:account.user.id});}
      try{
        if(m.dirty)await pushState(true);
        else {
          const d=await request('pull');
          if(d.state && d.updatedAt && (!m.lastSyncedAt || new Date(d.updatedAt)>new Date(m.lastSyncedAt)))await applyCloudState(d.state,d.updatedAt);
        }
      }catch(e){console.warn('VitaTrack cloud init:',e);}
    }
    renderCloudUI();
  }
  window.addEventListener('online',()=>{if(account.authenticated&&meta().dirty)pushState(true);});
  window.addEventListener('beforeunload',()=>{if(account.authenticated&&meta().dirty){try{navigator.sendBeacon(`${API}?action=push`,new Blob([JSON.stringify({state:cloudSafeState()})],{type:'application/json'}));}catch{}}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

/* VitaTrack nutrition history/deletion compatibility patch */
(function(){
  function esc(v){
    if(typeof window.escapeHtml==='function')return window.escapeHtml(String(v??''));
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  window.renderDrinkLog=function(){
    const source=Array.isArray(DATA.drinkLog)?DATA.drinkLog:[];
    const items=source.map((x,i)=>({...x,idx:i})).filter(x=>x.date===TODAY);
    const kcal=items.reduce((s,x)=>s+(Number(x.kcal)||0),0);
    if(typeof setText==='function'){
      setText('drinkCountToday',items.length);
      setText('drinkCaloriesToday',Math.round(kcal));
    }
    const list=document.getElementById('drinkTodayList');
    if(!list)return;
    list.style.display=items.length?'block':'none';
    list.innerHTML=items.length
      ? `<div style="padding:9px 0 5px;border-top:1px solid var(--border);font-size:10px;font-weight:800;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.04em">Historique du jour</div>`+
        items.map(x=>`<div class="drink-item"><div class="drink-item-main"><span>${esc(x.name)}</span><span class="drink-item-cal">${esc(x.portion||'')} · ${Math.round(Number(x.kcal)||0)} kcal</span></div><button type="button" class="drink-remove" aria-label="Supprimer ${esc(x.name)}" onclick="event.stopPropagation();removeDrink(${x.idx})">×</button></div>`).join('')
      : '';
  };

  const originalRenderFood=window.renderFood;
  if(typeof originalRenderFood==='function'){
    window.renderFood=function(){
      originalRenderFood.apply(this,arguments);
      const card=document.getElementById('foodListCard');
      if(!card)return;
      const list=(DATA.foodLog?.[TODAY]||[]).slice().sort((a,b)=>(a.time||'').localeCompare(b.time||''));
      if(!list.length)return;
      const rows=[...card.querySelectorAll('.meal-row')];
      const groups=['Petit-déjeuner','Déjeuner','Dîner','En-cas'];
      rows.forEach((row,index)=>{
        const type=groups[index];
        if(!type)return;
        const items=list.filter(f=>(f.mealType||'Repas')===type);
        if(!items.length)return;
        const history=document.createElement('div');
        history.className='meal-inline-history';
        history.style.cssText='padding:0 12px 8px';
        history.innerHTML=items.map(f=>`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 0;border-top:1px solid var(--border);font-size:12px"><div style="min-width:0"><strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</strong><span style="color:var(--ink-soft);font-size:11px">${Math.round(Number(f.qty)||0)} g · ${Math.round(Number(f.kcal)||0)} kcal${f.time?` · ${esc(f.time)}`:''}</span></div><button type="button" aria-label="Supprimer ${esc(f.name)}" style="width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;flex:none;border:0;background:transparent;color:var(--ink-soft);font-size:20px;line-height:1;border-radius:50%;cursor:pointer" onclick="event.preventDefault();event.stopPropagation();removeFood('${String(f.id).replace(/'/g,"\\'")}')">×</button></div>`).join('');
        row.insertAdjacentElement('afterend',history);
      });
    };
  }

  if(typeof window.renderAll==='function'){
    const originalRenderAll=window.renderAll;
    window.renderAll=function(){
      const out=originalRenderAll.apply(this,arguments);
      try{window.renderDrinkLog();}catch(e){console.warn('VitaTrack drink history patch:',e);}
      try{window.renderFood();}catch(e){console.warn('VitaTrack food history patch:',e);}
      return out;
    };
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      try{window.renderDrinkLog();window.renderFood();}catch(e){console.warn('VitaTrack nutrition patch init:',e);}
    });
  }else{
    try{window.renderDrinkLog();window.renderFood();}catch(e){console.warn('VitaTrack nutrition patch init:',e);}
  }
})();

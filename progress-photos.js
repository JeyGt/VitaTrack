/* VitaTrack — Photos d'évolution
   Images stored in IndexedDB (not localStorage/cloud state) to avoid filling the app state. */
(function(){
  const DB_NAME='vitatrack_media_v1';
  const DB_VERSION=1;
  const STORE='progressPhotos';
  const MAX_SOURCE_BYTES=18*1024*1024;
  const MAX_IMAGE_SIDE=1600;
  let currentPhotoId=null;
  let albumUrls=[];
  let sportUrls=[];
  let viewerUrl='';
  let migrationPromise=null;

  function safeDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):todayStr();}
  function formatPhotoDate(value){
    const d=new Date(String(value||'')+'T12:00:00');
    return Number.isNaN(d.getTime())?String(value||''):d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}).replace('.','');
  }
  function makeId(){return (window.crypto&&window.crypto.randomUUID)?window.crypto.randomUUID():'photo_'+Date.now()+'_'+Math.random().toString(36).slice(2);}

  function openDb(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){reject(new Error('IndexedDB indisponible'));return;}
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE)){
          const store=db.createObjectStore(STORE,{keyPath:'id'});
          store.createIndex('date','date',{unique:false});
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Impossible d’ouvrir le stockage photo'));
    });
  }
  async function withStore(mode,work){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
      let result;
      try{result=work(store);}catch(e){db.close();reject(e);return;}
      tx.oncomplete=()=>{db.close();resolve(result?.result!==undefined?result.result:result);};
      tx.onerror=()=>{db.close();reject(tx.error||new Error('Erreur de stockage photo'));};
      tx.onabort=()=>{db.close();reject(tx.error||new Error('Stockage photo interrompu'));};
    });
  }
  async function getAllPhotos(){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();
      req.onsuccess=()=>{
        const rows=(req.result||[]).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||Number(a.createdAt||0)-Number(b.createdAt||0));
        db.close();resolve(rows);
      };
      req.onerror=()=>{db.close();reject(req.error);};
    });
  }
  async function getPhoto(id){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(id);
      req.onsuccess=()=>{db.close();resolve(req.result||null);};
      req.onerror=()=>{db.close();reject(req.error);};
    });
  }
  async function putPhoto(photo){return withStore('readwrite',store=>store.put(photo));}
  async function removePhoto(id){return withStore('readwrite',store=>store.delete(id));}

  function dataUrlToBlob(dataUrl){
    const parts=String(dataUrl||'').split(','),meta=parts[0]||'',raw=atob(parts[1]||'');
    const type=(meta.match(/data:([^;]+)/)||[])[1]||'image/jpeg';
    const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return new Blob([bytes],{type});
  }
  async function migrateLegacyProgressPhotos(){
    if(migrationPromise)return migrationPromise;
    migrationPromise=(async()=>{
      const legacy=(typeof DATA!=='undefined'&&Array.isArray(DATA?.sport?.progressPhotos))?DATA.sport.progressPhotos:[];
      if(!legacy.length)return;
      try{
        for(let i=0;i<legacy.length;i++){
          const item=legacy[i];if(!item?.data)continue;
          await putPhoto({id:'legacy_'+i+'_'+safeDate(item.date),date:safeDate(item.date),angle:'other',createdAt:Date.now()+i,blob:dataUrlToBlob(item.data)});
        }
        DATA.sport.progressPhotos=[];
        saveState();
      }catch(e){console.warn('VitaTrack photo migration:',e);}
    })();
    return migrationPromise;
  }

  async function decodeImage(file){
    if('createImageBitmap' in window){
      try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch(_){try{return await createImageBitmap(file);}catch(__){}}
    }
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),img=new Image();
      img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Image illisible'));};
      img.src=url;
    });
  }
  async function compressPhoto(file){
    if(!file||!String(file.type||'').startsWith('image/'))throw new Error('Choisis une image');
    if(file.size>MAX_SOURCE_BYTES)throw new Error('Cette image est trop volumineuse');
    const image=await decodeImage(file),w=image.width||image.naturalWidth,h=image.height||image.naturalHeight;
    if(!w||!h)throw new Error('Image illisible');
    const ratio=Math.min(1,MAX_IMAGE_SIDE/Math.max(w,h)),cw=Math.max(1,Math.round(w*ratio)),ch=Math.max(1,Math.round(h*ratio));
    const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;
    const ctx=canvas.getContext('2d',{alpha:false});ctx.drawImage(image,0,0,cw,ch);
    if(image.close)try{image.close();}catch(_){}
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.84));
    return blob||file;
  }
  function revokeAll(list){for(const u of list)try{URL.revokeObjectURL(u);}catch(_){}list.length=0;}
  function makeUrl(blob,list){const u=URL.createObjectURL(blob);list.push(u);return u;}

  async function refreshProfilePhotoSummary(){
    const el=document.getElementById('profilePhotoSummary');if(!el)return;
    try{await migrateLegacyProgressPhotos();const p=await getAllPhotos();el.textContent=p.length?`${p.length} photo${p.length>1?'s':''} enregistrée${p.length>1?'s':''} · dernière ${formatPhotoDate(p[p.length-1].date)}`:'Ajoute des photos pour comparer ton évolution';}
    catch(_){el.textContent='Album photo disponible sur cet appareil';}
  }

  function comparisonPair(photos){
    if(photos.length<2)return null;
    return {first:photos[0],last:photos[photos.length-1]};
  }
  function comparisonHtml(pair){
    const box=document.getElementById('progressComparison');if(!box)return;
    if(!pair){box.innerHTML='<div class="progress-comparison-empty">Ajoute au moins deux photos pour afficher automatiquement une comparaison avant / maintenant.</div>';return;}
    const u1=makeUrl(pair.first.blob,albumUrls),u2=makeUrl(pair.last.blob,albumUrls);
    box.innerHTML=`<div class="card progress-comparison-card"><div class="progress-comparison-head"><div><div class="eyebrow">Comparaison</div><h3>Avant / maintenant</h3></div></div><div class="progress-comparison-grid"><button type="button" class="progress-comparison-photo" onclick="openProgressPhotoViewer('${pair.first.id}')"><img src="${u1}" alt="Ancienne photo"><span class="progress-comparison-label">${formatPhotoDate(pair.first.date)}</span></button><button type="button" class="progress-comparison-photo" onclick="openProgressPhotoViewer('${pair.last.id}')"><img src="${u2}" alt="Photo récente"><span class="progress-comparison-label">${formatPhotoDate(pair.last.date)}</span></button></div></div>`;
  }

  async function renderProgressAlbum(){
    const grid=document.getElementById('progressPhotoGrid');if(!grid)return;
    grid.innerHTML='<div class="progress-photo-empty">Chargement de l’album…</div>';
    revokeAll(albumUrls);
    try{
      await migrateLegacyProgressPhotos();
      const photos=await getAllPhotos();
      document.getElementById('progressAlbumCount').textContent=`${photos.length} photo${photos.length>1?'s':''}`;
      comparisonHtml(comparisonPair(photos));
      const ordered=photos.slice().reverse();
      if(!ordered.length){grid.innerHTML='<div class="progress-photo-empty">Aucune photo pour le moment. Prends ta première photo pour commencer ton suivi.</div>';return;}
      grid.innerHTML=ordered.map(p=>{
        const u=makeUrl(p.blob,albumUrls);
        return `<button type="button" class="progress-photo-card" onclick="openProgressPhotoViewer('${p.id}')"><img src="${u}" alt="Photo du ${formatPhotoDate(p.date)}"><span class="progress-photo-card-meta"><strong>${formatPhotoDate(p.date)}</strong></span></button>`;
      }).join('');
    }catch(e){
      console.warn('VitaTrack album:',e);grid.innerHTML='<div class="progress-photo-error">Impossible d’ouvrir le stockage photo sur cet appareil.</div>';
    }
  }

  async function addPhotoFile(file,date){
    const blob=await compressPhoto(file);
    await putPhoto({id:makeId(),date:safeDate(date),createdAt:Date.now(),blob});
  }
  async function addProgressPhotoFromInput(input){
    const file=input?.files?.[0];if(!file)return;
    try{
      const date=document.getElementById('progressPhotoDate')?.value||todayStr();
      toast('Enregistrement de la photo…');
      await addPhotoFile(file,date);
      input.value='';
      await renderProgressAlbum();await refreshProfilePhotoSummary();
      if(document.getElementById('sportPhotos'))await renderSportPhotos();
      toast('Photo d’évolution enregistrée');
    }catch(e){input.value='';toast(e?.message||'Impossible d’enregistrer la photo');}
  }
  async function addSportProgressPhoto(input){
    const file=input?.files?.[0];if(!file)return;
    try{await addPhotoFile(file,todayStr());input.value='';await renderSportPhotos();await refreshProfilePhotoSummary();toast('Photo de suivi enregistrée');}
    catch(e){input.value='';toast(e?.message||'Impossible d’enregistrer la photo');}
  }

  async function renderSportPhotos(){
    const b=document.getElementById('sportPhotos');if(!b)return;
    revokeAll(sportUrls);
    try{await migrateLegacyProgressPhotos();const p=(await getAllPhotos()).slice(-6).reverse();b.innerHTML=p.length?p.map(x=>`<button type="button" class="photo-slot" onclick="openProgressAlbum();setTimeout(()=>openProgressPhotoViewer('${x.id}'),0)"><img src="${makeUrl(x.blob,sportUrls)}" alt="Photo de suivi"></button>`).join(''):'<button type="button" class="photo-slot" onclick="openProgressAlbum()">📷</button><button type="button" class="photo-slot" onclick="openProgressAlbum()">📷</button><button type="button" class="photo-slot" onclick="openProgressAlbum()">📷</button>';}
    catch(_){b.innerHTML='<div class="photo-slot">📷</div><div class="photo-slot">📷</div><div class="photo-slot">📷</div>';}
  }

  async function openProgressAlbum(){
    const el=document.getElementById('progressAlbum');if(!el)return;
    const date=document.getElementById('progressPhotoDate');if(date&&!date.value)date.value=todayStr();
    el.classList.add('open');el.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    await renderProgressAlbum();
  }
  function closeProgressAlbum(){
    const el=document.getElementById('progressAlbum');if(el){el.classList.remove('open');el.setAttribute('aria-hidden','true');}
    closeProgressPhotoViewer();revokeAll(albumUrls);document.body.style.overflow='';
  }

  async function openProgressPhotoViewer(id){
    try{
      const photo=await getPhoto(id);if(!photo)return;currentPhotoId=id;
      if(viewerUrl)URL.revokeObjectURL(viewerUrl);viewerUrl=URL.createObjectURL(photo.blob);
      document.getElementById('progressViewerImage').src=viewerUrl;
      document.getElementById('progressViewerDate').value=safeDate(photo.date);
      const viewer=document.getElementById('progressPhotoViewer');viewer.classList.add('open');viewer.setAttribute('aria-hidden','false');
    }catch(_){toast('Impossible d’ouvrir cette photo');}
  }
  function closeProgressPhotoViewer(){
    const viewer=document.getElementById('progressPhotoViewer');if(viewer){viewer.classList.remove('open');viewer.setAttribute('aria-hidden','true');}
    currentPhotoId=null;if(viewerUrl){URL.revokeObjectURL(viewerUrl);viewerUrl='';}
    const img=document.getElementById('progressViewerImage');if(img)img.removeAttribute('src');
  }
  async function saveProgressPhotoMetadata(){
    if(!currentPhotoId)return;
    try{
      const photo=await getPhoto(currentPhotoId);if(!photo)return;
      photo.date=safeDate(document.getElementById('progressViewerDate')?.value||photo.date);
      await putPhoto(photo);closeProgressPhotoViewer();await renderProgressAlbum();await refreshProfilePhotoSummary();if(document.getElementById('sportPhotos'))await renderSportPhotos();toast('Photo mise à jour');
    }catch(_){toast('Impossible de modifier la photo');}
  }
  async function deleteCurrentProgressPhoto(){
    if(!currentPhotoId)return;
    if(!confirm('Supprimer définitivement cette photo ?'))return;
    try{await removePhoto(currentPhotoId);closeProgressPhotoViewer();await renderProgressAlbum();await refreshProfilePhotoSummary();if(document.getElementById('sportPhotos'))await renderSportPhotos();toast('Photo supprimée');}
    catch(_){toast('Impossible de supprimer la photo');}
  }

  // Keep the existing Sport photo entry point, but route it to IndexedDB.
  window.renderSportPhotos=renderSportPhotos;
  window.addSportProgressPhoto=addSportProgressPhoto;
  window.openProgressAlbum=openProgressAlbum;
  window.closeProgressAlbum=closeProgressAlbum;
  window.addProgressPhotoFromInput=addProgressPhotoFromInput;
  window.openProgressPhotoViewer=openProgressPhotoViewer;
  window.closeProgressPhotoViewer=closeProgressPhotoViewer;
  window.saveProgressPhotoMetadata=saveProgressPhotoMetadata;
  window.deleteCurrentProgressPhoto=deleteCurrentProgressPhoto;
  window.refreshProgressPhotoSummary=refreshProfilePhotoSummary;

  const originalOpenProfile=window.openProfileSheet;
  if(typeof originalOpenProfile==='function')window.openProfileSheet=function(){originalOpenProfile.apply(this,arguments);setTimeout(refreshProfilePhotoSummary,0);};
  window.addEventListener('beforeunload',()=>{revokeAll(albumUrls);revokeAll(sportUrls);if(viewerUrl)URL.revokeObjectURL(viewerUrl);});
})();

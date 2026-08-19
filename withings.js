// VitaTrack / Withings connector
// Persistent Withings authorization in Supabase + per-device lastupdate cookie.
const crypto = require('crypto');

const API = 'https://wbsapi.withings.net';
const AUTH = 'https://account.withings.com/oauth2_user/authorize2';
const SCOPES = 'user.metrics,user.info';
const SYNC_COOKIE = 'vt_withings_sync';

function cfg(){
  return {
    clientId: process.env.WITHINGS_CLIENT_ID,
    clientSecret: process.env.WITHINGS_CLIENT_SECRET,
    redirectUri: process.env.WITHINGS_REDIRECT_URI || '',
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

function json(res,status,data){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(data));
}

function supabaseConfigured(c){
  return !!(c.supabaseUrl && c.supabaseKey);
}

async function supabaseRequest(c,path,options={}){
  const r=await fetch(`${c.supabaseUrl}/rest/v1/${path}`,{
    ...options,
    headers:{
      apikey:c.supabaseKey,
      Authorization:`Bearer ${c.supabaseKey}`,
      'Content-Type':'application/json',
      ...(options.headers||{})
    }
  });
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):null;}catch{data=text;}
  if(!r.ok){
    console.error('Supabase error:',r.status,data);
    throw new Error(
      `Supabase request failed (${r.status}): ${
        typeof data === 'string' ? data : JSON.stringify(data)
      }`
    );
  }
  return data;
}

async function getConnection(c){
  const rows=await supabaseRequest(c,
    'withings_connection?select=id,userid,access_token,refresh_token,expires_at,updated_at,last_sync_at&order=id.desc&limit=1',
    {method:'GET'}
  );
  return Array.isArray(rows)&&rows.length?rows[0]:null;
}

async function saveConnection(c,s){
  // This app has one Withings account. Replace the single stored row atomically.
  await supabaseRequest(c,'withings_connection?id=not.is.null',{
    method:'DELETE',headers:{Prefer:'return=minimal'}
  });

  await supabaseRequest(c,'withings_connection',{
    method:'POST',headers:{Prefer:'return=minimal'},
    body:JSON.stringify({
      userid:String(s.userid),
      access_token:s.access_token,
      refresh_token:s.refresh_token,
      expires_at:new Date(s.expires_at).toISOString(),
      updated_at:new Date().toISOString(),
      last_sync_at:null
    })
  });
}

async function updateConnection(c,id,patch){
  await supabaseRequest(c,`withings_connection?id=eq.${encodeURIComponent(String(id))}`,{
    method:'PATCH',headers:{Prefer:'return=minimal'},
    body:JSON.stringify({...patch,updated_at:new Date().toISOString()})
  });
}

function getCookie(req,name){
  const h=req.headers.cookie||'';
  const m=h.match(new RegExp('(?:^|; )'+name.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+'=([^;]*)'));
  return m?decodeURIComponent(m[1]):null;
}

function setCookie(res,name,value,maxAge){
  res.setHeader('Set-Cookie',`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearCookie(res,name){
  res.setHeader('Set-Cookie',`${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function parseIntSafe(v){
  const n=Number(v);
  return Number.isFinite(n)&&n>0?Math.floor(n):0;
}

async function exchangeCode(c,code){
  const form=new URLSearchParams({
    action:'requesttoken',grant_type:'authorization_code',
    client_id:c.clientId,client_secret:c.clientSecret,
    code,redirect_uri:c.redirectUri
  });
  const r=await fetch(API+'/v2/oauth2',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form
  });
  const d=await r.json();
  if(d.status!==0||!d.body?.refresh_token||!d.body?.access_token){
    console.error('Withings token exchange:',d);
    throw new Error('Withings token exchange failed');
  }
  return {
    userid:d.body.userid,
    access_token:d.body.access_token,
    refresh_token:d.body.refresh_token,
    expires_at:Date.now()+Number(d.body.expires_in||10800)*1000
  };
}

async function refreshSession(c,conn){
  const expiresAt=new Date(conn.expires_at).getTime();
  if(expiresAt>Date.now()+60000){
    return {...conn,expires_at:expiresAt};
  }

  const form=new URLSearchParams({
    action:'requesttoken',grant_type:'refresh_token',
    client_id:c.clientId,client_secret:c.clientSecret,
    refresh_token:conn.refresh_token
  });
  const r=await fetch(API+'/v2/oauth2',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form
  });
  const d=await r.json();
  if(d.status!==0||!d.body?.access_token||!d.body?.refresh_token){
    console.error('Withings refresh:',d);
    throw new Error('Withings refresh failed');
  }

  const next={
    ...conn,
    access_token:d.body.access_token,
    refresh_token:d.body.refresh_token,
    expires_at:Date.now()+Number(d.body.expires_in||10800)*1000
  };

  await updateConnection(c,conn.id,{
    access_token:next.access_token,
    refresh_token:next.refresh_token,
    expires_at:new Date(next.expires_at).toISOString()
  });
  return next;
}

function mapMeasurements(groups){
  let maxModified=0;
  const measurements=groups.map(g=>{
    const modified=parseIntSafe(g.modified||g.created||g.date);
    if(modified>maxModified)maxModified=modified;
    const out={
      id:g.grpid,
      date:new Date(Number(g.date)*1000).toISOString().slice(0,10),
      modified
    };
    for(const m of g.measures||[]){
      const v=Number(m.value)*Math.pow(10,Number(m.unit||0));
      if(m.type===1)out.weight=v;
      if(m.type===5)out.fatFreeMass=v;
      if(m.type===6)out.bodyFat=v;
      if(m.type===8)out.fatMass=v;
      if(m.type===76)out.muscleMass=v;
      if(m.type===77)out.hydration=v;
      if(m.type===88)out.boneMass=v;
    }
    return out;
  }).filter(x=>x.weight>0);
  return {measurements,maxModified};
}

async function fetchMeasurements(c,conn,lastupdate){
  const end=Math.floor(Date.now()/1000);
  const form=new URLSearchParams({
    action:'getmeas',
    meastype:'1,5,6,8,76,77,88',
    category:'1'
  });

  if(lastupdate>0){
    form.set('lastupdate',String(lastupdate));
  }else{
    form.set('startdate',String(end-60*60*24*180));
    form.set('enddate',String(end));
  }

  const r=await fetch(API+'/measure',{
    method:'POST',
    headers:{Authorization:`Bearer ${conn.access_token}`,'Content-Type':'application/x-www-form-urlencoded'},
    body:form
  });
  const d=await r.json();
  if(d.status!==0){
    console.error('Withings measurements:',d);
    throw new Error('Withings measurement request failed');
  }
  return mapMeasurements(d.body?.measuregrps||[]);
}

module.exports=async(req,res)=>{
  const c=cfg();
  const action=(req.query&&req.query.action)||'status';

  if(action==='notify' && req.method==='HEAD'){
    res.statusCode=204;
    return res.end();
  }

  if(action==='status'){
    let connected=false;
    let lastSync=null;
    if(supabaseConfigured(c)){
      try{
        const conn=await getConnection(c);
        connected=!!conn?.refresh_token;
        lastSync=conn?.last_sync_at||null;
      }catch(e){console.error('Withings status:',e);}
    }
    return json(res,200,{
      configured:!!(c.clientId&&c.clientSecret&&c.redirectUri&&supabaseConfigured(c)),
      connected,lastSync
    });
  }

  if(!c.clientId||!c.clientSecret||!c.redirectUri||!supabaseConfigured(c)){
    return json(res,503,{error:'Withings connector not configured'});
  }

  if(action==='connect'){
    const nonce=crypto.randomBytes(24).toString('hex');
    const state=Buffer.from(JSON.stringify({nonce,iat:Date.now()})).toString('base64url');
    const sig=crypto.createHmac('sha256',process.env.WITHINGS_SESSION_SECRET||'CHANGE_ME').update(state).digest('base64url');
    const signedState=`${state}.${sig}`;
    const u=new URL(AUTH);
    u.searchParams.set('response_type','code');
    u.searchParams.set('client_id',c.clientId);
    u.searchParams.set('scope',SCOPES);
    u.searchParams.set('redirect_uri',c.redirectUri);
    u.searchParams.set('state',signedState);
    res.statusCode=302;
    res.setHeader('Location',u.toString());
    return res.end();
  }

  if(action==='callback'){
    const state=String(req.query.state||'');
    const code=String(req.query.code||'');
    if(!state&&!code)return json(res,200,{ok:true,ready:true});

    let payload=null;
    try{
      const [body,sig]=state.split('.');
      const secret=process.env.WITHINGS_SESSION_SECRET||'CHANGE_ME';
      const good=crypto.createHmac('sha256',secret).update(body).digest('base64url')===sig;
      if(good)payload=JSON.parse(Buffer.from(body,'base64url').toString());
    }catch{}

    if(!payload||!payload.nonce||!payload.iat||Date.now()-Number(payload.iat)>10*60*1000||!code){
      return json(res,400,{error:'Invalid Withings authorization state'});
    }

    let session;
  try {
    session = await exchangeCode(c, code);
  } catch (e) {
    console.error('Withings authorization code exchange failed:', e);
    return json(res, 502, {
      error: 'Withings token exchange failed',
      details: e.message
    });
  }

  try {
    await saveConnection(c, session);

    res.statusCode=302;
    res.setHeader('Location','/');
    return res.end();
  } catch (e) {
    console.error('Saving Withings connection failed:', e);

    return json(res, 500, {
      error: 'Unable to save Withings connection',
      details: e.message
    });
  }

    res.statusCode=302;
    res.setHeader('Location','/');
    return res.end();
  }

  if(action==='disconnect'){
    try{
      await supabaseRequest(c,'withings_connection?id=not.is.null',{
        method:'DELETE',headers:{Prefer:'return=minimal'}
      });
    }catch(e){
      console.error('Withings disconnect:',e);
      return json(res,500,{error:'Unable to disconnect Withings'});
    }
    clearCookie(res,SYNC_COOKIE);
    return json(res,200,{ok:true});
  }

  // Notification endpoint: acknowledge the event. Automatic retrieval is handled
  // by the client-side background poll below; this endpoint is intentionally light.
  if(action==='notify'){
    res.statusCode=204;
    return res.end();
  }

  let conn;
  try{conn=await getConnection(c);}catch(e){
    console.error('Loading Withings connection:',e);
    return json(res,500,{error:'Unable to load Withings connection'});
  }
  if(!conn?.refresh_token)return json(res,401,{error:'Not connected'});

  if(action==='measurements'){
    let session;
    try{session=await refreshSession(c,conn);}catch(e){
      console.error('Token refresh:',e);
      return json(res,502,{error:'Withings token refresh failed'});
    }

    const lastupdate=parseIntSafe(getCookie(req,SYNC_COOKIE));
    let result;
    try{result=await fetchMeasurements(c,session,lastupdate);}catch(e){
      return json(res,502,{error:e.message});
    }

    if(result.maxModified>lastupdate){
      setCookie(res,SYNC_COOKIE,String(result.maxModified),60*60*24*365);
    }

    if(result.measurements.length||!lastupdate){
      try{await updateConnection(c,session.id,{last_sync_at:new Date().toISOString()});}catch(e){console.error('last_sync_at:',e);}
    }

    return json(res,200,{measurements:result.measurements,lastUpdate:result.maxModified||lastupdate});
  }

  return json(res,404,{error:'Unknown action'});
};

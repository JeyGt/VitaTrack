// VitaTrack Cloud account + state sync (Supabase Auth + server-side state storage)
const crypto = require('crypto');

const CLOUD_COOKIE = 'vt_cloud_session';
const WITHINGS_USER_COOKIE = 'vt_user_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function cfg(){
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    sessionSecret: process.env.CLOUD_SESSION_SECRET || process.env.WITHINGS_SESSION_SECRET,
    withingsSessionSecret: process.env.WITHINGS_SESSION_SECRET || process.env.CLOUD_SESSION_SECRET
  };
}

function json(res,status,data){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(data));
}

function readBody(req){
  return new Promise((resolve,reject)=>{
    let raw='';
    req.on('data',chunk=>{ raw+=chunk; if(raw.length>2_500_000){ reject(new Error('Body too large')); req.destroy(); } });
    req.on('end',()=>{ try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('Invalid JSON'));} });
    req.on('error',reject);
  });
}

function getCookie(req,name){
  const hit=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
  return hit?decodeURIComponent(hit.slice(name.length+1)):null;
}
function appendSetCookie(res,value){
  const current=res.getHeader('Set-Cookie');
  if(!current)res.setHeader('Set-Cookie',value);
  else if(Array.isArray(current))res.setHeader('Set-Cookie',[...current,value]);
  else res.setHeader('Set-Cookie',[current,value]);
}
function setCookie(res,name,value,maxAge=COOKIE_MAX_AGE){
  appendSetCookie(res,`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}
function clearCookie(res,name){
  appendSetCookie(res,`${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function key(secret){ return crypto.createHash('sha256').update(String(secret||'')).digest(); }
function encrypt(secret,value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key(secret),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}
function decrypt(secret,value){
  if(!secret||!value)return null;
  try{
    const [version,iv64,tag64,data64]=String(value).split('.');
    if(version!=='v1'||!iv64||!tag64||!data64)return null;
    const decipher=crypto.createDecipheriv('aes-256-gcm',key(secret),Buffer.from(iv64,'base64url'));
    decipher.setAuthTag(Buffer.from(tag64,'base64url'));
    const raw=Buffer.concat([decipher.update(Buffer.from(data64,'base64url')),decipher.final()]).toString('utf8');
    return JSON.parse(raw);
  }catch{return null;}
}
function signValue(secret,value){ return crypto.createHmac('sha256',secret).update(value).digest('base64url'); }
function setWithingsUserCookie(res,c,userId){
  if(!c.withingsSessionSecret||!userId)return;
  setCookie(res,WITHINGS_USER_COOKIE,`${userId}.${signValue(c.withingsSessionSecret,userId)}`,60*60*24*365*2);
}

function configured(c){ return !!(c.supabaseUrl&&c.anonKey&&c.serviceKey&&c.sessionSecret); }
async function authRequest(c,path,options={}){
  const r=await fetch(`${c.supabaseUrl}/auth/v1/${path}`,{
    ...options,
    headers:{'apikey':c.anonKey,'Content-Type':'application/json',...(options.headers||{})}
  });
  const text=await r.text(); let data=null;
  try{data=text?JSON.parse(text):null;}catch{data={message:text};}
  if(!r.ok){ const e=new Error(data?.msg||data?.message||data?.error_description||'Authentication failed'); e.status=r.status; throw e; }
  return data;
}
async function dbRequest(c,path,options={}){
  const r=await fetch(`${c.supabaseUrl}/rest/v1/${path}`,{
    ...options,
    headers:{apikey:c.serviceKey,Authorization:`Bearer ${c.serviceKey}`,'Content-Type':'application/json',...(options.headers||{})}
  });
  const text=await r.text(); let data=null;
  try{data=text?JSON.parse(text):null;}catch{data=text;}
  if(!r.ok){ console.error('VitaTrack cloud DB error:',r.status,data); throw new Error(`Cloud database failed (${r.status})`); }
  return data;
}

function sessionFromAuth(data){
  const access=data?.access_token||data?.session?.access_token;
  const refresh=data?.refresh_token||data?.session?.refresh_token;
  const expiresIn=Number(data?.expires_in||data?.session?.expires_in||3600);
  const user=data?.user||data?.session?.user;
  if(!access||!refresh||!user?.id)return null;
  return {access_token:access,refresh_token:refresh,expires_at:Date.now()+expiresIn*1000,user:{id:user.id,email:user.email||''}};
}
function writeSession(res,c,s){
  setCookie(res,CLOUD_COOKIE,encrypt(c.sessionSecret,s));
  setWithingsUserCookie(res,c,s.user.id);
}
async function readSession(req,res,c){
  let s=decrypt(c.sessionSecret,getCookie(req,CLOUD_COOKIE));
  if(!s?.user?.id||!s.refresh_token)return null;
  if(Number(s.expires_at||0)>Date.now()+120000)return s;
  try{
    const d=await authRequest(c,'token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:s.refresh_token})});
    const fresh=sessionFromAuth(d);
    if(!fresh)return null;
    writeSession(res,c,fresh);
    return fresh;
  }catch(e){ clearCookie(res,CLOUD_COOKIE); return null; }
}
function publicUser(s){ return s?{id:s.user.id,email:s.user.email||''}:null; }

async function getCloudState(c,userId){
  const rows=await dbRequest(c,`vitatrack_user_state?select=state,updated_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`,{method:'GET'});
  return Array.isArray(rows)&&rows.length?rows[0]:null;
}
async function putCloudState(c,userId,state){
  const now=new Date().toISOString();
  await dbRequest(c,'vitatrack_user_state?on_conflict=user_id',{
    method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify({user_id:userId,state,updated_at:now})
  });
  return now;
}

module.exports = async function handler(req,res){
  const c=cfg();
  const url=new URL(req.url,'https://vitatrack.local');
  const action=url.searchParams.get('action')||'status';
  if(!configured(c))return json(res,503,{configured:false,error:'Cloud sync not configured'});

  try{
    if(action==='status'){
      const s=await readSession(req,res,c);
      let cloudUpdatedAt=null;
      if(s){ const row=await getCloudState(c,s.user.id); cloudUpdatedAt=row?.updated_at||null; }
      return json(res,200,{configured:true,authenticated:!!s,user:publicUser(s),cloudUpdatedAt});
    }

    if(action==='signup'){
      if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
      const body=await readBody(req); const email=String(body.email||'').trim().toLowerCase(); const password=String(body.password||'');
      if(!/^\S+@\S+\.\S+$/.test(email))return json(res,400,{error:'Adresse e-mail invalide'});
      if(password.length<8)return json(res,400,{error:'Le mot de passe doit contenir au moins 8 caractères'});
      const d=await authRequest(c,'signup',{method:'POST',body:JSON.stringify({email,password})});
      const s=sessionFromAuth(d);
      if(s){ writeSession(res,c,s); return json(res,200,{authenticated:true,user:publicUser(s),needsEmailConfirmation:false}); }
      return json(res,200,{authenticated:false,needsEmailConfirmation:true,message:'Confirme ton adresse e-mail puis connecte-toi.'});
    }

    if(action==='login'){
      if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
      const body=await readBody(req); const email=String(body.email||'').trim().toLowerCase(); const password=String(body.password||'');
      const d=await authRequest(c,'token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
      const s=sessionFromAuth(d); if(!s)throw new Error('Session invalide');
      writeSession(res,c,s);
      return json(res,200,{authenticated:true,user:publicUser(s)});
    }

    if(action==='logout'){
      clearCookie(res,CLOUD_COOKIE);
      clearCookie(res,WITHINGS_USER_COOKIE);
      return json(res,200,{authenticated:false});
    }

    const s=await readSession(req,res,c);
    if(!s)return json(res,401,{error:'Non connecté'});

    if(action==='pull'){
      const row=await getCloudState(c,s.user.id);
      return json(res,200,{state:row?.state||null,updatedAt:row?.updated_at||null,user:publicUser(s)});
    }

    if(action==='push'){
      if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
      const body=await readBody(req);
      if(!body.state||typeof body.state!=='object'||Array.isArray(body.state))return json(res,400,{error:'État VitaTrack invalide'});
      const serialized=JSON.stringify(body.state);
      if(serialized.length>2_000_000)return json(res,413,{error:'Données VitaTrack trop volumineuses pour la synchronisation'});
      const updatedAt=await putCloudState(c,s.user.id,body.state);
      return json(res,200,{ok:true,updatedAt});
    }

    return json(res,404,{error:'Unknown action'});
  }catch(e){
    console.error('VitaTrack cloud error:',e);
    const status=e.status===400||e.status===401||e.status===422?400:500;
    return json(res,status,{error:e.message||'Erreur cloud'});
  }
};

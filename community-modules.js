import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

const dialog=document.querySelector('#featureDialog'), title=document.querySelector('#dialogTitle'), eyebrow=document.querySelector('#dialogEyebrow'), body=document.querySelector('#dialogBody'), form=document.querySelector('#dialogForm');
const labels={packages:'Paquetes',incidents:'Incidencias',reservations:'Reservaciones',announcements:'Comunicados'};
const icons={packages:'📦',incidents:'🛠️',reservations:'📅',announcements:'📢'};
const modules=['packages','incidents','reservations','announcements'];
const syncLocks=new Map();
const lastSync=new Map();
let auth,db,ready=false,profile={role:'resident',status:'active'},activeModule=null;
const root=()=>['apps',APP_NAMESPACE,'communities',COMMUNITY_ID];
const cacheKey=m=>`neighbor-${COMMUNITY_ID}-${m}`;

init();
async function init(){
  try{
    const appMod=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authMod=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const fs=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    const app=appMod.getApps().length?appMod.getApp():appMod.initializeApp(firebaseConfig);
    auth=authMod.getAuth(app); db=fs.getFirestore(app); ready=true;
    authMod.onAuthStateChanged(auth,async user=>{
      if(!user)return;
      try{
        const snap=await fs.getDoc(fs.doc(db,...root(),'users',user.uid));
        profile=snap.exists()?{uid:user.uid,...snap.data()}:{uid:user.uid,role:'resident',name:user.displayName||user.email||'Residente'};
      }catch(e){console.warn('No se pudo cargar el perfil comunitario.',e);}
    });
  }catch(e){console.warn('Módulos comunitarios en modo local.',e);}
}

window.addEventListener('neighbor:realtime-update',event=>{
  const {module,items}=event.detail||{};
  if(!modules.includes(module)||!Array.isArray(items))return;
  writeCache(module,items);
  lastSync.set(module,Date.now());
  if(activeModule===module&&dialog.open)renderList(module,visible(module,items),false);
});

function isAdmin(){return profile.role==='admin';}
function isGuard(){return profile.role==='guard';}
function readCache(m){try{const x=JSON.parse(localStorage.getItem(cacheKey(m)));return Array.isArray(x)?x:[];}catch{return[];}}
function writeCache(m,x){try{localStorage.setItem(cacheKey(m),JSON.stringify(x));}catch{}}
function visible(m,items){
  if(isAdmin())return items;
  if(m==='announcements'){
    const allowed=isGuard()?['Todos','Seguridad']:profile.role==='board'?['Todos','Junta']:['Todos','Residentes'];
    return items.filter(x=>allowed.includes(x.audience||'Todos'));
  }
  return items.filter(x=>x.createdBy===auth?.currentUser?.uid||!ready);
}

async function syncModule(m,force=false){
  if(!ready||!auth?.currentUser)return readCache(m);
  const cached=readCache(m);
  const age=Date.now()-(lastSync.get(m)||0);
  if(!force&&cached.length&&age<45000)return cached;
  if(syncLocks.has(m))return syncLocks.get(m);
  const task=(async()=>{
    const fs=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    try{
      const q=fs.query(fs.collection(db,...root(),m),fs.orderBy('createdAt','desc'),fs.limit(60));
      const snap=await fs.getDocs(q);
      const items=snap.docs.map(d=>({id:d.id,...d.data()}));
      writeCache(m,items); lastSync.set(m,Date.now());
      if(activeModule===m&&dialog.open)renderList(m,visible(m,items),false);
      return items;
    }catch(e){console.warn(`Sync ${m}:`,e);return readCache(m);}
    finally{syncLocks.delete(m);}
  })();
  syncLocks.set(m,task);
  return task;
}

document.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b)return;
  const t=b.textContent.toLowerCase(); let m=null;
  if(t.includes('paquetes')||t.includes('registrar paquete'))m='packages';
  else if(t.includes('incidencia')||t.includes('casos'))m='incidents';
  else if(t.includes('reservar gazebo')||t.includes('reservaciones'))m='reservations';
  else if(t.includes('avisos')||t.includes('comunicados'))m='announcements';
  if(!m)return; e.preventDefault(); e.stopImmediatePropagation(); openModule(m);
},true);

function openModule(m){
  activeModule=m; eyebrow.textContent=isAdmin()?'Neighbor Admin':isGuard()?'Neighbor Seguridad':'Neighbor Residente'; title.textContent=labels[m]; form.onsubmit=null;
  if(!dialog.open)dialog.showModal();
  const cached=visible(m,readCache(m));
  renderList(m,cached,false);
  syncModule(m,false);
}

function renderList(m,items,syncing=false){
  if(activeModule!==m)return;
  const canCreate=m!=='announcements'||isAdmin();
  const helper=m==='announcements'?(isAdmin()?'Los avisos se distribuyen automáticamente.':'Avisos publicados por Administración.'):(isAdmin()?'Bandeja central de solicitudes.':'Tu solicitud se envía a Administración.');
  body.innerHTML=`<p class="form-message">${helper}${syncing?' · Sincronizando…':''}</p><div class="homes-toolbar"><input id="communitySearch" type="search" placeholder="Buscar">${canCreate?'<button id="communityNew" type="button" class="primary-button compact-button">+ Nuevo</button>':''}</div><div class="module-list" id="communityList">${items.length?items.map(x=>row(m,x)).join(''):'<div class="empty-state">No hay registros todavía.</div>'}</div>`;
  document.querySelector('#communityNew')?.addEventListener('click',()=>showForm(m));
  const search=document.querySelector('#communitySearch');
  if(search)search.oninput=e=>{const q=e.target.value.toLowerCase(),f=items.filter(x=>JSON.stringify(x).toLowerCase().includes(q));const list=document.querySelector('#communityList');if(list)list.innerHTML=f.length?f.map(x=>row(m,x)).join(''):'<div class="empty-state">Sin resultados.</div>';bind(m,items);};
  bind(m,items);
}
function bind(m,items){
  document.querySelectorAll('[data-community-edit]').forEach(b=>b.onclick=()=>showForm(m,items.find(x=>x.id===b.dataset.communityEdit)));
  document.querySelectorAll('[data-community-status]').forEach(b=>b.onclick=()=>changeStatus(m,b.dataset.communityStatus,b.dataset.nextStatus));
  document.querySelectorAll('[data-community-delete]').forEach(b=>b.onclick=()=>removeItem(m,b.dataset.communityDelete));
}
function row(m,x){
  if(m==='announcements'){
    const meta=[x.audience||'Todos',x.date||''].filter(Boolean).join(' · ');
    return `<article class="home-row"><div><strong>${icons[m]} ${esc(x.title||'Comunicado')}</strong><p style="white-space:pre-wrap;margin:.45rem 0 .3rem">${esc(x.message||'Sin mensaje')}</p><small>${esc(meta)}</small></div><div class="row-actions">${isAdmin()?`<button type="button" data-community-edit="${esc(x.id)}">Editar</button><button type="button" data-community-delete="${esc(x.id)}">Eliminar</button>`:''}</div></article>`;
  }
  if(m==='reservations'){
    const requester=reservationRequester(x);
    const meta=[x.homeId?`Unidad ${x.homeId}`:'',x.date||'',x.time||'',statusLabel(x.status)].filter(Boolean).join(' · ');
    const next=isAdmin()?nextStatus(m,x.status):null;
    const manage=isAdmin()||(x.createdBy===auth?.currentUser?.uid&&['pending','open'].includes(x.status));
    return `<article class="home-row"><div><strong>${icons[m]} ${esc(x.area||'Área común')}</strong><p style="margin:.4rem 0 .2rem"><b>Solicita:</b> ${esc(requester)}</p><small>${esc(meta)}</small></div><div class="row-actions">${next?`<button type="button" data-community-status="${esc(x.id)}" data-next-status="${next}">${statusAction(next)}</button>`:''}${manage?`<button type="button" data-community-edit="${esc(x.id)}">Editar</button>`:''}${isAdmin()?`<button type="button" data-community-delete="${esc(x.id)}">Eliminar</button>`:''}</div></article>`;
  }
  const cfg={packages:[x.homeId||'Sin unidad',`${x.carrier||'Paquete'} · ${statusLabel(x.status)}`],incidents:[x.category||'Incidencia',`${x.location||'Sin ubicación'} · ${statusLabel(x.status)}`]}[m];
  const next=isAdmin()?nextStatus(m,x.status):null,manage=isAdmin()||(x.createdBy===auth?.currentUser?.uid&&['pending','open'].includes(x.status));
  return `<article class="home-row"><div><strong>${icons[m]} ${esc(cfg[0])}</strong><p>${esc(cfg[1])}</p></div><div class="row-actions">${next?`<button type="button" data-community-status="${esc(x.id)}" data-next-status="${next}">${statusAction(next)}</button>`:''}${manage?`<button type="button" data-community-edit="${esc(x.id)}">Editar</button>`:''}${isAdmin()?`<button type="button" data-community-delete="${esc(x.id)}">Eliminar</button>`:''}</div></article>`;
}
function reservationRequester(x){return String(x.requesterName||x.createdByName||x.residentName||x.requestedByName||'Residente').trim()||'Residente';}
function showForm(m,x={}){
  if(m==='announcements'&&!isAdmin())return;
  title.textContent=x.id?`Editar ${labels[m].toLowerCase()}`:`Nuevo ${labels[m].toLowerCase()}`;
  body.innerHTML=fields(m,x)+`<div class="form-actions"><button id="communityCancel" type="button" class="secondary-button">Cancelar</button><button type="submit" class="primary-button">Guardar</button></div><p id="communityMessage" class="form-message"></p>`;
  document.querySelector('#communityCancel').onclick=()=>openModule(m); form.onsubmit=e=>saveForm(e,m,x.id);
}
function fields(m,x){
  if(m==='packages')return `<label>Unidad<input name="homeId" required value="${esc(x.homeId||profile.homeId||'')}"></label><label>Transportista<select name="carrier">${opts(['Amazon','USPS','UPS','FedEx','DHL','Otro'],x.carrier)}</select></label><label>Descripción<input name="description" value="${esc(x.description||'')}"></label><input type="hidden" name="status" value="${esc(x.status||'pending')}">`;
  if(m==='incidents')return `<label>Categoría<select name="category">${opts(['Alumbrado','Seguridad','Agua','Áreas comunes','Basura','Otra'],x.category)}</select></label><label>Ubicación<input name="location" required value="${esc(x.location||'')}"></label><label>Descripción<textarea name="description" required>${esc(x.description||'')}</textarea></label><label>Prioridad<select name="priority">${opts(['Baja','Media','Alta','Urgente'],x.priority||'Media')}</select></label><input type="hidden" name="status" value="${esc(x.status||'open')}">`;
  if(m==='reservations'){
    const requester=reservationRequester(x.id?x:{requesterName:profile.name||auth?.currentUser?.displayName||auth?.currentUser?.email||'Residente'});
    return `<label>Solicitante<input value="${esc(requester)}" readonly></label><input type="hidden" name="requesterName" value="${esc(requester)}"><label>Área<select name="area">${opts(['Gazebo','Cancha','Área recreativa','Salón'],x.area)}</select></label><label>Fecha<input name="date" type="date" required value="${esc(x.date||'')}"></label><label>Horario<select name="time">${opts(['9:00 AM – 1:00 PM','2:00 PM – 6:00 PM','6:00 PM – 10:00 PM'],x.time)}</select></label><label>Unidad<input name="homeId" required value="${esc(x.homeId||profile.homeId||'')}"></label><input type="hidden" name="status" value="${esc(x.status||'pending')}">`;
  }
  return `<label>Título<input name="title" required value="${esc(x.title||'')}"></label><label>Mensaje<textarea name="message" required>${esc(x.message||'')}</textarea></label><label>Audiencia<select name="audience">${opts(['Todos','Residentes','Seguridad','Junta'],x.audience||'Todos')}</select></label><label>Fecha<input name="date" type="date" value="${esc(x.date||new Date().toISOString().slice(0,10))}"></label>`;
}
async function saveForm(e,m,id){e.preventDefault();const msg=document.querySelector('#communityMessage'),data=Object.fromEntries(new FormData(form).entries());if(msg)msg.textContent='Guardando…';try{await save(m,id,data);openModule(m);}catch(err){if(msg)msg.textContent=err.message||'No se pudo guardar.';}}
async function save(m,id,data){
  const existing=id?readCache(m).find(x=>x.id===id):null;
  const normalized={...data,homeId:String(data.homeId||'').toUpperCase(),destination:m==='announcements'?data.audience:'Administración',createdRole:existing?.createdRole||profile.role||'resident'};
  if(m==='reservations')normalized.requesterName=String(data.requesterName||existing?.requesterName||existing?.createdByName||profile.name||auth?.currentUser?.displayName||auth?.currentUser?.email||'Residente').trim();
  if(ready&&auth?.currentUser){
    const fs=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    const payload={...normalized,updatedAt:fs.serverTimestamp(),updatedBy:auth.currentUser.uid};
    if(id)await fs.setDoc(fs.doc(db,...root(),m,id),payload,{merge:true});
    else await fs.addDoc(fs.collection(db,...root(),m),{...payload,createdAt:fs.serverTimestamp(),createdBy:auth.currentUser.uid,createdByName:normalized.requesterName||profile.name||auth.currentUser.displayName||auth.currentUser.email||''});
  }else{
    const a=readCache(m),r={...normalized,id:id||crypto.randomUUID(),createdBy:existing?.createdBy||'local-user',createdByName:existing?.createdByName||normalized.requesterName||profile.name||'Residente',createdAt:existing?.createdAt||new Date().toISOString()},n=id?a.map(x=>x.id===id?{...x,...r}:x):[r,...a];writeCache(m,n);
  }
  await syncModule(m,true);
}
async function changeStatus(m,id,status){if(!isAdmin())return;const x=readCache(m).find(x=>x.id===id);if(x)await save(m,id,{...x,status});}
async function removeItem(m,id){if(!isAdmin()||!confirm('¿Eliminar este registro?'))return;if(ready&&auth?.currentUser){const fs=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');await fs.deleteDoc(fs.doc(db,...root(),m,id));}else writeCache(m,readCache(m).filter(x=>x.id!==id));await syncModule(m,true);openModule(m);}
function opts(a,c){return a.map(v=>`<option value="${esc(v)}" ${v===c?'selected':''}>${esc(v)}</option>`).join('');}
function statusLabel(s){return ({pending:'Pendiente',delivered:'Entregado',returned:'Devuelto',open:'Abierta','in-progress':'En progreso',resolved:'Resuelta',closed:'Cerrada',approved:'Aprobada',rejected:'Rechazada',cancelled:'Cancelada'})[s]||s||'Pendiente';}
function nextStatus(m,s){if(m==='packages')return s==='pending'?'delivered':null;if(m==='incidents')return s==='open'?'in-progress':s==='in-progress'?'resolved':null;if(m==='reservations')return s==='pending'?'approved':null;return null;}
function statusAction(s){return ({delivered:'Entregar','in-progress':'Atender',resolved:'Resolver',approved:'Aprobar'})[s]||'Actualizar';}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

const dialog = document.querySelector('#featureDialog');
const title = document.querySelector('#dialogTitle');
const eyebrow = document.querySelector('#dialogEyebrow');
const body = document.querySelector('#dialogBody');
const form = document.querySelector('#dialogForm');

let app, auth, db;
let firebaseReady = false;
const root = () => ['apps', APP_NAMESPACE, 'communities', COMMUNITY_ID];

init();

async function init(){
  try{
    const appMod = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const fs = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
    auth = authMod.getAuth(app);
    db = fs.getFirestore(app);
    firebaseReady = true;
  }catch(error){ console.warn('Módulos comunitarios en modo local.', error); }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if(!button) return;
  const text = button.textContent.toLowerCase();
  let module = null;
  if(text.includes('paquetes') || text.includes('registrar paquete')) module = 'packages';
  else if(text.includes('incidencia') || text.includes('casos')) module = 'incidents';
  else if(text.includes('reservar gazebo') || text.includes('reservaciones')) module = 'reservations';
  else if(text.includes('avisos') || text.includes('comunicados')) module = 'announcements';
  if(!module) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await openModule(module);
}, true);

async function openModule(module){
  eyebrow.textContent = 'Neighbor';
  title.textContent = labels[module];
  body.innerHTML = '<div class="empty-state">Cargando…</div>';
  form.onsubmit = null;
  dialog.showModal();
  const items = await list(module);
  renderList(module, items);
}

const labels = { packages:'Paquetes', incidents:'Incidencias', reservations:'Reservaciones', announcements:'Comunicados' };
const icons = { packages:'📦', incidents:'🛠️', reservations:'📅', announcements:'📢' };

function renderList(module, items){
  title.textContent = labels[module];
  body.innerHTML = `
    <div class="homes-toolbar">
      <input id="communitySearch" type="search" placeholder="Buscar">
      <button id="communityNew" type="button" class="primary-button compact-button">+ Nuevo</button>
    </div>
    <div class="module-list" id="communityList">${items.length ? items.map(item => row(module,item)).join('') : '<div class="empty-state">No hay registros todavía.</div>'}</div>`;
  document.querySelector('#communityNew').onclick = () => showForm(module);
  document.querySelector('#communitySearch').oninput = e => {
    const q = e.target.value.toLowerCase();
    const filtered = items.filter(i => JSON.stringify(i).toLowerCase().includes(q));
    document.querySelector('#communityList').innerHTML = filtered.length ? filtered.map(i=>row(module,i)).join('') : '<div class="empty-state">Sin resultados.</div>';
    bindRows(module, items);
  };
  bindRows(module, items);
}

function bindRows(module, items){
  document.querySelectorAll('[data-community-edit]').forEach(b=>b.onclick=()=>showForm(module,items.find(i=>i.id===b.dataset.communityEdit)));
  document.querySelectorAll('[data-community-status]').forEach(b=>b.onclick=()=>changeStatus(module,b.dataset.communityStatus,b.dataset.nextStatus));
  document.querySelectorAll('[data-community-delete]').forEach(b=>b.onclick=()=>removeItem(module,b.dataset.communityDelete));
}

function row(module,item){
  const config = {
    packages:[item.homeId || 'Sin unidad', `${item.carrier || 'Paquete'} · ${statusLabel(item.status)}`],
    incidents:[item.category || 'Incidencia', `${item.location || 'Sin ubicación'} · ${statusLabel(item.status)}`],
    reservations:[item.area || 'Área común', `${item.date || ''} ${item.time || ''} · ${statusLabel(item.status)}`],
    announcements:[item.title || 'Comunicado', `${item.audience || 'Todos'} · ${item.date || ''}`]
  }[module];
  const next = nextStatus(module,item.status);
  return `<article class="home-row"><div><strong>${icons[module]} ${esc(config[0])}</strong><p>${esc(config[1])}</p></div><div class="row-actions">
    ${next ? `<button type="button" data-community-status="${esc(item.id)}" data-next-status="${next}">${statusAction(next)}</button>`:''}
    <button type="button" data-community-edit="${esc(item.id)}">Editar</button>
    <button type="button" data-community-delete="${esc(item.id)}">Eliminar</button>
  </div></article>`;
}

function showForm(module,item={}){
  title.textContent = item.id ? `Editar ${labels[module].toLowerCase()}` : `Nuevo ${labels[module].toLowerCase()}`;
  body.innerHTML = fields(module,item) + `<div class="form-actions"><button id="communityCancel" type="button" class="secondary-button">Cancelar</button><button type="submit" class="primary-button">Guardar</button></div><p id="communityMessage" class="form-message"></p>`;
  document.querySelector('#communityCancel').onclick = () => openModule(module);
  form.onsubmit = e => saveForm(e,module,item.id);
}

function fields(module,i){
  if(module==='packages') return `
    <label>Unidad<input name="homeId" required value="${esc(i.homeId||'')}" placeholder="Ej. A-12"></label>
    <label>Transportista<select name="carrier">${opts(['Amazon','USPS','UPS','FedEx','DHL','Otro'],i.carrier)}</select></label>
    <label>Descripción<input name="description" value="${esc(i.description||'')}" placeholder="Caja, sobre, tamaño"></label>
    <label>Estado<select name="status">${opts(['pending','delivered','returned'],i.status||'pending',statusLabel)}</select></label>`;
  if(module==='incidents') return `
    <label>Categoría<select name="category">${opts(['Alumbrado','Seguridad','Agua','Áreas comunes','Basura','Otra'],i.category)}</select></label>
    <label>Ubicación<input name="location" required value="${esc(i.location||'')}"></label>
    <label>Descripción<textarea name="description" required>${esc(i.description||'')}</textarea></label>
    <label>Prioridad<select name="priority">${opts(['Baja','Media','Alta','Urgente'],i.priority||'Media')}</select></label>
    <label>Estado<select name="status">${opts(['open','in-progress','resolved','closed'],i.status||'open',statusLabel)}</select></label>`;
  if(module==='reservations') return `
    <label>Área<select name="area">${opts(['Gazebo','Cancha','Área recreativa','Salón'],i.area)}</select></label>
    <label>Fecha<input name="date" type="date" required value="${esc(i.date||'')}"></label>
    <label>Horario<select name="time">${opts(['9:00 AM – 1:00 PM','2:00 PM – 6:00 PM','6:00 PM – 10:00 PM'],i.time)}</select></label>
    <label>Unidad<input name="homeId" required value="${esc(i.homeId||'')}"></label>
    <label>Estado<select name="status">${opts(['pending','approved','rejected','cancelled'],i.status||'pending',statusLabel)}</select></label>`;
  return `
    <label>Título<input name="title" required value="${esc(i.title||'')}"></label>
    <label>Mensaje<textarea name="message" required>${esc(i.message||'')}</textarea></label>
    <label>Audiencia<select name="audience">${opts(['Todos','Residentes','Seguridad','Junta'],i.audience||'Todos')}</select></label>
    <label>Fecha<input name="date" type="date" value="${esc(i.date||new Date().toISOString().slice(0,10))}"></label>`;
}

async function saveForm(event,module,id){
  event.preventDefault();
  const message = document.querySelector('#communityMessage');
  message.textContent = 'Guardando…';
  const data = Object.fromEntries(new FormData(form).entries());
  try{
    await save(module,id,data);
    await audit(`${labels[module]} actualizado`, `${icons[module]} ${data.homeId||data.title||data.category||data.area||''}`);
    await openModule(module);
  }catch(error){ message.textContent = error.message || 'No se pudo guardar.'; }
}

async function changeStatus(module,id,status){
  const item = (await list(module)).find(x=>x.id===id); if(!item) return;
  await save(module,id,{...item,status});
  await openModule(module);
}

async function removeItem(module,id){
  if(!confirm('¿Eliminar este registro?')) return;
  if(firebaseReady && auth?.currentUser){
    const {deleteDoc,doc}=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    await deleteDoc(doc(db,...root(),module,id));
  }else{
    localStorage.setItem(localKey(module),JSON.stringify((await list(module)).filter(x=>x.id!==id)));
  }
  await openModule(module);
}

async function list(module){
  if(firebaseReady && auth?.currentUser){
    try{
      const {collection,getDocs,query,orderBy}=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
      const snap=await getDocs(query(collection(db,...root(),module),orderBy('createdAt','desc')));
      return snap.docs.map(d=>({id:d.id,...d.data()}));
    }catch{
      const {collection,getDocs}=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
      const snap=await getDocs(collection(db,...root(),module));
      return snap.docs.map(d=>({id:d.id,...d.data()}));
    }
  }
  try{return JSON.parse(localStorage.getItem(localKey(module)))||[];}catch{return[];}
}

async function save(module,id,data){
  const normalized={...data,homeId:String(data.homeId||'').toUpperCase(),updatedAt:new Date().toISOString()};
  if(firebaseReady && auth?.currentUser){
    const {addDoc,collection,doc,setDoc,serverTimestamp}=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    const payload={...normalized,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid};
    if(id) await setDoc(doc(db,...root(),module,id),payload,{merge:true});
    else await addDoc(collection(db,...root(),module),{...payload,createdAt:serverTimestamp(),createdBy:auth.currentUser.uid});
  }else{
    const items=await list(module); const record={...normalized,id:id||crypto.randomUUID(),createdAt:new Date().toISOString()};
    const next=id?items.map(x=>x.id===id?{...x,...record}:x):[record,...items];
    localStorage.setItem(localKey(module),JSON.stringify(next));
  }
}

async function audit(titleText,detail){
  if(!firebaseReady||!auth?.currentUser) return;
  const {addDoc,collection,serverTimestamp}=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  await addDoc(collection(db,...root(),'activity'),{title:titleText,detail,icon:'✅',type:'module-update',userId:auth.currentUser.uid,communityId:COMMUNITY_ID,createdAt:serverTimestamp()});
}

function localKey(m){return `neighbor-${COMMUNITY_ID}-${m}`;}
function opts(values,current,map=x=>x){return values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(map(v))}</option>`).join('');}
function statusLabel(s){return ({pending:'Pendiente',delivered:'Entregado',returned:'Devuelto',open:'Abierta','in-progress':'En progreso',resolved:'Resuelta',closed:'Cerrada',approved:'Aprobada',rejected:'Rechazada',cancelled:'Cancelada'})[s]||s||'Pendiente';}
function nextStatus(module,s){if(module==='packages')return s==='pending'?'delivered':null;if(module==='incidents')return s==='open'?'in-progress':s==='in-progress'?'resolved':null;if(module==='reservations')return s==='pending'?'approved':null;return null;}
function statusAction(s){return ({delivered:'Entregar','in-progress':'Atender',resolved:'Resolver',approved:'Aprobar'})[s]||'Actualizar';}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

const dialog=document.querySelector('#featureDialog');
const title=document.querySelector('#dialogTitle');
const eyebrow=document.querySelector('#dialogEyebrow');
const body=document.querySelector('#dialogBody');
const form=document.querySelector('#dialogForm');
let auth=null,db=null,fs=null,profile=null,ready=false;
let historyUnsubscribe=null;
const root=()=>['apps',APP_NAMESPACE,'communities',COMMUNITY_ID];

initialize();

document.addEventListener('click',event=>{
  const button=event.target.closest('.action-card,.nav-item');
  if(!button||!isGuard())return;
  const module=button.dataset.module||button.dataset.route||'';
  const text=button.textContent.toLowerCase();
  let target=null;
  if(module==='scan'||text.includes('escanear qr'))target='scan';
  else if(module==='entry'||text.includes('registrar entrada'))target='entry';
  else if(module==='directory'||text.includes('buscar residencia'))target='directory';
  else if(module==='history'||text.includes('historial de turno'))target='history';
  if(!target)return;
  event.preventDefault();event.stopImmediatePropagation();stopHistoryListener();
  if(target==='scan')openValidator();
  if(target==='entry')openManualEntry();
  if(target==='directory')openDirectory();
  if(target==='history')openHistory();
},true);

dialog?.addEventListener('close',stopHistoryListener);

async function initialize(){
  try{
    const appMod=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authMod=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    fs=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    const app=appMod.getApps().length?appMod.getApp():appMod.initializeApp(firebaseConfig);
    auth=authMod.getAuth(app);db=fs.getFirestore(app);ready=true;
    authMod.onAuthStateChanged(auth,async user=>{
      profile=null;if(!user)return;
      try{const snap=await fs.getDoc(fs.doc(db,...root(),'users',user.uid));profile=snap.exists()?{uid:user.uid,...snap.data()}:{uid:user.uid,role:'resident'};}catch(error){console.warn('Perfil Guard:',error);}
    });
  }catch(error){console.warn('Neighbor Guard sin conexión.',error);}
}

function isGuard(){return profile?.role==='guard'||document.querySelector('#roleBadge')?.textContent?.toLowerCase().includes('guard');}
function guardName(){return profile?.name||auth?.currentUser?.displayName||auth?.currentUser?.email||'Seguridad';}
function openDialog(section,heading){eyebrow.textContent=section;title.textContent=heading;form.onsubmit=null;if(!dialog.open)dialog.showModal();}
function requireGuard(){if(!ready||!auth?.currentUser)throw new Error('No hay conexión con Firebase.');if(!isGuard())throw new Error('Esta función requiere un usuario de Seguridad activo.');}

function openValidator(){
  openDialog('Neighbor Guard','Validar acceso');
  body.innerHTML=`<div class="scanner-demo"><span>▣</span><strong>Validar pase</strong><p>Escribe el código de 6 dígitos o pega el contenido del QR.</p></div><label>Código o QR<input id="guardCode" autocomplete="off" inputmode="numeric" placeholder="123456"></label><button id="guardValidate" type="button" class="primary-button">Validar acceso</button><div id="guardResult" style="margin-top:14px"></div>`;
  const input=document.querySelector('#guardCode');
  document.querySelector('#guardValidate').onclick=()=>validateAccess(input.value);
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();validateAccess(e.currentTarget.value);}});
  setTimeout(()=>input.focus(),50);
}

async function validateAccess(value){
  const output=document.querySelector('#guardResult');
  const input=String(value||'').trim();
  if(!input){output.innerHTML='<p class="form-message">Escribe un código o pega el QR.</p>';return;}
  try{requireGuard();}catch(error){output.innerHTML=`<p class="form-message">${esc(error.message)}</p>`;return;}
  output.innerHTML='<div class="empty-state">Validando…</div>';
  try{
    let visit=null,tokenValid=true;
    const parsed=parsePassPayload(input);
    if(parsed?.visitId){
      const snap=await fs.getDoc(fs.doc(db,...root(),'visits',parsed.visitId));
      if(snap.exists()){
        const data=snap.data();
        tokenValid=!data.token||Boolean(parsed.token&&parsed.token===data.token);
        if(tokenValid)visit={id:snap.id,...data};
      }
    }else if(/^\d{6}$/.test(input)){
      const snap=await fs.getDocs(fs.query(fs.collection(db,...root(),'visits'),fs.where('code','==',input),fs.limit(2)));
      if(snap.size===1)visit={id:snap.docs[0].id,...snap.docs[0].data()};
      if(snap.size>1)throw new Error('Código duplicado. Valida con QR o contacta Administración.');
    }else throw new Error('El código debe tener 6 dígitos o ser un QR válido de Neighbor.');
    if(!tokenValid){await logDenied(null,'QR con token inválido');throw new Error('QR inválido o alterado.');}
    if(!visit){await logDenied(null,'Pase no encontrado');renderValidation(null);return;}
    renderValidation(visit);
  }catch(error){output.innerHTML=`<p class="form-message">${esc(cleanError(error))}</p>`;}
}

function parsePassPayload(input){
  try{return JSON.parse(input);}catch{}
  try{const url=new URL(input);const raw=url.searchParams.get('pass')||url.searchParams.get('data');return raw?JSON.parse(decodeURIComponent(raw)):null;}catch{return null;}
}

function renderValidation(visit){
  const output=document.querySelector('#guardResult');
  if(!visit){output.innerHTML='<article><strong>⛔ Pase no encontrado</strong><p>Verifica el código con el residente.</p></article>';return;}
  const check=evaluateVisit(visit);
  output.innerHTML=`<article class="home-row"><div><strong>${check.allowed?'✅':'⛔'} ${esc(visit.visitorName||'Visitante')}</strong><p>Unidad ${esc(visit.homeId||'')} · ${esc(visit.visitType||'Visita')} · ${esc(visit.plate||'Sin tablilla')}<br>${esc(check.label)} · Expira ${esc(formatDate(visit.expiresAt))}</p></div></article>${check.allowed?`<button type="button" id="guardState" class="primary-button">${visit.status==='active'?'Registrar salida':'Registrar entrada'}</button>`:`<p class="form-message">${esc(check.reason)}</p>`}`;
  document.querySelector('#guardState')?.addEventListener('click',()=>changeAccessState(visit,visit.status==='active'?'completed':'active',visit.status==='active'?'exit':'entry'));
  if(!check.allowed)logDenied(visit,check.reason).catch(()=>{});
}

function evaluateVisit(visit){
  const now=Date.now(),expires=dateMs(visit.expiresAt),starts=dateMs(visit.startsAt),status=String(visit.status||'pending');
  if(status==='revoked')return{allowed:false,label:'Revocada',reason:'Esta autorización fue revocada.'};
  if(status==='completed')return{allowed:false,label:'Salida registrada',reason:'Esta visita ya completó su entrada y salida.'};
  if(expires&&expires<now)return{allowed:false,label:'Expirada',reason:'La autorización ya expiró.'};
  if(starts&&starts>now+15*60*1000)return{allowed:false,label:'Aún no válida',reason:`La visita comienza ${formatDate(visit.startsAt)}.`};
  return{allowed:true,label:status==='active'?'Dentro':'Autorizada',reason:''};
}

async function changeAccessState(visit,status,eventType){
  try{
    requireGuard();
    const fresh=await fs.getDoc(fs.doc(db,...root(),'visits',visit.id));
    if(!fresh.exists())throw new Error('La visita ya no existe.');
    const current={id:fresh.id,...fresh.data()},check=evaluateVisit(current);
    if(eventType==='entry'&&!check.allowed)throw new Error(check.reason||'La visita no está disponible.');
    if(eventType==='exit'&&current.status!=='active')throw new Error('La visita no figura como dentro de la comunidad.');
    await fs.updateDoc(fresh.ref,{status,updatedBy:auth.currentUser.uid,updatedAt:fs.serverTimestamp(),...(eventType==='entry'?{enteredAt:fs.serverTimestamp()}:{exitedAt:fs.serverTimestamp()})});
    await writeAccessLog(eventType,current);
    visit.status=status;renderValidation(visit);
    window.dispatchEvent(new CustomEvent('neighbor:guard-access',{detail:{eventType,visitId:visit.id}}));
  }catch(error){alert(cleanError(error));}
}

async function writeAccessLog(eventType,visit,extra={}){
  return fs.addDoc(fs.collection(db,...root(),'accessLogs'),{eventType,visitId:visit?.id||'',visitorName:visit?.visitorName||'',homeId:visit?.homeId||'',plate:visit?.plate||'',guardId:auth.currentUser.uid,guardName:guardName(),createdAt:fs.serverTimestamp(),...extra});
}
async function logDenied(visit,reason){try{requireGuard();await writeAccessLog('denied',visit,{reason:String(reason||'Acceso denegado')});}catch{}}

function openManualEntry(){
  openDialog('Neighbor Guard','Registrar entrada sin QR');
  body.innerHTML=`<label>Nombre del visitante<input name="visitorName" required></label><div class="form-grid"><label>Residencia<input name="homeId" required placeholder="A-12"></label><label>Tablilla<input name="plate"></label></div><label>Motivo<select name="visitType"><option>Familiar</option><option>Amigo</option><option>Delivery</option><option>Técnico</option><option>Contratista</option><option>Otro</option></select></label><label>Observación<input name="note"></label><button class="primary-button" type="submit">Registrar entrada</button><p id="guardEntryMessage" class="form-message"></p>`;
  form.onsubmit=saveManualEntry;
}

async function saveManualEntry(event){
  event.preventDefault();const msg=document.querySelector('#guardEntryMessage'),data=Object.fromEntries(new FormData(form).entries());
  try{requireGuard();}catch(error){msg.textContent=error.message;return;}
  const visitorName=String(data.visitorName||'').trim(),homeId=String(data.homeId||'').trim().toUpperCase();
  if(!visitorName||!homeId){msg.textContent='Nombre y residencia son requeridos.';return;}
  msg.textContent='Validando residencia…';
  try{
    if(!(await residenceExists(homeId)))throw new Error(`No se encontró la residencia ${homeId}. Verifica antes de autorizar.`);
    msg.textContent='Registrando…';
    const payload={visitorName,homeId,plate:String(data.plate||'').trim().toUpperCase(),visitType:data.visitType||'Otro',note:String(data.note||'').trim(),status:'active',manualEntry:true,createdBy:auth.currentUser.uid,createdByName:guardName(),createdAt:fs.serverTimestamp(),updatedAt:fs.serverTimestamp(),enteredAt:fs.serverTimestamp()};
    const ref=await fs.addDoc(fs.collection(db,...root(),'visits'),payload);
    await writeAccessLog('entry',{id:ref.id,...payload},{manualEntry:true});
    msg.textContent='Entrada registrada correctamente.';setTimeout(openHistory,350);
  }catch(error){msg.textContent=cleanError(error);}
}

async function residenceExists(homeId){
  const direct=await fs.getDoc(fs.doc(db,...root(),'homes',homeId)).catch(()=>null);if(direct?.exists())return true;
  const snap=await fs.getDocs(fs.query(fs.collection(db,...root(),'homes'),fs.where('unit','==',homeId),fs.limit(1))).catch(()=>null);return Boolean(snap&&!snap.empty);
}

function openDirectory(){
  openDialog('Neighbor Guard','Directorio de residencias');
  body.innerHTML='<div class="homes-toolbar"><input id="guardDirectorySearch" type="search" placeholder="Unidad, residente o tablilla"></div><div id="guardDirectoryResults" class="module-list"><div class="empty-state">Escribe para buscar.</div></div>';
  const input=document.querySelector('#guardDirectorySearch');let timer=null;input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>searchDirectory(input.value),180);};setTimeout(()=>input.focus(),50);
}

async function searchDirectory(value){
  const out=document.querySelector('#guardDirectoryResults'),q=String(value||'').trim().toLowerCase();if(!out)return;
  if(q.length<2){out.innerHTML='<div class="empty-state">Escribe al menos 2 caracteres.</div>';return;}
  try{
    requireGuard();out.innerHTML='<div class="empty-state">Buscando…</div>';
    const [residents,homes,vehicles]=await Promise.all(['residents','homes','vehicles'].map(async name=>{const snap=await fs.getDocs(fs.query(fs.collection(db,...root(),name),fs.limit(200)));return snap.docs.map(d=>({id:d.id,...d.data()}));}));
    const rows=[];
    residents.filter(x=>`${x.name||''} ${x.homeId||''}`.toLowerCase().includes(q)).slice(0,10).forEach(x=>rows.push(`<article><strong>👤 ${esc(x.name||'Residente')}</strong><p>Unidad ${esc(x.homeId||'')} · ${esc(x.status||'active')}</p></article>`));
    homes.filter(x=>`${x.unit||x.id||''} ${x.ownerName||''}`.toLowerCase().includes(q)).slice(0,10).forEach(x=>rows.push(`<article><strong>🏠 Unidad ${esc(x.unit||x.id)}</strong><p>${esc(x.ownerName||'Sin propietario')} · ${esc(x.status||'active')}</p></article>`));
    vehicles.filter(x=>`${x.plate||x.id||''} ${x.homeId||''} ${x.residentName||''}`.toLowerCase().includes(q)).slice(0,10).forEach(x=>rows.push(`<article><strong>🚙 ${esc(x.plate||x.id)}</strong><p>Unidad ${esc(x.homeId||'')} · ${esc([x.make,x.model,x.color].filter(Boolean).join(' '))}</p></article>`));
    out.innerHTML=rows.length?rows.join(''):'<div class="empty-state">No se encontraron resultados.</div>';
  }catch(error){out.innerHTML=`<p class="form-message">${esc(cleanError(error))}</p>`;}
}

async function openHistory(){
  openDialog('Neighbor Guard','Historial de turno');body.innerHTML='<div class="empty-state">Cargando actividad…</div>';
  try{
    requireGuard();
    const query=fs.query(fs.collection(db,...root(),'accessLogs'),fs.orderBy('createdAt','desc'),fs.limit(100));
    stopHistoryListener();
    historyUnsubscribe=fs.onSnapshot(query,snap=>renderHistory(snap.docs.map(d=>({id:d.id,...d.data()}))),error=>{body.innerHTML=`<p class="form-message">${esc(cleanError(error))}</p>`;});
  }catch(error){body.innerHTML=`<p class="form-message">${esc(cleanError(error))}</p>`;}
}

function renderHistory(items){
  if(!dialog.open||!title.textContent.toLowerCase().includes('historial'))return;
  items.sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt));
  const today=new Date().toDateString(),todayItems=items.filter(x=>toDate(x.createdAt)?.toDateString()===today);
  const mine=todayItems.filter(x=>x.guardId===auth?.currentUser?.uid);
  const entries=mine.filter(x=>x.eventType==='entry').length,exits=mine.filter(x=>x.eventType==='exit').length,denied=mine.filter(x=>x.eventType==='denied').length;
  body.innerHTML=`<div class="metric-grid"><div><span>Entradas hoy</span><strong>${entries}</strong></div><div><span>Salidas hoy</span><strong>${exits}</strong></div><div><span>Denegados</span><strong>${denied}</strong></div><div><span>Movimientos</span><strong>${mine.length}</strong></div></div><p class="eyebrow">Actividad de ${esc(guardName())}</p><div class="module-list">${mine.length?mine.map(logRow).join(''):'<div class="empty-state">No hay movimientos tuyos hoy.</div>'}</div><details style="margin-top:14px"><summary>Ver actividad general de hoy (${todayItems.length})</summary><div class="module-list" style="margin-top:10px">${todayItems.length?todayItems.map(logRow).join(''):'<div class="empty-state">Sin actividad.</div>'}</div></details>`;
}

function logRow(item){const cfg=item.eventType==='entry'?['➡️','Entrada']:item.eventType==='exit'?['⬅️','Salida']:['⛔','Denegado'];return `<article><strong>${cfg[0]} ${cfg[1]} · ${esc(item.visitorName||'Visitante')}</strong><p>Unidad ${esc(item.homeId||'')} ${item.plate?`· ${esc(item.plate)}`:''} · ${esc(formatDate(item.createdAt))}</p>${item.reason?`<small>${esc(item.reason)}</small>`:`<small>${esc(item.guardName||'Seguridad')}</small>`}</article>`;}
function stopHistoryListener(){if(historyUnsubscribe){historyUnsubscribe();historyUnsubscribe=null;}}
function toDate(value){if(!value)return null;if(typeof value.toDate==='function')return value.toDate();const d=new Date(value);return Number.isNaN(d.getTime())?null:d;}
function dateMs(value){return toDate(value)?.getTime()||0;}
function formatDate(value){const d=toDate(value);return d?new Intl.DateTimeFormat('es-PR',{dateStyle:'short',timeStyle:'short'}).format(d):'Sin fecha';}
function cleanError(error){const code=String(error?.code||'');if(code.includes('permission-denied'))return'No tienes permiso para esta operación. Verifica que el usuario tenga rol Seguridad activo.';if(code.includes('unavailable'))return'Firebase no está disponible ahora.';if(code.includes('failed-precondition'))return'Firebase necesita terminar de preparar esta consulta.';return String(error?.message||'No se pudo completar la operación.').replace(/^FirebaseError:\s*/i,'');}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

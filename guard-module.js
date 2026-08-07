import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

const dialog=document.querySelector('#featureDialog');
const title=document.querySelector('#dialogTitle');
const eyebrow=document.querySelector('#dialogEyebrow');
const body=document.querySelector('#dialogBody');
const form=document.querySelector('#dialogForm');
let auth=null,db=null,fs=null,profile=null,ready=false;
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
  event.preventDefault();event.stopImmediatePropagation();
  if(target==='scan')openValidator();
  if(target==='entry')openManualEntry();
  if(target==='directory')openDirectory();
  if(target==='history')openHistory();
},true);

async function initialize(){
  try{
    const appMod=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authMod=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    fs=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    const app=appMod.getApps().length?appMod.getApp():appMod.initializeApp(firebaseConfig);
    auth=authMod.getAuth(app);db=fs.getFirestore(app);ready=true;
    authMod.onAuthStateChanged(auth,async user=>{
      profile=null;if(!user)return;
      try{const snap=await fs.getDoc(fs.doc(db,...root(),'users',user.uid));profile=snap.exists()?{uid:user.uid,...snap.data()}:{uid:user.uid,role:'resident'};}catch{}
    });
  }catch(error){console.warn('Neighbor Guard sin conexión.',error);}
}

function isGuard(){return profile?.role==='guard'||document.querySelector('#roleBadge')?.textContent?.toLowerCase().includes('guard');}
function guardName(){return profile?.name||auth?.currentUser?.displayName||auth?.currentUser?.email||'Seguridad';}
function openDialog(section,heading){eyebrow.textContent=section;title.textContent=heading;form.onsubmit=null;if(!dialog.open)dialog.showModal();}

function openValidator(){
  openDialog('Neighbor Guard','Validar acceso');
  body.innerHTML=`<div class="scanner-demo"><span>▣</span><strong>Validar pase</strong><p>Escribe el código de 6 dígitos o pega el contenido del QR.</p></div><label>Código o QR<input id="guardCode" autocomplete="off" placeholder="123456"></label><button id="guardValidate" type="button" class="primary-button">Validar acceso</button><div id="guardResult" style="margin-top:14px"></div>`;
  document.querySelector('#guardValidate').onclick=()=>validateAccess(document.querySelector('#guardCode').value);
  document.querySelector('#guardCode').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();validateAccess(e.currentTarget.value);}});
}

async function validateAccess(value){
  const output=document.querySelector('#guardResult');
  const input=String(value||'').trim();
  if(!input){output.innerHTML='<p class="form-message">Escribe un código.</p>';return;}
  if(!ready||!auth?.currentUser){output.innerHTML='<p class="form-message">No hay conexión con Firebase.</p>';return;}
  output.innerHTML='<div class="empty-state">Validando…</div>';
  try{
    let visit=null;
    try{
      const parsed=JSON.parse(input);
      if(parsed.visitId){const snap=await fs.getDoc(fs.doc(db,...root(),'visits',parsed.visitId));if(snap.exists()){const data=snap.data();if(!parsed.token||!data.token||parsed.token===data.token)visit={id:snap.id,...data};}}
    }catch{}
    if(!visit){const snap=await fs.getDocs(fs.query(fs.collection(db,...root(),'visits'),fs.where('code','==',input),fs.limit(1)));if(!snap.empty)visit={id:snap.docs[0].id,...snap.docs[0].data()};}
    renderValidation(visit);
  }catch(error){output.innerHTML=`<p class="form-message">${esc(cleanError(error))}</p>`;}
}

function renderValidation(visit){
  const output=document.querySelector('#guardResult');
  if(!visit){output.innerHTML='<article><strong>⛔ Pase no encontrado</strong><p>Verifica el código con el residente.</p></article>';return;}
  const now=Date.now(),expires=dateMs(visit.expiresAt),starts=dateMs(visit.startsAt);
  const expired=expires&&expires<now,tooEarly=starts&&starts>now+15*60*1000,revoked=visit.status==='revoked',completed=visit.status==='completed';
  const allowed=!expired&&!tooEarly&&!revoked&&!completed;
  const status=visit.status==='active'?'Dentro':completed?'Salió':revoked?'Revocada':'Autorizada';
  output.innerHTML=`<article class="home-row"><div><strong>${allowed?'✅':'⛔'} ${esc(visit.visitorName||'Visitante')}</strong><p>Unidad ${esc(visit.homeId||'')} · ${esc(visit.visitType||'Visita')} · ${esc(visit.plate||'Sin tablilla')}<br>${esc(status)} · ${esc(formatDate(visit.expiresAt))}</p></div></article>${allowed?`<button type="button" id="guardState" class="primary-button">${visit.status==='active'?'Registrar salida':'Registrar entrada'}</button>`:`<p class="form-message">Acceso no disponible.</p>`}`;
  document.querySelector('#guardState')?.addEventListener('click',()=>changeAccessState(visit,visit.status==='active'?'completed':'active',visit.status==='active'?'exit':'entry'));
}

async function changeAccessState(visit,status,eventType){
  try{
    await fs.updateDoc(fs.doc(db,...root(),'visits',visit.id),{status,updatedBy:auth.currentUser.uid,updatedAt:fs.serverTimestamp()});
    await fs.addDoc(fs.collection(db,...root(),'accessLogs'),{eventType,visitId:visit.id,visitorName:visit.visitorName||'',homeId:visit.homeId||'',plate:visit.plate||'',guardId:auth.currentUser.uid,guardName:guardName(),createdAt:fs.serverTimestamp()});
    visit.status=status;renderValidation(visit);
  }catch(error){alert(cleanError(error));}
}

function openManualEntry(){
  openDialog('Neighbor Guard','Registrar entrada sin QR');
  body.innerHTML=`<label>Nombre del visitante<input name="visitorName" required></label><div class="form-grid"><label>Residencia<input name="homeId" required placeholder="A-12"></label><label>Tablilla<input name="plate"></label></div><label>Motivo<select name="visitType"><option>Familiar</option><option>Amigo</option><option>Delivery</option><option>Técnico</option><option>Contratista</option><option>Otro</option></select></label><label>Observación<input name="note"></label><button class="primary-button" type="submit">Registrar entrada</button><p id="guardEntryMessage" class="form-message"></p>`;
  form.onsubmit=saveManualEntry;
}

async function saveManualEntry(event){
  event.preventDefault();const msg=document.querySelector('#guardEntryMessage'),data=Object.fromEntries(new FormData(form).entries());
  if(!ready||!auth?.currentUser){msg.textContent='No hay conexión con Firebase.';return;}msg.textContent='Registrando…';
  try{
    const payload={visitorName:String(data.visitorName||'').trim(),homeId:String(data.homeId||'').trim().toUpperCase(),plate:String(data.plate||'').trim().toUpperCase(),visitType:data.visitType||'Otro',note:String(data.note||'').trim(),status:'active',manualEntry:true,createdBy:auth.currentUser.uid,createdAt:fs.serverTimestamp(),updatedAt:fs.serverTimestamp()};
    const ref=await fs.addDoc(fs.collection(db,...root(),'visits'),payload);
    await fs.addDoc(fs.collection(db,...root(),'accessLogs'),{eventType:'entry',visitId:ref.id,visitorName:payload.visitorName,homeId:payload.homeId,plate:payload.plate,guardId:auth.currentUser.uid,guardName:guardName(),manualEntry:true,createdAt:fs.serverTimestamp()});
    msg.textContent='Entrada registrada.';setTimeout(openHistory,300);
  }catch(error){msg.textContent=cleanError(error);}
}

function openDirectory(){
  openDialog('Neighbor Guard','Directorio de residencias');
  body.innerHTML='<div class="homes-toolbar"><input id="guardDirectorySearch" type="search" placeholder="Unidad, residente o tablilla"></div><div id="guardDirectoryResults" class="module-list"><div class="empty-state">Escribe para buscar.</div></div>';
  const input=document.querySelector('#guardDirectorySearch');let timer=null;input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>searchDirectory(input.value),220);};
}

async function searchDirectory(value){
  const out=document.querySelector('#guardDirectoryResults'),q=String(value||'').trim().toLowerCase();if(!out)return;
  if(q.length<2){out.innerHTML='<div class="empty-state">Escribe al menos 2 caracteres.</div>';return;}
  try{
    const [residents,homes,vehicles]=await Promise.all(['residents','homes','vehicles'].map(async name=>{const snap=await fs.getDocs(fs.query(fs.collection(db,...root(),name),fs.limit(150)));return snap.docs.map(d=>({id:d.id,...d.data()}));}));
    const rows=[];
    residents.filter(x=>`${x.name||''} ${x.homeId||''}`.toLowerCase().includes(q)).slice(0,8).forEach(x=>rows.push(`<article><strong>👤 ${esc(x.name||'Residente')}</strong><p>Unidad ${esc(x.homeId||'')}</p></article>`));
    homes.filter(x=>`${x.unit||x.id||''} ${x.ownerName||''}`.toLowerCase().includes(q)).slice(0,8).forEach(x=>rows.push(`<article><strong>🏠 Unidad ${esc(x.unit||x.id)}</strong><p>${esc(x.ownerName||'Sin propietario')}</p></article>`));
    vehicles.filter(x=>`${x.plate||x.id||''} ${x.homeId||''} ${x.residentName||''}`.toLowerCase().includes(q)).slice(0,8).forEach(x=>rows.push(`<article><strong>🚙 ${esc(x.plate||x.id)}</strong><p>Unidad ${esc(x.homeId||'')} · ${esc([x.make,x.model,x.color].filter(Boolean).join(' '))}</p></article>`));
    out.innerHTML=rows.length?rows.join(''):'<div class="empty-state">No se encontraron resultados.</div>';
  }catch(error){out.innerHTML=`<p class="form-message">${esc(cleanError(error))}</p>`;}
}

async function openHistory(){
  openDialog('Neighbor Guard','Historial de turno');body.innerHTML='<div class="empty-state">Cargando actividad…</div>';
  try{
    let snap;try{snap=await fs.getDocs(fs.query(fs.collection(db,...root(),'accessLogs'),fs.orderBy('createdAt','desc'),fs.limit(60)));}catch{snap=await fs.getDocs(fs.collection(db,...root(),'accessLogs'));}
    const items=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt));
    const today=new Date().toDateString(),todayItems=items.filter(x=>toDate(x.createdAt)?.toDateString()===today);
    const entries=todayItems.filter(x=>x.eventType==='entry').length,exits=todayItems.filter(x=>x.eventType==='exit').length;
    body.innerHTML=`<div class="metric-grid"><div><span>Entradas hoy</span><strong>${entries}</strong></div><div><span>Salidas hoy</span><strong>${exits}</strong></div></div><div class="module-list">${items.length?items.map(logRow).join(''):'<div class="empty-state">No hay movimientos registrados.</div>'}</div>`;
  }catch(error){body.innerHTML=`<p class="form-message">${esc(cleanError(error))}</p>`;}
}

function logRow(item){return `<article><strong>${item.eventType==='entry'?'➡️ Entrada':'⬅️ Salida'} · ${esc(item.visitorName||'Visitante')}</strong><p>Unidad ${esc(item.homeId||'')} ${item.plate?`· ${esc(item.plate)}`:''} · ${esc(formatDate(item.createdAt))}</p><small>${esc(item.guardName||'Seguridad')}</small></article>`;}
function toDate(value){if(!value)return null;if(typeof value.toDate==='function')return value.toDate();const d=new Date(value);return Number.isNaN(d.getTime())?null:d;}
function dateMs(value){return toDate(value)?.getTime()||0;}
function formatDate(value){const d=toDate(value);return d?new Intl.DateTimeFormat('es-PR',{dateStyle:'short',timeStyle:'short'}).format(d):'Sin fecha';}
function cleanError(error){const code=String(error?.code||'');if(code.includes('permission-denied'))return'No tienes permiso para esta operación.';if(code.includes('unavailable'))return'Firebase no está disponible ahora.';return String(error?.message||'No se pudo completar la operación.').replace(/^FirebaseError:\s*/i,'');}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

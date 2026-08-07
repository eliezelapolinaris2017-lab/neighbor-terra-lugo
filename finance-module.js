import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

const CACHE_KEY=`neighbor-${COMMUNITY_ID}-finance-cache`;
const SETTINGS_KEY=`neighbor-${COMMUNITY_ID}-finance-settings`;
const dialog=document.querySelector('#featureDialog');
const title=document.querySelector('#dialogTitle');
const eyebrow=document.querySelector('#dialogEyebrow');
const body=document.querySelector('#dialogBody');
const form=document.querySelector('#dialogForm');

let app,auth,db,fs;
let profile=null;
let records=loadCache();
let settings=loadSettings();
let ready=false;
let syncPromise=null;
let lastSync=0;
let autoChargePromise=null;

initialize();

async function initialize(){
  try{
    const appMod=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authMod=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    fs=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    app=appMod.getApps().length?appMod.getApp():appMod.initializeApp(firebaseConfig);
    auth=authMod.getAuth(app);db=fs.getFirestore(app);ready=true;
    authMod.onAuthStateChanged(auth,async user=>{
      if(!user){profile=null;return;}
      try{const snap=await fs.getDoc(fs.doc(db,...baseRoot(),'users',user.uid));profile=snap.exists()?{uid:user.uid,...snap.data()}:{uid:user.uid,role:'resident'};}catch(error){console.warn('No se pudo cargar el perfil financiero.',error);}
    });
  }catch(error){console.warn('Finanzas en modo local.',error);}
}

document.addEventListener('click',event=>{
  const button=event.target.closest('.action-card,.nav-item,[data-neighbor-finance]');
  if(!button)return;
  const text=button.textContent.toLowerCase();
  if(!text.includes('finanzas')&&!text.includes('estado de cuenta'))return;
  event.preventDefault();event.stopImmediatePropagation();openFinance();
},true);

function isAdmin(){return profile?.role==='admin'||document.querySelector('#roleBadge')?.textContent?.toLowerCase().includes('admin');}
function baseRoot(){return ['apps',APP_NAMESPACE,'communities',COMMUNITY_ID];}
function financeRoot(){return [...baseRoot(),'finance'];}
function settingsRef(){return fs.doc(db,...baseRoot(),'financeSettings','monthlyMaintenance');}

function openFinance(){
  eyebrow.textContent=isAdmin()?'Neighbor Admin':'Neighbor Residente';
  title.textContent=isAdmin()?'Finanzas':'Estado de cuenta';
  form.onsubmit=null;
  renderFinance();if(!dialog.open)dialog.showModal();
  refreshFinance().catch(error=>console.warn('Actualización financiera pendiente.',error));
}

async function refreshFinance(){
  await loadRemoteSettings().catch(()=>{});
  if(isAdmin())await ensureMonthlyCharges().catch(error=>console.warn('Cargo mensual pendiente:',error));
  await syncFinance(true);
  if(dialog.open&&['Finanzas','Estado de cuenta'].includes(title.textContent))renderFinance();
}

function visibleRecords(){
  if(isAdmin())return records;
  const uid=auth?.currentUser?.uid;
  const home=String(profile?.homeId||'').toUpperCase();
  return records.filter(r=>r.userId===uid||(home&&String(r.homeId||'').toUpperCase()===home));
}

function totals(items){
  let charges=0,payments=0;
  items.forEach(item=>{
    const amount=Number(item.amount||0);
    if(item.type==='payment'||item.type==='credit')payments+=amount;else charges+=amount;
  });
  return{charges,payments,balance:charges-payments};
}

function renderFinance(filter=''){
  const items=visibleRecords();
  const q=filter.trim().toLowerCase();
  const filtered=items.filter(item=>`${item.description||''} ${item.homeId||''} ${item.reference||''} ${item.checkNumber||''} ${item.date||''}`.toLowerCase().includes(q));
  const t=totals(items);
  const fee=Number(settings.amount||0);
  body.innerHTML=`
    <div class="balance-card"><span>${isAdmin()?'Balance pendiente':'Balance actual'}</span><strong>${money(t.balance)}</strong><small>${t.balance<=0?'Cuenta al día':`${money(t.payments)} en pagos registrados`}</small></div>
    <div class="metric-grid"><div><span>Cargos</span><strong>${money(t.charges)}</strong></div><div><span>Pagos</span><strong>${money(t.payments)}</strong></div></div>
    ${isAdmin()?`<div class="module-list" style="margin-bottom:14px"><article><strong>Cuota mensual automática</strong><p>${fee>0?`${money(fee)} por residente · desde ${esc(settings.startMonth||'sin fecha')}`:'No configurada'}</p></article></div>`:''}
    <div class="homes-toolbar"><input id="financeSearch" type="search" placeholder="Buscar concepto, unidad o cheque" value="${esc(filter)}"><div style="display:flex;gap:8px;flex-wrap:wrap">${isAdmin()?'<button id="financeSettings" type="button" class="secondary-button">Mensualidad</button><button id="financeNew" type="button" class="primary-button compact-button">+ Movimiento</button>':''}</div></div>
    <div class="module-list">${filtered.length?filtered.map(financeRow).join(''):'<div class="empty-state">No hay movimientos registrados.</div>'}</div>`;
  document.querySelector('#financeSearch')?.addEventListener('input',e=>renderFinance(e.target.value));
  document.querySelector('#financeNew')?.addEventListener('click',()=>showMovementForm());
  document.querySelector('#financeSettings')?.addEventListener('click',showSettingsForm);
  document.querySelectorAll('[data-finance-edit]').forEach(b=>b.addEventListener('click',()=>showMovementForm(b.dataset.financeEdit)));
  document.querySelectorAll('[data-finance-delete]').forEach(b=>b.addEventListener('click',()=>removeMovement(b.dataset.financeDelete)));
}

function financeRow(item){
  const payment=item.type==='payment'||item.type==='credit';
  const label=payment?'Pago':'Cargo';
  const check=payment?(item.checkNumber||item.reference||'Sin cheque'):'';
  const auto=item.autoMonthly?' · Automático':'';
  return `<article class="home-row"><div><strong>${esc(item.description||label)}</strong><p>${esc(label)} · ${esc(item.homeId||'Sin unidad')} · ${esc(item.date||'')}${check?` · Cheque #${esc(check)}`:''}${auto}</p></div><div class="row-actions"><strong>${payment?'−':'+'}${money(item.amount)}</strong>${isAdmin()&&!item.autoMonthly?`<button type="button" data-finance-edit="${esc(item.id)}">Editar</button>`:''}${isAdmin()?`<button type="button" class="danger-link" data-finance-delete="${esc(item.id)}">Eliminar</button>`:''}</div></article>`;
}

function showSettingsForm(){
  if(!isAdmin())return;
  title.textContent='Cuota mensual de mantenimiento';
  body.innerHTML=`<label>Monto mensual por residente<input name="amount" type="number" min="0" step="0.01" required value="${esc(settings.amount||'')}"></label><label>Comenzar desde<input name="startMonth" type="month" required value="${esc(settings.startMonth||currentMonthKey())}"></label><label>Concepto<input name="description" required value="${esc(settings.description||'Cuota mensual de mantenimiento')}"></label><p>Neighbor generará una sola cuota por residente por cada mes pendiente. Los pagos se registran únicamente por cheque.</p><div class="form-actions"><button id="financeSettingsCancel" class="secondary-button" type="button">Cancelar</button><button class="primary-button" type="submit">Guardar y generar</button></div><p id="financeMessage" class="form-message"></p>`;
  document.querySelector('#financeSettingsCancel').onclick=()=>{title.textContent='Finanzas';renderFinance();};
  form.onsubmit=saveSettings;
}

async function saveSettings(event){
  event.preventDefault();
  const message=document.querySelector('#financeMessage');
  const data=Object.fromEntries(new FormData(form).entries());
  const next={amount:Number(data.amount||0),startMonth:String(data.startMonth||currentMonthKey()),description:String(data.description||'Cuota mensual de mantenimiento').trim()};
  if(!(next.amount>=0)||!/^[0-9]{4}-[0-9]{2}$/.test(next.startMonth)){if(message)message.textContent='Verifica el monto y el mes.';return;}
  if(message)message.textContent='Guardando configuración…';
  try{
    settings=next;saveSettingsLocal();
    if(ready&&auth?.currentUser)await fs.setDoc(settingsRef(),{...next,updatedBy:auth.currentUser.uid,updatedAt:fs.serverTimestamp()},{merge:true});
    await ensureMonthlyCharges(true);
    await syncFinance(true);
    title.textContent='Finanzas';renderFinance();
  }catch(error){if(message)message.textContent=error.message||'No se pudo guardar.';}
}

function showMovementForm(id=null){
  if(!isAdmin())return;
  const item=records.find(r=>r.id===id)||{};
  title.textContent=id?'Editar movimiento':'Nuevo movimiento';
  body.innerHTML=`
    <label>Tipo<select name="type"><option value="charge" ${item.type!=='payment'?'selected':''}>Cargo</option><option value="payment" ${item.type==='payment'?'selected':''}>Pago por cheque</option></select></label>
    <div class="form-grid"><label>Unidad<input name="homeId" required value="${esc(item.homeId||'')}" placeholder="A-12"></label><label>Monto<input name="amount" type="number" min="0.01" step="0.01" required value="${esc(item.amount||'')}"></label></div>
    <label>Concepto<input name="description" required value="${esc(item.description||'')}" placeholder="Cuota, pago, ajuste..."></label>
    <div class="form-grid"><label>Fecha<input name="date" type="date" required value="${esc(item.date||todayKey())}"></label><label>Número de cheque<input name="checkNumber" value="${esc(item.checkNumber||item.reference||'')}" placeholder="Obligatorio para pagos"></label></div>
    <label>ID de usuario (opcional)<input name="userId" value="${esc(item.userId||'')}" placeholder="Se puede dejar vacío si usa la unidad"></label>
    <div class="form-actions"><button id="financeCancel" class="secondary-button" type="button">Cancelar</button><button class="primary-button" type="submit">Guardar</button></div><p class="form-message" id="financeMessage"></p>`;
  document.querySelector('#financeCancel').onclick=()=>{title.textContent='Finanzas';renderFinance();};
  form.onsubmit=e=>saveMovement(e,id);
}

async function saveMovement(event,id){
  event.preventDefault();
  const message=document.querySelector('#financeMessage');
  const data=Object.fromEntries(new FormData(form).entries());
  const type=data.type==='payment'?'payment':'charge';
  const payload={type,homeId:String(data.homeId||'').trim().toUpperCase(),amount:Number(data.amount||0),description:String(data.description||'').trim(),date:data.date||todayKey(),checkNumber:String(data.checkNumber||'').trim(),reference:String(data.checkNumber||'').trim(),paymentMethod:type==='payment'?'Cheque':'',userId:String(data.userId||'').trim()};
  if(!payload.homeId||!payload.description||!(payload.amount>0)){if(message)message.textContent='Completa unidad, monto y concepto.';return;}
  if(type==='payment'&&!payload.checkNumber){if(message)message.textContent='Todo pago debe incluir el número de cheque.';return;}
  if(message)message.textContent='Guardando…';
  try{
    if(ready&&auth?.currentUser){
      if(id)await fs.setDoc(fs.doc(db,...financeRoot(),id),{...payload,updatedBy:auth.currentUser.uid,updatedAt:fs.serverTimestamp()},{merge:true});
      else await fs.addDoc(fs.collection(db,...financeRoot()),{...payload,createdBy:auth.currentUser.uid,createdAt:fs.serverTimestamp(),updatedAt:fs.serverTimestamp()});
      lastSync=0;await syncFinance(true);
    }else{
      const record={...payload,id:id||crypto.randomUUID(),createdAt:new Date().toISOString()};records=id?records.map(r=>r.id===id?{...r,...record}:r):[record,...records];saveCache();
    }
    title.textContent='Finanzas';renderFinance();
  }catch(error){if(message)message.textContent=error.message||'No se pudo guardar.';}
}

async function ensureMonthlyCharges(force=false){
  if(!isAdmin()||!ready||!auth?.currentUser||Number(settings.amount||0)<=0)return;
  if(autoChargePromise&&!force)return autoChargePromise;
  autoChargePromise=(async()=>{
    const residentSnap=await fs.getDocs(fs.collection(db,...baseRoot(),'residents'));
    const residents=residentSnap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r.status!=='inactive');
    if(!residents.length)return;
    const financeSnap=await fs.getDocs(fs.collection(db,...financeRoot()));
    const existingIds=new Set(financeSnap.docs.map(d=>d.id));
    const months=monthRange(settings.startMonth||currentMonthKey(),currentMonthKey());
    const pending=[];
    for(const month of months){
      for(const resident of residents){
        const id=`maintenance-${month}-${resident.id}`;
        if(existingIds.has(id))continue;
        pending.push({id,resident,month});
      }
    }
    for(let i=0;i<pending.length;i+=350){
      const batch=fs.writeBatch(db);
      pending.slice(i,i+350).forEach(({id,resident,month})=>{
        batch.set(fs.doc(db,...financeRoot(),id),{type:'charge',amount:Number(settings.amount),description:settings.description||'Cuota mensual de mantenimiento',date:`${month}-01`,homeId:String(resident.homeId||'').toUpperCase(),userId:String(resident.uid||resident.userId||''),residentId:resident.id,residentName:resident.name||'',monthlyChargeKey:`${month}-${resident.id}`,month,autoMonthly:true,createdBy:auth.currentUser.uid,createdAt:fs.serverTimestamp(),updatedAt:fs.serverTimestamp()});
      });
      await batch.commit();
    }
    if(pending.length)lastSync=0;
  })().finally(()=>{autoChargePromise=null;});
  return autoChargePromise;
}

async function loadRemoteSettings(){
  if(!ready||!auth?.currentUser)return settings;
  const snap=await fs.getDoc(settingsRef());
  if(snap.exists()){settings={...settings,...snap.data()};saveSettingsLocal();}
  return settings;
}

async function removeMovement(id){
  if(!isAdmin()||!confirm('¿Eliminar este movimiento financiero?'))return;
  try{if(ready&&auth?.currentUser)await fs.deleteDoc(fs.doc(db,...financeRoot(),id));records=records.filter(r=>r.id!==id);saveCache();renderFinance();lastSync=0;syncFinance(true);}catch(error){alert(error.message||'No se pudo eliminar.');}
}

async function syncFinance(force=false){
  if(!ready||!auth?.currentUser)return records;
  if(!force&&Date.now()-lastSync<45000)return records;
  if(syncPromise)return syncPromise;
  syncPromise=(async()=>{
    try{
      let snap;try{snap=await fs.getDocs(fs.query(fs.collection(db,...financeRoot()),fs.orderBy('date','desc'),fs.limit(500)));}catch{snap=await fs.getDocs(fs.collection(db,...financeRoot()));}
      records=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));saveCache();lastSync=Date.now();return records;
    }finally{syncPromise=null;}
  })();return syncPromise;
}

function monthRange(start,end){
  if(!/^\d{4}-\d{2}$/.test(start))start=end;
  const out=[];let [y,m]=start.split('-').map(Number);const [ey,em]=end.split('-').map(Number);
  while(y<ey||(y===ey&&m<=em)){out.push(`${y}-${String(m).padStart(2,'0')}`);m++;if(m>12){m=1;y++;}if(out.length>120)break;}
  return out;
}
function currentMonthKey(){return new Date().toISOString().slice(0,7);}
function todayKey(){return new Date().toISOString().slice(0,10);}
function loadCache(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY));return Array.isArray(x)?x:[];}catch{return[];}}
function saveCache(){try{localStorage.setItem(CACHE_KEY,JSON.stringify(records));}catch{}}
function loadSettings(){try{const x=JSON.parse(localStorage.getItem(SETTINGS_KEY));return x&&typeof x==='object'?x:{};}catch{return{};}}
function saveSettingsLocal(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}}
function money(value){return Number(value||0).toLocaleString('en-US',{style:'currency',currency:'USD'});}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

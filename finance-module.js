import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

const CACHE_KEY = `neighbor-${COMMUNITY_ID}-finance-cache`;
const dialog = document.querySelector('#featureDialog');
const title = document.querySelector('#dialogTitle');
const eyebrow = document.querySelector('#dialogEyebrow');
const body = document.querySelector('#dialogBody');
const form = document.querySelector('#dialogForm');

let app, auth, db, fs;
let profile = null;
let records = loadCache();
let ready = false;
let syncPromise = null;
let lastSync = 0;

initialize();

async function initialize(){
  try{
    const appMod = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    fs = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
    auth = authMod.getAuth(app);
    db = fs.getFirestore(app);
    ready = true;
    authMod.onAuthStateChanged(auth, async user => {
      if(!user){ profile = null; return; }
      try{
        const snap = await fs.getDoc(fs.doc(db,'apps',APP_NAMESPACE,'communities',COMMUNITY_ID,'users',user.uid));
        profile = snap.exists() ? {uid:user.uid,...snap.data()} : {uid:user.uid,role:'resident'};
      }catch(error){ console.warn('No se pudo cargar el perfil financiero.', error); }
    });
  }catch(error){ console.warn('Finanzas en modo local.', error); }
}

document.addEventListener('click', event => {
  const button = event.target.closest('.action-card,.nav-item,[data-neighbor-finance]');
  if(!button) return;
  const text = button.textContent.toLowerCase();
  if(!text.includes('finanzas') && !text.includes('estado de cuenta')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openFinance();
}, true);

function isAdmin(){ return profile?.role === 'admin'; }
function root(){ return ['apps',APP_NAMESPACE,'communities',COMMUNITY_ID,'finance']; }

function openFinance(){
  eyebrow.textContent = isAdmin() ? 'Neighbor Admin' : 'Neighbor Residente';
  title.textContent = isAdmin() ? 'Finanzas' : 'Estado de cuenta';
  form.onsubmit = null;
  renderFinance();
  if(!dialog.open) dialog.showModal();
  if(Date.now() - lastSync > 45000) syncFinance().then(()=>{
    if(dialog.open && ['Finanzas','Estado de cuenta'].includes(title.textContent)) renderFinance();
  }).catch(()=>{});
}

function visibleRecords(){
  if(isAdmin()) return records;
  const uid = auth?.currentUser?.uid;
  const home = String(profile?.homeId || '').toUpperCase();
  return records.filter(r => r.userId === uid || (home && String(r.homeId || '').toUpperCase() === home));
}

function totals(items){
  let charges=0,payments=0;
  items.forEach(item => {
    const amount = Number(item.amount || 0);
    if(item.type === 'payment' || item.type === 'credit') payments += amount;
    else charges += amount;
  });
  return {charges,payments,balance:charges-payments};
}

function renderFinance(filter=''){
  const items = visibleRecords();
  const q = filter.trim().toLowerCase();
  const filtered = items.filter(item => `${item.description||''} ${item.homeId||''} ${item.reference||''} ${item.date||''}`.toLowerCase().includes(q));
  const t = totals(items);
  body.innerHTML = `
    <div class="balance-card">
      <span>${isAdmin() ? 'Balance pendiente' : 'Balance actual'}</span>
      <strong>${money(t.balance)}</strong>
      <small>${t.balance <= 0 ? 'Cuenta al día' : `${money(t.payments)} en pagos registrados`}</small>
    </div>
    <div class="metric-grid">
      <div><span>Cargos</span><strong>${money(t.charges)}</strong></div>
      <div><span>Pagos / créditos</span><strong>${money(t.payments)}</strong></div>
    </div>
    <div class="homes-toolbar">
      <input id="financeSearch" type="search" placeholder="Buscar concepto, unidad o referencia" value="${esc(filter)}">
      ${isAdmin() ? '<button id="financeNew" type="button" class="primary-button compact-button">+ Movimiento</button>' : ''}
    </div>
    <div class="module-list">${filtered.length ? filtered.map(financeRow).join('') : '<div class="empty-state">No hay movimientos registrados.</div>'}</div>`;
  document.querySelector('#financeSearch')?.addEventListener('input',e=>renderFinance(e.target.value));
  document.querySelector('#financeNew')?.addEventListener('click',()=>showMovementForm());
  document.querySelectorAll('[data-finance-edit]').forEach(b=>b.addEventListener('click',()=>showMovementForm(b.dataset.financeEdit)));
  document.querySelectorAll('[data-finance-delete]').forEach(b=>b.addEventListener('click',()=>removeMovement(b.dataset.financeDelete)));
}

function financeRow(item){
  const sign = item.type === 'payment' || item.type === 'credit' ? '−' : '+';
  const label = ({charge:'Cargo',payment:'Pago',credit:'Crédito'})[item.type] || 'Movimiento';
  return `<article class="home-row"><div><strong>${esc(item.description || label)}</strong><p>${esc(label)} · ${esc(item.homeId || 'Sin unidad')} · ${esc(item.date || '')}${item.reference ? ` · ${esc(item.reference)}` : ''}</p></div><div class="row-actions"><strong>${sign}${money(item.amount)}</strong>${isAdmin()?`<button type="button" data-finance-edit="${esc(item.id)}">Editar</button><button type="button" class="danger-link" data-finance-delete="${esc(item.id)}">Eliminar</button>`:''}</div></article>`;
}

function showMovementForm(id=null){
  if(!isAdmin()) return;
  const item = records.find(r=>r.id===id) || {};
  title.textContent = id ? 'Editar movimiento' : 'Nuevo movimiento';
  body.innerHTML = `
    <label>Tipo<select name="type"><option value="charge" ${item.type!=='payment'&&item.type!=='credit'?'selected':''}>Cargo</option><option value="payment" ${item.type==='payment'?'selected':''}>Pago</option><option value="credit" ${item.type==='credit'?'selected':''}>Crédito</option></select></label>
    <div class="form-grid"><label>Unidad<input name="homeId" required value="${esc(item.homeId||'')}" placeholder="A-12"></label><label>Monto<input name="amount" type="number" min="0" step="0.01" required value="${esc(item.amount||'')}"></label></div>
    <label>Concepto<input name="description" required value="${esc(item.description||'')}" placeholder="Cuota mensual, pago, ajuste..."></label>
    <div class="form-grid"><label>Fecha<input name="date" type="date" required value="${esc(item.date||new Date().toISOString().slice(0,10))}"></label><label>Referencia<input name="reference" value="${esc(item.reference||'')}" placeholder="Recibo / cheque"></label></div>
    <label>ID de usuario (opcional)<input name="userId" value="${esc(item.userId||'')}" placeholder="Se puede dejar vacío si usa la unidad"></label>
    <div class="form-actions"><button id="financeCancel" class="secondary-button" type="button">Cancelar</button><button class="primary-button" type="submit">Guardar</button></div>
    <p class="form-message" id="financeMessage"></p>`;
  document.querySelector('#financeCancel').onclick = ()=>{title.textContent='Finanzas';renderFinance();};
  form.onsubmit = e=>saveMovement(e,id);
}

async function saveMovement(event,id){
  event.preventDefault();
  const message=document.querySelector('#financeMessage');
  const data=Object.fromEntries(new FormData(form).entries());
  const payload={
    type:['charge','payment','credit'].includes(data.type)?data.type:'charge',
    homeId:String(data.homeId||'').trim().toUpperCase(),
    amount:Number(data.amount||0),
    description:String(data.description||'').trim(),
    date:data.date||new Date().toISOString().slice(0,10),
    reference:String(data.reference||'').trim(),
    userId:String(data.userId||'').trim()
  };
  if(!payload.homeId || !payload.description || !(payload.amount>=0)) return;
  if(message) message.textContent='Guardando…';
  try{
    if(ready && auth?.currentUser){
      if(id) await fs.setDoc(fs.doc(db,...root(),id),{...payload,updatedBy:auth.currentUser.uid,updatedAt:fs.serverTimestamp()},{merge:true});
      else await fs.addDoc(fs.collection(db,...root()),{...payload,createdBy:auth.currentUser.uid,createdAt:fs.serverTimestamp(),updatedAt:fs.serverTimestamp()});
      lastSync = 0;
      await syncFinance(true);
    }else{
      const record={...payload,id:id||crypto.randomUUID(),createdAt:new Date().toISOString()};
      records=id?records.map(r=>r.id===id?{...r,...record}:r):[record,...records];
      saveCache();
    }
    title.textContent='Finanzas';
    renderFinance();
  }catch(error){if(message) message.textContent=error.message||'No se pudo guardar.';}
}

async function removeMovement(id){
  if(!isAdmin() || !confirm('¿Eliminar este movimiento financiero?')) return;
  try{
    if(ready && auth?.currentUser) await fs.deleteDoc(fs.doc(db,...root(),id));
    records=records.filter(r=>r.id!==id); saveCache(); renderFinance();
    lastSync = 0; syncFinance(true);
  }catch(error){alert(error.message||'No se pudo eliminar.');}
}

async function syncFinance(force=false){
  if(!ready || !auth?.currentUser) return records;
  if(!force && Date.now()-lastSync<45000) return records;
  if(syncPromise) return syncPromise;
  syncPromise=(async()=>{
    try{
      let snap;
      try{ snap = await fs.getDocs(fs.query(fs.collection(db,...root()),fs.orderBy('date','desc'),fs.limit(100))); }
      catch{ snap = await fs.getDocs(fs.collection(db,...root())); }
      records=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
      saveCache(); lastSync=Date.now(); return records;
    }finally{ syncPromise=null; }
  })();
  return syncPromise;
}

function loadCache(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY));return Array.isArray(x)?x:[];}catch{return[];}}
function saveCache(){try{localStorage.setItem(CACHE_KEY,JSON.stringify(records));}catch{}}
function money(value){return Number(value||0).toLocaleString('en-US',{style:'currency',currency:'USD'});}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

const dialog=document.querySelector('#featureDialog');
const title=document.querySelector('#dialogTitle');
const eyebrow=document.querySelector('#dialogEyebrow');
const body=document.querySelector('#dialogBody');
const form=document.querySelector('#dialogForm');
let auth=null,db=null,fs=null,profile=null,ready=false,loading=false;
const root=()=>['apps',APP_NAMESPACE,'communities',COMMUNITY_ID];
const modules=['residents','homes','vehicles','packages','incidents','reservations','announcements','visits','accessLogs','finance'];

initialize();

document.addEventListener('click',event=>{
  const button=event.target.closest('.action-card,.nav-item');
  if(!button)return;
  const text=button.textContent.toLowerCase();
  const module=button.dataset.module||button.dataset.route||'';
  if(module!=='reports'&&!text.includes('reportes'))return;
  if(!isAdmin())return;
  event.preventDefault();event.stopImmediatePropagation();openReports();
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
  }catch(error){console.warn('Reportes sin conexión:',error);}
}

function isAdmin(){return profile?.role==='admin'||document.querySelector('#roleBadge')?.textContent?.toLowerCase().includes('admin');}
function cacheKey(name){return name==='finance'?`neighbor-${COMMUNITY_ID}-finance-cache`:`neighbor-${COMMUNITY_ID}-${name}`;}
function readCache(name){try{const data=JSON.parse(localStorage.getItem(cacheKey(name)));return Array.isArray(data)?data:[];}catch{return[];}}
function openReports(){eyebrow.textContent='Neighbor Admin';title.textContent='Reportes';form.onsubmit=null;if(!dialog.open)dialog.showModal();renderLoading();loadReports();}
function renderLoading(){body.innerHTML='<div class="empty-state">Preparando resumen operacional…</div>';}

async function loadReports(){
  if(loading)return;loading=true;
  try{
    const data={};
    for(const name of modules)data[name]=readCache(name);
    renderReports(data,true);
    if(ready&&auth?.currentUser){
      const fresh=await Promise.all(modules.map(async name=>{
        try{
          const ref=fs.collection(db,...root(),name);
          const snap=await fs.getDocs(name==='accessLogs'?fs.query(ref,fs.orderBy('createdAt','desc'),fs.limit(250)):fs.query(ref,fs.limit(name==='finance'?600:250)));
          return [name,snap.docs.map(d=>({id:d.id,...d.data()}))];
        }catch{return[name,data[name]||[]];}
      }));
      fresh.forEach(([name,items])=>{data[name]=items;try{localStorage.setItem(cacheKey(name),JSON.stringify(items));}catch{}});
      renderReports(data,false);
    }
  }finally{loading=false;}
}

function renderReports(data,cached){
  if(!dialog.open||title.textContent!=='Reportes')return;
  const residents=(data.residents||[]).filter(x=>x.status!=='inactive');
  const incidents=data.incidents||[], reservations=data.reservations||[], packages=data.packages||[], visits=data.visits||[], logs=data.accessLogs||[], finance=data.finance||[];
  const openIncidents=incidents.filter(x=>['open','in-progress','pending'].includes(String(x.status||'open'))).length;
  const pendingReservations=reservations.filter(x=>['pending','open'].includes(String(x.status||'pending'))).length;
  const pendingPackages=packages.filter(x=>String(x.status||'pending')==='pending').length;
  const inside=visits.filter(x=>String(x.status)==='active').length;
  const financeTotals=finance.reduce((a,x)=>{const n=Number(x.amount||0);if(x.type==='payment'||x.type==='credit')a.payments+=n;else a.charges+=n;return a;},{charges:0,payments:0});
  const balance=financeTotals.charges-financeTotals.payments;
  const units=unitBalances(finance).filter(x=>x.balance>0).sort((a,b)=>b.balance-a.balance);
  const today=new Date().toDateString();
  const todayLogs=logs.filter(x=>toDate(x.createdAt)?.toDateString()===today);
  const entries=todayLogs.filter(x=>x.eventType==='entry').length, exits=todayLogs.filter(x=>x.eventType==='exit').length, denied=todayLogs.filter(x=>x.eventType==='denied').length;

  body.innerHTML=`
    <div class="metric-grid reports-metrics">
      ${metric('Residentes activos',residents.length)}${metric('Incidencias abiertas',openIncidents)}${metric('Reservaciones pendientes',pendingReservations)}${metric('Paquetes pendientes',pendingPackages)}
      ${metric('Visitas dentro',inside)}${metric('Balance pendiente',money(balance))}
    </div>
    <div class="module-list">
      <article><strong>Control de acceso de hoy</strong><p>${entries} entradas · ${exits} salidas · ${denied} denegados</p></article>
      <article><strong>Cuentas con balance</strong><p>${units.length} unidades · ${money(units.reduce((s,x)=>s+x.balance,0))} pendiente</p></article>
    </div>
    <div class="section-title" style="margin-top:18px"><h2>Balances por unidad</h2><button id="reportExport" class="text-button" type="button">Exportar CSV</button></div>
    <div class="module-list" id="reportBalances">${units.length?units.slice(0,30).map(x=>`<article class="home-row"><div><strong>Unidad ${esc(x.homeId)}</strong><p>Cargos ${money(x.charges)} · Pagos ${money(x.payments)}</p></div><strong>${money(x.balance)}</strong></article>`).join(''):'<div class="empty-state">No hay balances pendientes.</div>'}</div>
    <p class="form-message">${cached?'Mostrando datos guardados mientras sincroniza…':'Datos actualizados desde la nube.'}</p>`;
  document.querySelector('#reportExport')?.addEventListener('click',()=>exportCsv(data,units));
}

function unitBalances(finance){
  const map=new Map();
  finance.forEach(x=>{const home=String(x.homeId||'SIN-UNIDAD').toUpperCase();if(!map.has(home))map.set(home,{homeId:home,charges:0,payments:0,balance:0});const row=map.get(home),n=Number(x.amount||0);if(x.type==='payment'||x.type==='credit')row.payments+=n;else row.charges+=n;row.balance=row.charges-row.payments;});
  return[...map.values()];
}
function metric(label,value){return `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;}
function money(n){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n||0));}
function toDate(v){if(!v)return null;if(typeof v.toDate==='function')return v.toDate();const d=new Date(v);return Number.isNaN(d.getTime())?null:d;}
function exportCsv(data,units){
  const rows=[['Neighbor Reportes',new Date().toLocaleString('es-PR')],[],['Unidad','Cargos','Pagos','Balance'],...units.map(x=>[x.homeId,x.charges.toFixed(2),x.payments.toFixed(2),x.balance.toFixed(2)]),[],['Métrica','Total'],['Residentes activos',(data.residents||[]).filter(x=>x.status!=='inactive').length],['Incidencias',(data.incidents||[]).length],['Reservaciones',(data.reservations||[]).length],['Paquetes',(data.packages||[]).length],['Visitas',(data.visits||[]).length]];
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`neighbor-reportes-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

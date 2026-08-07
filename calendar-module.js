import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

const dialog=document.querySelector('#featureDialog');
const title=document.querySelector('#dialogTitle');
const eyebrow=document.querySelector('#dialogEyebrow');
const body=document.querySelector('#dialogBody');
const form=document.querySelector('#dialogForm');
const actionGrid=document.querySelector('#actionGrid');
const CACHE_KEY=`neighbor-${COMMUNITY_ID}-calendar-cache`;

let auth,db,fs,profile=null,ready=false;
let events=loadCache();
let monthCursor=startOfMonth(new Date());
let syncing=false;

installStyles();
initialize();
ensureCalendarCard();
new MutationObserver(ensureCalendarCard).observe(actionGrid,{childList:true});
new MutationObserver(addIncidentScheduleFields).observe(body,{childList:true,subtree:true});

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-neighbor-calendar],.action-card');
  if(!button||!button.textContent.toLowerCase().includes('calendario'))return;
  event.preventDefault();event.stopImmediatePropagation();openCalendar();
},true);

async function initialize(){
  try{
    const appMod=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authMod=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    fs=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    const app=appMod.getApps().length?appMod.getApp():appMod.initializeApp(firebaseConfig);
    auth=authMod.getAuth(app);db=fs.getFirestore(app);ready=true;
    authMod.onAuthStateChanged(auth,async user=>{
      profile=null;
      if(!user)return;
      try{const snap=await fs.getDoc(fs.doc(db,...root(),'users',user.uid));profile=snap.exists()?{uid:user.uid,...snap.data()}:{uid:user.uid,role:'resident'};}catch{}
      ensureCalendarCard();
    });
  }catch(error){console.warn('Calendario en modo local.',error);}
}

function root(){return ['apps',APP_NAMESPACE,'communities',COMMUNITY_ID];}
function isAdmin(){return profile?.role==='admin'||document.querySelector('#roleBadge')?.textContent?.toLowerCase().includes('admin');}

function ensureCalendarCard(){
  if(!actionGrid||!isAdmin()&&![...actionGrid.querySelectorAll('.action-card')].some(x=>x.textContent.toLowerCase().includes('residentes')))return;
  if(actionGrid.querySelector('[data-neighbor-calendar]'))return;
  const card=document.createElement('button');
  card.className='action-card';card.type='button';card.dataset.neighborCalendar='true';card.dataset.module='calendar';
  card.innerHTML='<span class="action-icon">🗓️</span><strong>Calendario</strong><small>Reservaciones y actividades</small>';
  actionGrid.appendChild(card);
}

function openCalendar(){
  eyebrow.textContent='Neighbor Admin';title.textContent='Calendario comunitario';form.onsubmit=null;
  renderCalendar();if(!dialog.open)dialog.showModal();syncCalendar();
}

function renderCalendar(){
  const year=monthCursor.getFullYear(),month=monthCursor.getMonth();
  const first=new Date(year,month,1),days=new Date(year,month+1,0).getDate();
  const start=(first.getDay()+6)%7;
  const monthEvents=events.filter(e=>{const d=parseDate(e.date);return d&&d.getFullYear()===year&&d.getMonth()===month;});
  const cells=[];
  for(let i=0;i<start;i++)cells.push('<div class="calendar-day empty"></div>');
  for(let day=1;day<=days;day++){
    const dateKey=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayEvents=monthEvents.filter(e=>e.date===dateKey);
    cells.push(`<button type="button" class="calendar-day${dayEvents.length?' has-events':''}" data-calendar-date="${dateKey}"><span>${day}</span>${dayEvents.slice(0,3).map(e=>`<i title="${esc(e.title)}">${e.icon}</i>`).join('')}${dayEvents.length>3?`<small>+${dayEvents.length-3}</small>`:''}</button>`);
  }
  const upcoming=events.filter(e=>e.date>=todayKey()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,12);
  body.innerHTML=`
    <div class="calendar-toolbar"><button type="button" id="calendarPrev">‹</button><strong>${monthCursor.toLocaleDateString('es-PR',{month:'long',year:'numeric'})}</strong><button type="button" id="calendarNext">›</button></div>
    <div class="calendar-week"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
    <div class="calendar-grid">${cells.join('')}</div>
    <div class="calendar-legend"><span>📅 Reservación</span><span>🛠️ Reparación</span><span>📢 Comunicado</span></div>
    <h3 class="calendar-subtitle">Próximas actividades</h3>
    <div class="module-list">${upcoming.length?upcoming.map(eventRow).join(''):'<div class="empty-state">No hay actividades programadas.</div>'}</div>`;
  document.querySelector('#calendarPrev').onclick=()=>{monthCursor=new Date(year,month-1,1);renderCalendar();};
  document.querySelector('#calendarNext').onclick=()=>{monthCursor=new Date(year,month+1,1);renderCalendar();};
  document.querySelectorAll('[data-calendar-date]').forEach(b=>b.onclick=()=>showDay(b.dataset.calendarDate));
}

function showDay(date){
  const items=events.filter(e=>e.date===date).sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')));
  title.textContent=new Date(`${date}T12:00:00`).toLocaleDateString('es-PR',{weekday:'long',day:'numeric',month:'long'});
  body.innerHTML=`<button type="button" class="text-button" id="calendarBack">← Calendario</button><div class="module-list" style="margin-top:14px">${items.length?items.map(eventRow).join(''):'<div class="empty-state">No hay actividades este día.</div>'}</div>`;
  document.querySelector('#calendarBack').onclick=()=>{title.textContent='Calendario comunitario';renderCalendar();};
}

function eventRow(e){return `<article><strong>${e.icon} ${esc(e.title)}</strong><p>${esc([e.time,e.detail].filter(Boolean).join(' · '))}</p><small>${esc(e.date)}</small></article>`;}

async function syncCalendar(){
  if(syncing||!ready||!auth?.currentUser)return;
  syncing=true;
  try{
    const collections=['reservations','incidents','announcements'];
    const results=await Promise.all(collections.map(async name=>{
      try{const snap=await fs.getDocs(fs.query(fs.collection(db,...root(),name),fs.limit(120)));return snap.docs.map(d=>({id:d.id,...d.data(),_module:name}));}catch{return[];}
    }));
    events=results.flat().map(toCalendarEvent).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
    saveCache();
    if(dialog.open&&title.textContent.toLowerCase().includes('calendario'))renderCalendar();
  }finally{syncing=false;}
}

function toCalendarEvent(item){
  if(item._module==='reservations'&&item.date)return{date:item.date,time:item.time||'',icon:'📅',title:item.area||'Reservación',detail:`${item.requesterName||item.createdByName||'Residente'}${item.homeId?` · Unidad ${item.homeId}`:''}`};
  if(item._module==='incidents'&&item.scheduledDate)return{date:item.scheduledDate,time:item.scheduledTime||'',icon:'🛠️',title:`Reparación: ${item.category||'Incidencia'}`,detail:item.location||item.description||''};
  if(item._module==='announcements'&&item.date)return{date:item.date,time:'',icon:'📢',title:item.title||'Comunicado',detail:item.message||''};
  return null;
}

function addIncidentScheduleFields(){
  if(!isAdmin()||!title?.textContent?.toLowerCase().includes('incidencia')||form.querySelector('[name="scheduledDate"]'))return;
  const priority=form.querySelector('[name="priority"]')?.closest('label');
  if(!priority)return;
  const wrap=document.createElement('div');wrap.className='form-grid';wrap.innerHTML='<label>Fecha programada de reparación<input name="scheduledDate" type="date"></label><label>Hora<input name="scheduledTime" type="time"></label>';
  priority.insertAdjacentElement('afterend',wrap);
}

function installStyles(){
  if(document.querySelector('#neighborCalendarStyles'))return;
  const style=document.createElement('style');style.id='neighborCalendarStyles';style.textContent=`
  .calendar-toolbar{display:grid;grid-template-columns:42px 1fr 42px;align-items:center;gap:10px;margin-bottom:12px}.calendar-toolbar strong{text-align:center;text-transform:capitalize}.calendar-toolbar button{height:40px;border:1px solid var(--border);border-radius:12px;background:var(--surface);font-size:1.4rem}.calendar-week,.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.calendar-week{margin-bottom:6px;color:var(--muted);font-size:.72rem;font-weight:800;text-align:center}.calendar-day{min-height:58px;border:1px solid var(--border);border-radius:12px;background:var(--surface);padding:7px 5px;color:var(--text);text-align:left}.calendar-day.empty{visibility:hidden}.calendar-day span{display:block;font-size:.78rem;font-weight:800}.calendar-day i{font-style:normal;font-size:.72rem;margin-right:2px}.calendar-day small{font-size:.62rem;color:var(--muted)}.calendar-day.has-events{border-color:rgba(15,76,129,.45);background:#f0f7ff}.calendar-legend{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0;color:var(--muted);font-size:.72rem}.calendar-subtitle{margin:18px 0 10px;font-size:1rem}@media(min-width:980px){.calendar-day{min-height:78px;padding:9px}.calendar-day span{font-size:.9rem}}
  `;document.head.appendChild(style);
}

function startOfMonth(d){return new Date(d.getFullYear(),d.getMonth(),1);}
function parseDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return null;return new Date(`${value}T12:00:00`);}
function todayKey(){return new Date().toISOString().slice(0,10);}
function loadCache(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY));return Array.isArray(x)?x:[];}catch{return[];}}
function saveCache(){try{localStorage.setItem(CACHE_KEY,JSON.stringify(events));}catch{}}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

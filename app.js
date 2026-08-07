import {
  initializeNeighborFirebase,
  isFirebaseReady,
  signInNeighbor,
  signOutNeighbor,
  saveCommunityActivity
} from './firebase-service.js';

const ACTIVITY_KEY='neighbor-terra-lugo-activity';
const SESSION_KEY='neighbor-terra-lugo-session';
const USER_KEY='neighbor-terra-lugo-current-user';

const profiles={
  resident:{name:'Residente',initials:'RE',badge:'Neighbor Resident',title:'Tu comunidad, conectada.',text:'Registra visitas, consulta paquetes y gestiona tu residencia.',actionsTitle:'Acciones principales',actions:[['packages','📦','Paquetes','Registrar o consultar'],['visits','🚗','Registrar visita','Crear autorización'],['reservations','📅','Reservar gazebo','Solicitar fecha'],['announcements','📢','Avisos','Ver comunicados'],['account','💳','Estado de cuenta','Ver balance','good'],['incidents','🛠️','Reportar incidencia','Crear reporte']],nav:[['inicio','⌂','Inicio'],['visits','🚗','Visitas'],['packages','📦','Paquetes'],['announcements','🔔','Avisos'],['profile','◎','Perfil']]},
  guard:{name:'Seguridad',initials:'SG',badge:'Neighbor Guard',title:'Control de acceso rápido.',text:'Entradas, paquetes e incidentes sin menús complicados.',actionsTitle:'Operaciones del portón',actions:[['scan','▣','Escanear QR','Validar autorización'],['entry','🚗','Registrar entrada','Visita sin QR'],['packages','📦','Registrar paquete','Notificar residente'],['directory','🏠','Buscar residencia','Consultar autorización'],['incidents','🚨','Reportar incidente','Crear alerta'],['history','🕘','Historial de turno','Ver actividad']],nav:[['inicio','⌂','Inicio'],['scan','▣','Escanear'],['entry','🚗','Entradas'],['packages','📦','Paquetes'],['profile','◎','Perfil']]},
  admin:{name:'Administración',initials:'AD',badge:'Neighbor Admin',title:'Terra Lugo bajo control.',text:'Gestiona residentes, comunicados, cobros e incidencias.',actionsTitle:'Centro de administración',actions:[['residents','👥','Residentes','Administrar residentes'],['announcements','📢','Comunicados','Publicar aviso'],['finance','💳','Finanzas','Cargos y pagos','good'],['incidents','🛠️','Incidencias','Gestionar casos'],['reservations','📅','Reservaciones','Gestionar solicitudes'],['reports','📊','Reportes','Ver métricas']],nav:[['inicio','⌂','Inicio'],['residents','👥','Residentes'],['finance','💳','Finanzas'],['incidents','🛠️','Casos'],['profile','◎','Perfil']]}
};

const seedActivity=[
  {icon:'📦',title:'Paquete recibido',detail:'Amazon · Unidad A-12',time:'10:24 AM'},
  {icon:'📢',title:'Aviso de administración',detail:'Mantenimiento de áreas comunes',time:'9:10 AM'},
  {icon:'🚗',title:'Visita autorizada',detail:'Juan Pérez · válida por 2 horas',time:'8:45 AM'}
];

const loginScreen=document.querySelector('#loginScreen');
const appShell=document.querySelector('#appShell');
const bottomNav=document.querySelector('#bottomNav');
const actionGrid=document.querySelector('#actionGrid');
const timeline=document.querySelector('#timeline');
const dialog=document.querySelector('#featureDialog');
const dialogTitle=document.querySelector('#dialogTitle');
const dialogBody=document.querySelector('#dialogBody');
const dialogEyebrow=document.querySelector('#dialogEyebrow');
const dialogForm=document.querySelector('#dialogForm');
const loginForm=document.querySelector('#loginForm');
const loginMessage=document.querySelector('#loginMessage');
const connectionBanner=document.querySelector('#connectionBanner');

let currentRole=localStorage.getItem(SESSION_KEY)||null;
let currentUser=loadCurrentUser();
let activity=loadActivity();
let firebaseInitPromise=null;

// IMPORTANTE: la interfaz se conecta primero. Firebase inicia después y nunca bloquea los botones.
bindInterface();
if(currentRole&&profiles[currentRole]) enterApp(currentRole,currentUser,false);
firebaseInitPromise=bootFirebase();

function bindInterface(){
  document.querySelectorAll('[data-role]').forEach(button=>button.addEventListener('click',()=>enterApp(button.dataset.role,null,true)));
  document.querySelector('#changeRole')?.addEventListener('click',logout);
  document.querySelector('#avatarButton')?.addEventListener('click',()=>openModule('profile'));
  document.querySelector('#clearActivity')?.addEventListener('click',()=>{activity=[];saveActivity();renderTimeline();});
  loginForm?.addEventListener('submit',handleLogin);
  window.addEventListener('neighbor:profile-updated',event=>{
    const detail=event.detail||{};
    if(!currentUser||detail.uid!==currentUser.uid)return;
    currentUser={...currentUser,...detail};
    saveCurrentUser();
    renderProfile();
  });
}

async function bootFirebase(){
  connectionBanner.textContent='Conectando con Firebase…';
  try{
    const state=await initializeNeighborFirebase();
    connectionBanner.textContent=state.ready?'Firebase conectado · datos protegidos por usuario':'Modo local disponible · Firebase no respondió';
    connectionBanner.dataset.connected=state.ready?'true':'false';
    return state;
  }catch(error){
    console.warn('Firebase no bloqueó Neighbor:',error);
    connectionBanner.textContent='Modo local disponible · sin conexión a Firebase';
    connectionBanner.dataset.connected='false';
    return {ready:false,error};
  }
}

async function handleLogin(event){
  event.preventDefault();
  loginMessage.textContent='Validando acceso…';
  const data=Object.fromEntries(new FormData(loginForm).entries());
  try{
    if(!isFirebaseReady()){
      loginMessage.textContent='Conectando con Firebase…';
      await Promise.race([firebaseInitPromise||bootFirebase(),delay(7000)]);
    }
    if(!isFirebaseReady()) throw new Error('Firebase no respondió. Verifica la conexión e intenta nuevamente.');
    const result=await signInNeighbor(data.email,data.password);
    if(!result.profile||!profiles[result.profile.role]) throw new Error('Tu cuenta no tiene un rol válido en Terra Lugo.');
    currentUser={uid:result.user.uid,email:result.user.email,...result.profile};
    saveCurrentUser();
    enterApp(result.profile.role,currentUser,true);
    loginForm.reset();
    loginMessage.textContent='';
  }catch(error){loginMessage.textContent=translateAuthError(error);}
}

function enterApp(role,user=null,persist=true){
  if(!profiles[role])return;
  currentRole=role;
  if(user)currentUser=user;
  if(persist){localStorage.setItem(SESSION_KEY,role);saveCurrentUser();}
  loginScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
  bottomNav.classList.remove('hidden');
  renderProfile();renderActions();renderTimeline();renderNav();
}

async function logout(){
  if(isFirebaseReady()) await signOutNeighbor().catch(()=>{});
  localStorage.removeItem(SESSION_KEY);localStorage.removeItem(USER_KEY);
  currentRole=null;currentUser=null;
  appShell.classList.add('hidden');bottomNav.classList.add('hidden');loginScreen.classList.remove('hidden');
}

function renderProfile(){
  const p=profiles[currentRole];if(!p)return;
  const displayName=currentUser?.name||p.name;
  const initials=currentUser?.initials||makeInitials(displayName)||p.initials;
  document.querySelector('#userName').textContent=displayName;
  document.querySelector('#avatarButton').textContent=initials;
  document.querySelector('#roleBadge').textContent=p.badge;
  document.querySelector('#heroTitle').textContent=p.title;
  document.querySelector('#heroText').textContent=p.text;
  document.querySelector('#actionsTitle').textContent=p.actionsTitle;
}

function renderActions(){
  actionGrid.innerHTML='';
  profiles[currentRole].actions.forEach(([id,icon,title,detail,status])=>{
    const button=document.createElement('button');button.className='action-card';button.type='button';button.dataset.module=id;if(status)button.dataset.status=status;
    button.innerHTML=`<span class="action-icon">${icon}</span><strong>${title}</strong><small>${detail}</small>`;
    button.addEventListener('click',()=>openModule(id));actionGrid.appendChild(button);
  });
}

function renderNav(){
  bottomNav.innerHTML='';
  profiles[currentRole].nav.forEach(([id,icon,label],index)=>{
    const button=document.createElement('button');button.className=`nav-item${index===0?' active':''}`;button.type='button';button.dataset.route=id;button.innerHTML=`<span>${icon}</span>${label}`;
    button.addEventListener('click',()=>{bottomNav.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));button.classList.add('active');if(id!=='inicio')openModule(id);});bottomNav.appendChild(button);
  });
}

function renderTimeline(){
  timeline.innerHTML='';
  if(!activity.length){timeline.innerHTML='<div class="empty-state">Todavía no hay actividad registrada.</div>';return;}
  activity.forEach(item=>{const row=document.createElement('article');row.className='timeline-item';row.innerHTML=`<span class="timeline-icon">${item.icon}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div><time>${escapeHtml(item.time||'')}</time>`;timeline.appendChild(row);});
}

function openModule(id){
  const modules={visits:visitForm,entry:entryForm,packages:packageForm,reservations:reservationForm,incidents:incidentForm,announcements:announcementsView,account:accountView,finance:financeView,residents:residentsView,scan:scanView,directory:directoryView,history:historyView,reports:reportsView,profile:profileView};
  (modules[id]||infoView)(id);safeShowDialog();
}

function safeShowDialog(){if(!dialog.open)dialog.showModal();}
function visitForm(){setDialog('Control de acceso','Registrar visita',`<label>Nombre del visitante<input name="visitor" required></label><label>Fecha y hora<input name="visitDate" type="datetime-local" required></label><button class="primary-button" type="submit">Autorizar visita</button>`,d=>addActivity('🚗','Visita autorizada',`${d.visitor} · ${formatDate(d.visitDate)}`,'visit'));}
function entryForm(){setDialog('Neighbor Guard','Registrar entrada',`<label>Nombre del visitante<input name="visitor" required></label><label>Residencia<input name="home" required></label><label>Tablilla<input name="plate"></label><button class="primary-button" type="submit">Registrar entrada</button>`,d=>addActivity('🚗','Entrada registrada',`${d.visitor} · Unidad ${d.home}`,'entry'));}
function packageForm(){setDialog('Paquetería','Registrar paquete',`<label>Compañía<select name="carrier"><option>Amazon</option><option>USPS</option><option>UPS</option><option>FedEx</option><option>Otra</option></select></label><label>Residencia<input name="home" required></label><button class="primary-button" type="submit">Registrar paquete</button>`,d=>addActivity('📦','Paquete registrado',`${d.carrier} · Unidad ${d.home}`,'package'));}
function reservationForm(){setDialog('Áreas comunes','Solicitar reservación',`<label>Área<select name="area"><option>Gazebo</option><option>Cancha</option><option>Área recreativa</option></select></label><label>Fecha<input name="date" type="date" required></label><button class="primary-button" type="submit">Enviar solicitud</button>`,d=>addActivity('📅','Reservación solicitada',`${d.area} · ${formatDate(d.date)}`,'reservation'));}
function incidentForm(){setDialog('Mantenimiento y seguridad','Reportar incidencia',`<label>Categoría<select name="category"><option>Alumbrado</option><option>Seguridad</option><option>Áreas comunes</option><option>Basura</option><option>Otra</option></select></label><label>Descripción<textarea name="description" required></textarea></label><label>Ubicación<input name="location" required></label><button class="primary-button" type="submit">Enviar reporte</button>`,d=>addActivity('🛠️','Incidencia reportada',`${d.category} · ${d.location}`,'incident'));}
function announcementsView(){setDialog('Comunicados','Avisos recientes','<div class="empty-state">Abriendo comunicados…</div>');}
function accountView(){setDialog('Finanzas','Estado de cuenta','<div class="empty-state">Abriendo estado de cuenta…</div>');}
function financeView(){setDialog('Neighbor Admin','Finanzas','<div class="empty-state">Abriendo finanzas…</div>');}
function residentsView(){setDialog('Neighbor Admin','Residentes','<div class="empty-state">Abriendo residentes…</div>');}
function scanView(){setDialog('Neighbor Guard','Escanear QR','<div class="scanner-demo"><span>▣</span><strong>Escáner</strong><p>Preparando cámara…</p></div>');}
function directoryView(){setDialog('Directorio','Buscar residencia','<label>Unidad o residente<input placeholder="Ej. A-12"></label>');}
function historyView(){setDialog('Neighbor Guard','Historial de turno',listHtml(activity.slice(0,6).map(i=>[i.title,`${i.detail} · ${i.time}`])));}
function reportsView(){setDialog('Neighbor Admin','Reportes','<div class="empty-state">Métricas en desarrollo.</div>');}
function profileView(){const p=profiles[currentRole];const email=currentUser?.email||'Perfil de demostración';setDialog(p.badge,'Perfil',listHtml([[currentUser?.name||p.name,`${p.badge} · Terra Lugo`],['Cuenta',email],['Conexión',isFirebaseReady()?'Firebase activo':'Conectando / modo local']]));}
function infoView(name){setDialog('Neighbor',name,'<p>Este módulo está en preparación.</p>');}

function setDialog(eyebrow,title,html,onSubmit){dialogEyebrow.textContent=eyebrow;dialogTitle.textContent=title;dialogBody.innerHTML=html;dialogForm.onsubmit=e=>{if(!onSubmit)return;e.preventDefault();const data=Object.fromEntries(new FormData(dialogForm).entries());onSubmit(data);dialog.close();dialogForm.reset();};}
function listHtml(items){return `<div class="module-list">${items.map(([a,b])=>`<article><strong>${escapeHtml(a)}</strong><p>${escapeHtml(b)}</p></article>`).join('')}</div>`;}
async function addActivity(icon,title,detail,type){const item={icon,title,detail,type,role:currentRole,userId:currentUser?.uid||'demo',time:new Date().toLocaleTimeString('es-PR',{hour:'numeric',minute:'2-digit'})};activity.unshift(item);activity=activity.slice(0,15);saveActivity();renderTimeline();if(isFirebaseReady())saveCommunityActivity(item).catch(()=>{});}
function saveActivity(){try{localStorage.setItem(ACTIVITY_KEY,JSON.stringify(activity));}catch{}}
function loadActivity(){try{const saved=JSON.parse(localStorage.getItem(ACTIVITY_KEY));return Array.isArray(saved)?saved:seedActivity;}catch{return seedActivity;}}
function saveCurrentUser(){try{currentUser?localStorage.setItem(USER_KEY,JSON.stringify(currentUser)):localStorage.removeItem(USER_KEY);}catch{}}
function loadCurrentUser(){try{const value=JSON.parse(localStorage.getItem(USER_KEY));return value&&typeof value==='object'?value:null;}catch{return null;}}
function makeInitials(name){return String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();}
function formatDate(value){if(!value)return'';return new Date(value).toLocaleDateString('es-PR',{month:'short',day:'numeric',year:'numeric'});}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function translateAuthError(error){const code=error?.code||'';if(code.includes('invalid-credential'))return'Correo o contraseña incorrectos.';if(code.includes('too-many-requests'))return'Demasiados intentos. Intenta más tarde.';if(code.includes('network-request-failed'))return'No hay conexión con Firebase.';return error?.message||'No se pudo iniciar sesión.';}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

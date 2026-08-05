const ACTIVITY_KEY = 'neighbor-terra-lugo-activity';
const SESSION_KEY = 'neighbor-terra-lugo-session';

const profiles = {
  resident: {
    name: 'Eliezel', initials: 'EV', badge: 'Neighbor Resident', title: 'Tu comunidad, conectada.',
    text: 'Registra visitas, consulta paquetes y gestiona tu residencia.', actionsTitle: 'Acciones principales',
    actions: [
      ['packages','📦','Paquetes','Registrar o consultar'], ['visits','🚗','Registrar visita','Crear autorización'],
      ['reservations','📅','Reservar gazebo','Solicitar fecha'], ['announcements','📢','Avisos','Ver comunicados'],
      ['account','💳','Estado de cuenta','Al día ✓','good'], ['incidents','🛠️','Reportar incidencia','Crear reporte']
    ],
    nav: [['inicio','⌂','Inicio'],['visits','🚗','Visitas'],['packages','📦','Paquetes'],['announcements','🔔','Avisos'],['profile','◎','Perfil']]
  },
  guard: {
    name: 'Seguridad', initials: 'SG', badge: 'Neighbor Guard', title: 'Control de acceso rápido.',
    text: 'Entradas, paquetes e incidentes sin menús complicados.', actionsTitle: 'Operaciones del portón',
    actions: [
      ['scan','▣','Escanear QR','Validar autorización'], ['entry','🚗','Registrar entrada','Visita sin QR'],
      ['packages','📦','Registrar paquete','Notificar residente'], ['directory','🏠','Buscar residencia','Consultar autorización'],
      ['incidents','🚨','Reportar incidente','Crear alerta'], ['history','🕘','Historial de turno','Ver actividad']
    ],
    nav: [['inicio','⌂','Inicio'],['scan','▣','Escanear'],['entry','🚗','Entradas'],['packages','📦','Paquetes'],['profile','◎','Perfil']]
  },
  admin: {
    name: 'Administración', initials: 'AD', badge: 'Neighbor Admin', title: 'Terra Lugo bajo control.',
    text: 'Gestiona residentes, comunicados, cobros e incidencias.', actionsTitle: 'Centro de administración',
    actions: [
      ['residents','👥','Residentes','145 residencias'], ['announcements','📢','Comunicados','Publicar aviso'],
      ['finance','💳','Finanzas','$12,480 cobrados','good'], ['incidents','🛠️','Incidencias','4 abiertas'],
      ['reservations','📅','Reservaciones','3 pendientes'], ['reports','📊','Reportes','Ver métricas']
    ],
    nav: [['inicio','⌂','Inicio'],['residents','👥','Residentes'],['finance','💳','Finanzas'],['incidents','🛠️','Casos'],['profile','◎','Perfil']]
  }
};

const seedActivity = [
  { icon:'📦', title:'Paquete recibido', detail:'Amazon · Unidad A-12', time:'10:24 AM' },
  { icon:'📢', title:'Aviso de administración', detail:'Mantenimiento de áreas comunes', time:'9:10 AM' },
  { icon:'🚗', title:'Visita autorizada', detail:'Juan Pérez · válida por 2 horas', time:'8:45 AM' }
];

let currentRole = localStorage.getItem(SESSION_KEY) || null;
let activity = loadActivity();

const loginScreen = document.querySelector('#loginScreen');
const appShell = document.querySelector('#appShell');
const bottomNav = document.querySelector('#bottomNav');
const actionGrid = document.querySelector('#actionGrid');
const timeline = document.querySelector('#timeline');
const dialog = document.querySelector('#featureDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogBody = document.querySelector('#dialogBody');
const dialogEyebrow = document.querySelector('#dialogEyebrow');
const dialogForm = document.querySelector('#dialogForm');

if (currentRole && profiles[currentRole]) enterApp(currentRole);

document.querySelectorAll('[data-role]').forEach((button) => button.addEventListener('click', () => enterApp(button.dataset.role)));
document.querySelector('#changeRole').addEventListener('click', logout);
document.querySelector('#avatarButton').addEventListener('click', () => openModule('profile'));
document.querySelector('#clearActivity').addEventListener('click', () => { activity=[]; saveActivity(); renderTimeline(); });

function enterApp(role) {
  currentRole = role;
  localStorage.setItem(SESSION_KEY, role);
  loginScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
  bottomNav.classList.remove('hidden');
  renderProfile(); renderActions(); renderTimeline(); renderNav();
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  currentRole = null;
  appShell.classList.add('hidden');
  bottomNav.classList.add('hidden');
  loginScreen.classList.remove('hidden');
}

function renderProfile() {
  const p = profiles[currentRole];
  document.querySelector('#userName').textContent = p.name;
  document.querySelector('#avatarButton').textContent = p.initials;
  document.querySelector('#roleBadge').textContent = p.badge;
  document.querySelector('#heroTitle').textContent = p.title;
  document.querySelector('#heroText').textContent = p.text;
  document.querySelector('#actionsTitle').textContent = p.actionsTitle;
}

function renderActions() {
  actionGrid.innerHTML = '';
  profiles[currentRole].actions.forEach(([id,icon,title,detail,status]) => {
    const button = document.createElement('button');
    button.className = 'action-card'; button.type = 'button';
    if (status) button.dataset.status = status;
    button.innerHTML = `<span class="action-icon">${icon}</span><strong>${title}</strong><small>${detail}</small>`;
    button.addEventListener('click', () => openModule(id));
    actionGrid.appendChild(button);
  });
}

function renderNav() {
  bottomNav.innerHTML = '';
  profiles[currentRole].nav.forEach(([id,icon,label], index) => {
    const button = document.createElement('button');
    button.className = `nav-item${index===0?' active':''}`; button.type='button'; button.dataset.route=id;
    button.innerHTML = `<span>${icon}</span>${label}`;
    button.addEventListener('click', () => {
      bottomNav.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      button.classList.add('active');
      if (id !== 'inicio') openModule(id);
    });
    bottomNav.appendChild(button);
  });
}

function renderTimeline() {
  timeline.innerHTML = '';
  if (!activity.length) { timeline.innerHTML='<div class="empty-state">Todavía no hay actividad registrada.</div>'; return; }
  activity.forEach(item => {
    const row=document.createElement('article'); row.className='timeline-item';
    row.innerHTML=`<span class="timeline-icon">${item.icon}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div><time>${item.time}</time>`;
    timeline.appendChild(row);
  });
}

function openModule(id) {
  const modules = { visits:visitForm, entry:entryForm, packages:packageForm, reservations:reservationForm, incidents:incidentForm,
    announcements:announcementsView, account:accountView, finance:financeView, residents:residentsView,
    scan:scanView, directory:directoryView, history:historyView, reports:reportsView, profile:profileView };
  (modules[id] || infoView)(id); dialog.showModal();
}

function visitForm(){ setDialog('Control de acceso','Registrar visita',`<label>Nombre del visitante<input name="visitor" required placeholder="Ej. Juan Pérez"></label><label>Fecha y hora<input name="visitDate" type="datetime-local" required></label><label>Tipo de acceso<select name="access"><option>Una entrada</option><option>Acceso durante el día</option><option>Servicio o delivery</option></select></label><button class="primary-button" type="submit">Autorizar visita</button>`,d=>addActivity('🚗','Visita autorizada',`${d.visitor} · ${formatDate(d.visitDate)}`)); }
function entryForm(){ setDialog('Neighbor Guard','Registrar entrada',`<label>Nombre del visitante<input name="visitor" required></label><label>Residencia<input name="home" required placeholder="Ej. A-12"></label><label>Tablilla<input name="plate" placeholder="Opcional"></label><button class="primary-button" type="submit">Registrar entrada</button>`,d=>addActivity('🚗','Entrada registrada',`${d.visitor} · Unidad ${d.home}`)); }
function packageForm(){ setDialog('Paquetería','Registrar paquete',`<label>Compañía<select name="carrier"><option>Amazon</option><option>USPS</option><option>UPS</option><option>FedEx</option><option>Otra</option></select></label><label>Residencia<input name="home" required placeholder="Ej. A-12"></label><label>Nota<input name="note" placeholder="Opcional"></label><button class="primary-button" type="submit">Registrar paquete</button>`,d=>addActivity('📦','Paquete registrado',`${d.carrier} · Unidad ${d.home}`)); }
function reservationForm(){ setDialog('Áreas comunes','Solicitar reservación',`<label>Área<select name="area"><option>Gazebo</option><option>Cancha</option><option>Área recreativa</option></select></label><label>Fecha<input name="date" type="date" required></label><label>Horario<select name="time"><option>9:00 AM – 1:00 PM</option><option>2:00 PM – 6:00 PM</option><option>6:00 PM – 10:00 PM</option></select></label><button class="primary-button" type="submit">Enviar solicitud</button>`,d=>addActivity('📅','Reservación solicitada',`${d.area} · ${formatDate(d.date)}`)); }
function incidentForm(){ setDialog('Mantenimiento y seguridad','Reportar incidencia',`<label>Categoría<select name="category"><option>Alumbrado</option><option>Seguridad</option><option>Áreas comunes</option><option>Basura</option><option>Otra</option></select></label><label>Descripción<textarea name="description" required></textarea></label><label>Ubicación<input name="location" required></label><button class="primary-button" type="submit">Enviar reporte</button>`,d=>addActivity('🛠️','Incidencia reportada',`${d.category} · ${d.location}`)); }

function announcementsView(){ setDialog('Comunicados','Avisos recientes',listHtml([['Mantenimiento del portón','Miércoles de 9:00 AM a 11:00 AM.'],['Reunión comunitaria','Viernes a las 7:00 PM en el gazebo.'],['Recogido de reciclaje','Antes de las 7:00 AM.']])); }
function accountView(){ setDialog('Finanzas','Estado de cuenta',`<div class="balance-card"><span>Balance actual</span><strong>$0.00</strong><small>Cuenta al día</small></div>${listHtml([['Cuota de agosto','Pagada · Recibo #TL-0826-014']])}`); }
function financeView(){ setDialog('Neighbor Admin','Resumen financiero',`<div class="metric-grid"><div><span>Cobrado</span><strong>$12,480</strong></div><div><span>Pendiente</span><strong>$1,275</strong></div></div>${listHtml([['Pagos procesados','132'],['Cuentas pendientes','13']])}`); }
function residentsView(){ setDialog('Neighbor Admin','Residentes',`<label>Buscar<input placeholder="Nombre, unidad o teléfono"></label>${listHtml([['A-12 · Familia Rivera','4 residentes · 2 vehículos'],['B-07 · Carmen López','2 residentes · 1 vehículo'],['C-21 · José Martínez','3 residentes · 2 vehículos']])}`); }
function scanView(){ setDialog('Neighbor Guard','Escanear QR',`<div class="scanner-demo"><span>▣</span><strong>Cámara de demostración</strong><p>La lectura real se conectará en Firebase/PWA.</p></div><button class="primary-button" type="button" onclick="document.querySelector('#featureDialog').close()">Cerrar</button>`); }
function directoryView(){ setDialog('Directorio','Buscar residencia',`<label>Unidad o residente<input placeholder="Ej. A-12"></label>${listHtml([['A-12','Residente autorizado · Acceso activo'],['A-13','Sin visitas pendientes']])}`); }
function historyView(){ setDialog('Neighbor Guard','Historial de turno',listHtml(activity.slice(0,6).map(i=>[i.title,`${i.detail} · ${i.time}`]))); }
function reportsView(){ setDialog('Neighbor Admin','Reportes',`<div class="metric-grid"><div><span>Visitas hoy</span><strong>38</strong></div><div><span>Paquetes</span><strong>12</strong></div><div><span>Incidencias</span><strong>4</strong></div><div><span>Reservas</span><strong>3</strong></div></div>`); }
function profileView(){ const p=profiles[currentRole]; setDialog(p.badge,'Perfil',listHtml([[p.name,`${p.badge} · Terra Lugo`],['Sesión','Prototipo local activo'],['Seguridad','Firebase Authentication será la próxima integración']])); }
function infoView(name){ setDialog('Neighbor Alpha',name,'<p>Este módulo está dentro del roadmap.</p>'); }

function setDialog(eyebrow,title,html,onSubmit){ dialogEyebrow.textContent=eyebrow; dialogTitle.textContent=title; dialogBody.innerHTML=html; dialogForm.onsubmit=e=>{ if(!onSubmit)return; e.preventDefault(); const data=Object.fromEntries(new FormData(dialogForm).entries()); onSubmit(data); dialog.close(); dialogForm.reset(); }; }
function listHtml(items){ return `<div class="module-list">${items.map(([a,b])=>`<article><strong>${escapeHtml(a)}</strong><p>${escapeHtml(b)}</p></article>`).join('')}</div>`; }
function addActivity(icon,title,detail){ activity.unshift({icon,title,detail,time:new Date().toLocaleTimeString('es-PR',{hour:'numeric',minute:'2-digit'})}); activity=activity.slice(0,15); saveActivity(); renderTimeline(); }
function saveActivity(){ localStorage.setItem(ACTIVITY_KEY,JSON.stringify(activity)); }
function loadActivity(){ try{ const saved=JSON.parse(localStorage.getItem(ACTIVITY_KEY)); return Array.isArray(saved)?saved:seedActivity; }catch{return seedActivity;} }
function formatDate(value){ if(!value)return''; return new Date(value).toLocaleDateString('es-PR',{month:'short',day:'numeric',year:'numeric'}); }
function escapeHtml(value){ return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

const STORAGE_KEY = 'neighbor-terra-lugo-activity';

const actions = [
  { id: 'packages', icon: '📦', title: 'Paquetes', detail: 'Registrar o consultar' },
  { id: 'visits', icon: '🚗', title: 'Registrar visita', detail: 'Crear autorización' },
  { id: 'reservations', icon: '📅', title: 'Reservar gazebo', detail: 'Solicitar fecha' },
  { id: 'announcements', icon: '📢', title: 'Avisos', detail: 'Ver comunicados' },
  { id: 'account', icon: '💳', title: 'Estado de cuenta', detail: 'Al día ✓', status: 'good' },
  { id: 'incidents', icon: '🛠️', title: 'Reportar incidencia', detail: 'Crear reporte' }
];

const seedActivity = [
  { icon: '📦', title: 'Paquete recibido', detail: 'Amazon · Unidad A-12', time: '10:24 AM' },
  { icon: '📢', title: 'Aviso de administración', detail: 'Mantenimiento de áreas comunes', time: '9:10 AM' },
  { icon: '🚗', title: 'Visita autorizada', detail: 'Juan Pérez · válida por 2 horas', time: '8:45 AM' }
];

let activity = loadActivity();

const actionGrid = document.querySelector('#actionGrid');
const timeline = document.querySelector('#timeline');
const dialog = document.querySelector('#featureDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogBody = document.querySelector('#dialogBody');
const dialogEyebrow = document.querySelector('#dialogEyebrow');

renderActions();
renderTimeline();

function renderActions() {
  actionGrid.innerHTML = '';
  actions.forEach((action) => {
    const button = document.createElement('button');
    button.className = 'action-card';
    button.type = 'button';
    if (action.status) button.dataset.status = action.status;
    button.innerHTML = `<span class="action-icon">${action.icon}</span><strong>${action.title}</strong><small>${action.detail}</small>`;
    button.addEventListener('click', () => openModule(action.id));
    actionGrid.appendChild(button);
  });
}

function renderTimeline() {
  timeline.innerHTML = '';
  if (!activity.length) {
    timeline.innerHTML = '<div class="empty-state">Todavía no hay actividad. Registra una visita, paquete, reserva o incidencia.</div>';
    return;
  }
  activity.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'timeline-item';
    row.innerHTML = `<span class="timeline-icon">${item.icon}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div><time>${item.time}</time>`;
    timeline.appendChild(row);
  });
}

function openModule(id) {
  const modules = {
    visits: visitForm,
    packages: packageForm,
    reservations: reservationForm,
    incidents: incidentForm,
    announcements: announcementsView,
    account: accountView,
    perfil: profileView
  };
  (modules[id] || infoView)(id);
  dialog.showModal();
}

function visitForm() {
  setDialog('Control de acceso', 'Registrar visita', `
    <label>Nombre del visitante<input name="visitor" required placeholder="Ej. Juan Pérez"></label>
    <label>Fecha y hora<input name="visitDate" type="datetime-local" required></label>
    <label>Tipo de acceso<select name="access"><option>Una entrada</option><option>Acceso durante el día</option><option>Servicio o delivery</option></select></label>
    <button class="primary-button" type="submit">Autorizar visita</button>
  `, (data) => addActivity('🚗', 'Visita autorizada', `${data.visitor} · ${formatDate(data.visitDate)}`));
}

function packageForm() {
  setDialog('Paquetería', 'Registrar paquete', `
    <label>Compañía<select name="carrier"><option>Amazon</option><option>USPS</option><option>UPS</option><option>FedEx</option><option>Otra</option></select></label>
    <label>Residencia<input name="home" required placeholder="Ej. A-12"></label>
    <label>Nota opcional<input name="note" placeholder="Caja grande, requiere firma..."></label>
    <button class="primary-button" type="submit">Registrar paquete</button>
  `, (data) => addActivity('📦', 'Paquete registrado', `${data.carrier} · Unidad ${data.home}`));
}

function reservationForm() {
  setDialog('Áreas comunes', 'Solicitar reservación', `
    <label>Área<select name="area"><option>Gazebo</option><option>Cancha</option><option>Área recreativa</option></select></label>
    <label>Fecha<input name="date" type="date" required></label>
    <label>Horario<select name="time"><option>9:00 AM – 1:00 PM</option><option>2:00 PM – 6:00 PM</option><option>6:00 PM – 10:00 PM</option></select></label>
    <button class="primary-button" type="submit">Enviar solicitud</button>
  `, (data) => addActivity('📅', 'Reservación solicitada', `${data.area} · ${formatDate(data.date)} · ${data.time}`));
}

function incidentForm() {
  setDialog('Mantenimiento y seguridad', 'Reportar incidencia', `
    <label>Categoría<select name="category"><option>Alumbrado</option><option>Seguridad</option><option>Áreas comunes</option><option>Basura</option><option>Otra</option></select></label>
    <label>Descripción<textarea name="description" required placeholder="Describe brevemente lo ocurrido"></textarea></label>
    <label>Ubicación<input name="location" required placeholder="Ej. Entrada principal"></label>
    <button class="primary-button" type="submit">Enviar reporte</button>
  `, (data) => addActivity('🛠️', 'Incidencia reportada', `${data.category} · ${data.location}`));
}

function announcementsView() {
  setDialog('Comunicados', 'Avisos recientes', `<div class="module-list"><article><strong>Mantenimiento del portón</strong><p>Miércoles de 9:00 AM a 11:00 AM.</p></article><article><strong>Reunión comunitaria</strong><p>Viernes a las 7:00 PM en el gazebo.</p></article><article><strong>Recogido de reciclaje</strong><p>Coloque el material antes de las 7:00 AM.</p></article></div>`);
}

function accountView() {
  setDialog('Finanzas', 'Estado de cuenta', `<div class="balance-card"><span>Balance actual</span><strong>$0.00</strong><small>Cuenta al día</small></div><div class="module-list"><article><strong>Cuota de agosto</strong><p>Pagada · Recibo #TL-0826-014</p></article></div>`);
}

function profileView() {
  setDialog('Mi residencia', 'Perfil', `<div class="module-list"><article><strong>Eliezel Velázquez</strong><p>Residente autorizado · Terra Lugo</p></article><article><strong>Unidad</strong><p>Pendiente de configurar</p></article><article><strong>Vehículos</strong><p>Añadir vehículos en una próxima versión.</p></article></div>`);
}

function infoView(name) {
  setDialog('Neighbor Alpha', name, '<p>Este módulo está dentro del roadmap del proyecto.</p>');
}

function setDialog(eyebrow, title, html, onSubmit) {
  dialogEyebrow.textContent = eyebrow;
  dialogTitle.textContent = title;
  dialogBody.innerHTML = html;
  const form = document.querySelector('#dialogForm');
  form.onsubmit = (event) => {
    if (!onSubmit) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    onSubmit(data);
    dialog.close();
    form.reset();
  };
}

function addActivity(icon, title, detail) {
  activity.unshift({ icon, title, detail, time: new Date().toLocaleTimeString('es-PR', { hour: 'numeric', minute: '2-digit' }) });
  activity = activity.slice(0, 12);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(activity));
  renderTimeline();
}

function loadActivity() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : seedActivity;
  } catch {
    return seedActivity;
  }
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

document.querySelector('#clearActivity').addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  activity = [];
  renderTimeline();
});

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((node) => node.classList.remove('active'));
    item.classList.add('active');
    const route = item.dataset.route;
    if (route === 'visitas') openModule('visits');
    if (route === 'paquetes') openModule('packages');
    if (route === 'avisos') openModule('announcements');
    if (route === 'perfil') openModule('perfil');
  });
});

const actions = [
  { icon: '📦', title: 'Paquetes', detail: '2 pendientes', status: 'alert' },
  { icon: '🚗', title: 'Registrar visita', detail: 'Crear autorización' },
  { icon: '📅', title: 'Reservar gazebo', detail: 'Ver disponibilidad', status: 'good' },
  { icon: '📢', title: 'Avisos', detail: '3 nuevos', status: 'alert' },
  { icon: '💳', title: 'Estado de cuenta', detail: 'Al día ✓', status: 'good' },
  { icon: '🛠️', title: 'Reportar incidencia', detail: 'Crear reporte' }
];

const activity = [
  { icon: '📦', title: 'Paquete recibido', detail: 'Amazon · Unidad A-12', time: '10:24 AM' },
  { icon: '📢', title: 'Aviso de administración', detail: 'Mantenimiento de áreas comunes', time: '9:10 AM' },
  { icon: '🚗', title: 'Visita autorizada', detail: 'Juan Pérez · válida por 2 horas', time: '8:45 AM' }
];

const actionGrid = document.querySelector('#actionGrid');
const timeline = document.querySelector('#timeline');
const dialog = document.querySelector('#featureDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogText = document.querySelector('#dialogText');

actions.forEach((action) => {
  const button = document.createElement('button');
  button.className = 'action-card';
  button.type = 'button';
  if (action.status) button.dataset.status = action.status;
  button.innerHTML = `
    <span class="action-icon">${action.icon}</span>
    <strong>${action.title}</strong>
    <small>${action.detail}</small>
  `;
  button.addEventListener('click', () => openModule(action.title));
  actionGrid.appendChild(button);
});

activity.forEach((item) => {
  const row = document.createElement('article');
  row.className = 'timeline-item';
  row.innerHTML = `
    <span class="timeline-icon">${item.icon}</span>
    <div><strong>${item.title}</strong><p>${item.detail}</p></div>
    <time>${item.time}</time>
  `;
  timeline.appendChild(row);
});

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((node) => node.classList.remove('active'));
    item.classList.add('active');
    if (item.dataset.route !== 'inicio') openModule(item.textContent.trim());
  });
});

function openModule(name) {
  dialogTitle.textContent = name;
  dialogText.textContent = `${name} ya forma parte del prototipo. En el siguiente sprint conectaremos formularios, almacenamiento local y Firebase.`;
  dialog.showModal();
}

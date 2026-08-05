import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

const LOCAL_KEY = 'neighbor-terra-lugo-users';
const dialog = document.querySelector('#featureDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogEyebrow = document.querySelector('#dialogEyebrow');
const dialogBody = document.querySelector('#dialogBody');
const dialogForm = document.querySelector('#dialogForm');

let users = [];
let db = null;
let auth = null;
let functions = null;
let firebaseAvailable = false;

const roles = {
  admin: 'Administrador',
  board: 'Junta',
  guard: 'Seguridad',
  maintenance: 'Mantenimiento',
  resident: 'Residente',
  viewer: 'Solo lectura'
};

initializeAccess();

document.addEventListener('click', async (event) => {
  const card = event.target.closest('[data-neighbor-users]');
  if (!card) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await openUsers();
}, true);

async function initializeAccess() {
  try {
    const appModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const firestoreModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    const functionsModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js');
    const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
    auth = authModule.getAuth(app);
    db = firestoreModule.getFirestore(app);
    functions = functionsModule.getFunctions(app, 'us-east1');
    firebaseAvailable = true;
  } catch (error) {
    console.warn('Usuarios y roles operarán en modo local.', error);
  }
}

function rootPath() { return ['apps', APP_NAMESPACE, 'communities', COMMUNITY_ID]; }

async function openUsers() {
  dialogEyebrow.textContent = 'Neighbor Admin';
  dialogTitle.textContent = 'Usuarios y roles';
  dialogBody.innerHTML = '<div class="empty-state">Cargando usuarios…</div>';
  dialog.showModal();
  try {
    users = firebaseAvailable && auth?.currentUser ? await listFirebaseUsers() : loadLocalUsers();
    renderUsers();
  } catch (error) {
    dialogBody.innerHTML = `<div class="empty-state">${escapeHtml(error.message || 'No se pudieron cargar los usuarios.')}</div>`;
  }
}

async function listFirebaseUsers() {
  const { collection, getDocs, orderBy, query } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  const snapshot = await getDocs(query(collection(db, ...rootPath(), 'users'), orderBy('name')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function renderUsers(filter = '') {
  const queryText = filter.trim().toLowerCase();
  const filtered = users.filter((user) => `${user.name || ''} ${user.email || ''} ${user.role || ''} ${user.status || ''}`.toLowerCase().includes(queryText));
  dialogTitle.textContent = 'Usuarios y roles';
  dialogForm.onsubmit = null;
  dialogBody.innerHTML = `
    <div class="homes-toolbar">
      <input id="userAccessSearch" type="search" placeholder="Nombre, correo o rol" value="${escapeHtml(filter)}">
      <button class="primary-button compact-button" id="newUserButton" type="button">+ Nuevo usuario</button>
    </div>
    <div class="module-list">
      ${filtered.length ? filtered.map(userRow).join('') : '<div class="empty-state">No hay usuarios registrados.</div>'}
    </div>`;
  document.querySelector('#userAccessSearch').addEventListener('input', (event) => renderUsers(event.target.value));
  document.querySelector('#newUserButton').addEventListener('click', showNewUserForm);
  document.querySelectorAll('[data-edit-access]').forEach((button) => button.addEventListener('click', () => showAccessForm(button.dataset.editAccess)));
  document.querySelectorAll('[data-reset-access]').forEach((button) => button.addEventListener('click', () => sendAccessEmail(button.dataset.resetAccess)));
}

function userRow(user) {
  const status = user.status === 'inactive' ? 'Inactivo' : user.status === 'pending' ? 'Pendiente' : 'Activo';
  const id = escapeHtml(user.id || user.uid);
  return `<article class="home-row"><div><strong>${escapeHtml(user.name || user.email || 'Usuario')}</strong><p>${escapeHtml(user.email || 'Sin correo')} · ${escapeHtml(roles[user.role] || user.role || 'Sin rol')} · ${status}</p></div><div class="row-actions"><button type="button" data-reset-access="${id}">Enviar acceso</button><button type="button" data-edit-access="${id}">Editar</button></div></article>`;
}

function showNewUserForm() {
  dialogTitle.textContent = 'Nuevo usuario';
  dialogBody.innerHTML = `
    <label>Nombre completo<input name="name" required placeholder="Nombre y apellidos"></label>
    <label>Correo electrónico<input name="email" type="email" required placeholder="nombre@correo.com"></label>
    <div class="form-grid"><label>Unidad<input name="homeId" placeholder="Ej. B-24"></label><label>Teléfono<input name="phone" type="tel" placeholder="787-000-0000"></label></div>
    <label>Rol<select name="role">${Object.entries(roles).map(([value, label]) => `<option value="${value}" ${value === 'resident' ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <div class="form-actions"><button class="secondary-button" id="cancelNewUser" type="button">Cancelar</button><button class="primary-button" type="submit">Crear cuenta</button></div>
    <p class="form-message" id="newUserMessage"></p>`;
  document.querySelector('#cancelNewUser').addEventListener('click', () => renderUsers());
  dialogForm.onsubmit = createUser;
}

async function createUser(event) {
  event.preventDefault();
  const message = document.querySelector('#newUserMessage');
  const data = Object.fromEntries(new FormData(dialogForm).entries());
  message.textContent = 'Creando cuenta…';
  try {
    if (!firebaseAvailable || !auth?.currentUser || !functions) throw new Error('Firebase Functions no está disponible.');
    const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js');
    await httpsCallable(functions, 'createNeighborUser')(data);
    await sendPasswordReset(data.email);
    users = await listFirebaseUsers();
    renderUsers();
  } catch (error) {
    message.textContent = cleanFunctionError(error);
  }
}

function showAccessForm(id) {
  const user = users.find((item) => (item.id || item.uid) === id);
  if (!user) return;
  dialogTitle.textContent = `Acceso de ${user.name || user.email}`;
  dialogBody.innerHTML = `
    <div class="module-list"><article><strong>${escapeHtml(user.name || 'Usuario')}</strong><p>${escapeHtml(user.email || '')}</p></article></div>
    <label>Rol<select name="role">${Object.entries(roles).map(([value, label]) => `<option value="${value}" ${user.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <label>Estado<select name="status"><option value="active" ${user.status === 'active' ? 'selected' : ''}>Activo</option><option value="pending" ${user.status === 'pending' ? 'selected' : ''}>Pendiente</option><option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Inactivo</option></select></label>
    <div class="form-actions"><button class="secondary-button" id="cancelAccessEdit" type="button">Cancelar</button><button class="primary-button" type="submit">Guardar acceso</button></div>
    <p class="form-message" id="accessMessage"></p>`;
  document.querySelector('#cancelAccessEdit').addEventListener('click', () => renderUsers());
  dialogForm.onsubmit = (event) => saveAccess(event, user);
}

async function saveAccess(event, user) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(dialogForm).entries());
  const message = document.querySelector('#accessMessage');
  message.textContent = 'Guardando…';
  try {
    if (firebaseAvailable && auth?.currentUser && functions) {
      const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js');
      await httpsCallable(functions, 'updateNeighborUserAccess')({ uid: user.id || user.uid, role: data.role, status: data.status });
      users = await listFirebaseUsers();
    } else {
      users = users.map((item) => (item.id || item.uid) === (user.id || user.uid) ? { ...item, role: data.role, status: data.status } : item);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(users));
    }
    renderUsers();
  } catch (error) {
    message.textContent = cleanFunctionError(error);
  }
}

async function sendAccessEmail(id) {
  const user = users.find((item) => (item.id || item.uid) === id);
  if (!user?.email) return alert('Este usuario no tiene correo.');
  try {
    await sendPasswordReset(user.email);
    alert(`Enlace de acceso enviado a ${user.email}.`);
  } catch (error) {
    alert(error.message || 'No se pudo enviar el acceso.');
  }
}

async function sendPasswordReset(email) {
  const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
  await sendPasswordResetEmail(auth, String(email || '').trim().toLowerCase());
}

function loadLocalUsers() {
  try { const saved = JSON.parse(localStorage.getItem(LOCAL_KEY)); if (Array.isArray(saved) && saved.length) return saved; } catch {}
  const seed = [
    { id: 'demo-admin', name: 'Administración', email: 'admin@terralugo.demo', role: 'admin', status: 'active' },
    { id: 'demo-guard', name: 'Seguridad', email: 'seguridad@terralugo.demo', role: 'guard', status: 'active' },
    { id: 'demo-resident', name: 'Eliezel', email: 'residente@terralugo.demo', role: 'resident', status: 'active' }
  ];
  localStorage.setItem(LOCAL_KEY, JSON.stringify(seed));
  return seed;
}

function cleanFunctionError(error) {
  return String(error?.message || 'No se pudo completar la operación.').replace(/^FirebaseError:\s*/i, '').replace(/^functions\/[\w-]+:\s*/i, '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

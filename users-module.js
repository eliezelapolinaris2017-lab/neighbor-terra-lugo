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
    const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
    auth = authModule.getAuth(app);
    db = firestoreModule.getFirestore(app);
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
  } catch (error) {
    console.error(error);
    dialogBody.innerHTML = `<div class="empty-state">${escapeHtml(error.message || 'No se pudieron cargar los usuarios.')}</div>`;
    return;
  }
  renderUsers();
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
  dialogBody.innerHTML = `
    <label>Buscar usuario<input id="userAccessSearch" type="search" placeholder="Nombre, correo o rol" value="${escapeHtml(filter)}"></label>
    <div class="module-list">
      ${filtered.length ? filtered.map(userRow).join('') : '<div class="empty-state">No hay usuarios registrados.</div>'}
    </div>`;
  document.querySelector('#userAccessSearch').addEventListener('input', (event) => renderUsers(event.target.value));
  document.querySelectorAll('[data-edit-access]').forEach((button) => button.addEventListener('click', () => showAccessForm(button.dataset.editAccess)));
  document.querySelectorAll('[data-activate-user]').forEach((button) => button.addEventListener('click', () => activateUser(button.dataset.activateUser)));
  document.querySelectorAll('[data-send-access]').forEach((button) => button.addEventListener('click', () => sendAccessEmail(button.dataset.sendAccess)));
}

function userRow(user) {
  const status = user.status === 'inactive' ? 'Inactivo' : user.status === 'pending' ? 'Pendiente' : 'Activo';
  const id = escapeHtml(user.id || user.uid);
  return `
    <article class="home-row">
      <div>
        <strong>${escapeHtml(user.name || user.email || 'Usuario')}</strong>
        <p>${escapeHtml(user.email || 'Sin correo')} · ${escapeHtml(roles[user.role] || user.role || 'Sin rol')} · ${status}</p>
      </div>
      <div class="row-actions">
        ${user.email ? `<button type="button" data-send-access="${id}">Enviar acceso</button>` : ''}
        ${user.status === 'pending' ? `<button type="button" data-activate-user="${id}">Activar</button>` : ''}
        <button type="button" data-edit-access="${id}">Editar</button>
      </div>
    </article>`;
}

async function sendAccessEmail(id) {
  const user = users.find((item) => (item.id || item.uid) === id);
  if (!user?.email || !firebaseAvailable) return;
  try {
    const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    await sendPasswordResetEmail(auth, user.email);
    alert(`Enlace enviado a ${user.email}.`);
  } catch (error) {
    console.error(error);
    alert('No se pudo enviar. Verifica que ese correo exista en Firebase Authentication.');
  }
}

async function activateUser(id) {
  const user = users.find((item) => (item.id || item.uid) === id);
  if (!user) return;
  try {
    await persistAccess(user, user.role || 'resident', 'active');
    users = firebaseAvailable && auth?.currentUser ? await listFirebaseUsers() : users.map((item) => (item.id || item.uid) === id ? { ...item, status: 'active' } : item);
    if (!firebaseAvailable || !auth?.currentUser) localStorage.setItem(LOCAL_KEY, JSON.stringify(users));
    renderUsers();
  } catch (error) {
    alert(error.message || 'No se pudo activar el usuario.');
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
  const adminCount = users.filter((item) => item.role === 'admin' && item.status !== 'inactive').length;
  if (user.role === 'admin' && data.role !== 'admin' && adminCount <= 1) {
    message.textContent = 'Debe permanecer al menos un administrador activo.';
    return;
  }
  message.textContent = 'Guardando…';
  try {
    await persistAccess(user, data.role, data.status);
    users = firebaseAvailable && auth?.currentUser ? await listFirebaseUsers() : users.map((item) => (item.id || item.uid) === (user.id || user.uid) ? { ...item, role: data.role, status: data.status } : item);
    if (!firebaseAvailable || !auth?.currentUser) localStorage.setItem(LOCAL_KEY, JSON.stringify(users));
    renderUsers();
  } catch (error) {
    message.textContent = error.message || 'No se pudo actualizar el acceso.';
  }
}

async function persistAccess(user, role, status) {
  if (firebaseAvailable && auth?.currentUser) {
    const { addDoc, collection, doc, serverTimestamp, updateDoc } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    await updateDoc(doc(db, ...rootPath(), 'users', user.id || user.uid), { role, status, updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
    await addDoc(collection(db, ...rootPath(), 'activity'), {
      type: 'role-change', icon: '🔐', title: 'Acceso actualizado',
      detail: `${user.name || user.email}: ${roles[role]} · ${status}`,
      targetUserId: user.id || user.uid, userId: auth.currentUser.uid,
      communityId: COMMUNITY_ID, createdAt: serverTimestamp()
    });
  }
}

function loadLocalUsers() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  const seed = [
    { id: 'demo-admin', name: 'Administración', email: 'admin@terralugo.demo', role: 'admin', status: 'active' },
    { id: 'demo-guard', name: 'Seguridad', email: 'seguridad@terralugo.demo', role: 'guard', status: 'active' },
    { id: 'demo-resident', name: 'Eliezel', email: 'residente@terralugo.demo', role: 'resident', status: 'active' }
  ];
  localStorage.setItem(LOCAL_KEY, JSON.stringify(seed));
  return seed;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

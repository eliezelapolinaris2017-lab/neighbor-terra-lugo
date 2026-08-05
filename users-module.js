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
let firebaseAppModule = null;
let firebaseAuthModule = null;
let firestoreModule = null;

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
    firebaseAppModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    firebaseAuthModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    firestoreModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    const app = firebaseAppModule.getApps().length ? firebaseAppModule.getApp() : firebaseAppModule.initializeApp(firebaseConfig);
    auth = firebaseAuthModule.getAuth(app);
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
    renderUsers();
  } catch (error) {
    dialogBody.innerHTML = `<div class="empty-state">${escapeHtml(error.message || 'No se pudieron cargar los usuarios.')}</div>`;
  }
}

async function listFirebaseUsers() {
  const snapshot = await firestoreModule.getDocs(
    firestoreModule.query(
      firestoreModule.collection(db, ...rootPath(), 'users'),
      firestoreModule.orderBy('name')
    )
  );
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
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const homeId = String(data.homeId || '').trim().toUpperCase();
  const phone = String(data.phone || '').trim();
  const role = roles[data.role] ? data.role : 'resident';
  message.textContent = 'Creando cuenta…';

  try {
    if (!firebaseAvailable || !auth?.currentUser) throw new Error('Debes iniciar sesión como administrador.');
    if (!name || !email) throw new Error('Nombre y correo son requeridos.');
    if (users.some((user) => String(user.email || '').toLowerCase() === email)) throw new Error('Ese correo ya está registrado en Neighbor.');

    const temporaryPassword = createTemporaryPassword();
    const secondaryName = `neighbor-user-${Date.now()}`;
    const secondaryApp = firebaseAppModule.initializeApp(firebaseConfig, secondaryName);
    const secondaryAuth = firebaseAuthModule.getAuth(secondaryApp);
    let credential;

    try {
      credential = await firebaseAuthModule.createUserWithEmailAndPassword(secondaryAuth, email, temporaryPassword);
      await firebaseAuthModule.updateProfile(credential.user, { displayName: name });
    } finally {
      await firebaseAuthModule.signOut(secondaryAuth).catch(() => {});
      await firebaseAppModule.deleteApp(secondaryApp).catch(() => {});
    }

    const uid = credential.user.uid;
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    const batch = firestoreModule.writeBatch(db);
    const userRef = firestoreModule.doc(db, ...rootPath(), 'users', uid);

    batch.set(userRef, {
      uid, name, initials, email, phone, homeId, role,
      status: 'active', communityId: COMMUNITY_ID,
      createdBy: auth.currentUser.uid,
      createdAt: firestoreModule.serverTimestamp(),
      updatedAt: firestoreModule.serverTimestamp()
    }, { merge: true });

    if (role === 'resident') {
      const residentQuery = firestoreModule.query(
        firestoreModule.collection(db, ...rootPath(), 'residents'),
        firestoreModule.where('email', '==', email),
        firestoreModule.limit(1)
      );
      const residentSnapshot = await firestoreModule.getDocs(residentQuery);
      if (residentSnapshot.empty) {
        const residentRef = firestoreModule.doc(firestoreModule.collection(db, ...rootPath(), 'residents'));
        batch.set(residentRef, {
          name, email, phone, homeId, residentType: 'owner', status: 'active', userId: uid,
          createdBy: auth.currentUser.uid,
          createdAt: firestoreModule.serverTimestamp(),
          updatedAt: firestoreModule.serverTimestamp()
        });
      } else {
        batch.update(residentSnapshot.docs[0].ref, {
          userId: uid, status: 'active', updatedBy: auth.currentUser.uid,
          updatedAt: firestoreModule.serverTimestamp()
        });
      }
    }

    const activityRef = firestoreModule.doc(firestoreModule.collection(db, ...rootPath(), 'activity'));
    batch.set(activityRef, {
      type: 'user-created', icon: '👤', title: 'Usuario creado',
      detail: `${name} · ${email}`, targetUserId: uid,
      userId: auth.currentUser.uid, communityId: COMMUNITY_ID,
      createdAt: firestoreModule.serverTimestamp()
    });

    await batch.commit();
    await sendPasswordReset(email);
    users = await listFirebaseUsers();
    renderUsers();
    alert(`Cuenta creada. Se envió un enlace de acceso a ${email}.`);
  } catch (error) {
    message.textContent = cleanFirebaseError(error);
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
  const role = roles[data.role] ? data.role : 'resident';
  const status = ['active', 'pending', 'inactive'].includes(data.status) ? data.status : 'active';
  const activeAdmins = users.filter((item) => item.role === 'admin' && item.status === 'active');

  if (user.role === 'admin' && user.status === 'active' && (role !== 'admin' || status !== 'active') && activeAdmins.length <= 1) {
    message.textContent = 'Debe permanecer al menos un administrador activo.';
    return;
  }

  message.textContent = 'Guardando…';
  try {
    if (firebaseAvailable && auth?.currentUser) {
      const uid = user.id || user.uid;
      await firestoreModule.updateDoc(firestoreModule.doc(db, ...rootPath(), 'users', uid), {
        role, status, updatedBy: auth.currentUser.uid,
        updatedAt: firestoreModule.serverTimestamp()
      });
      await firestoreModule.addDoc(firestoreModule.collection(db, ...rootPath(), 'activity'), {
        type: 'access-updated', icon: '🔐', title: 'Acceso actualizado',
        detail: `${user.name || user.email} · ${role} · ${status}`,
        targetUserId: uid, userId: auth.currentUser.uid,
        communityId: COMMUNITY_ID, createdAt: firestoreModule.serverTimestamp()
      });
      users = await listFirebaseUsers();
    } else {
      users = users.map((item) => (item.id || item.uid) === (user.id || user.uid) ? { ...item, role, status } : item);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(users));
    }
    renderUsers();
  } catch (error) {
    message.textContent = cleanFirebaseError(error);
  }
}

async function sendAccessEmail(id) {
  const user = users.find((item) => (item.id || item.uid) === id);
  if (!user?.email) return alert('Este usuario no tiene correo.');
  try {
    await sendPasswordReset(user.email);
    alert(`Enlace de acceso enviado a ${user.email}.`);
  } catch (error) {
    alert(cleanFirebaseError(error));
  }
}

async function sendPasswordReset(email) {
  await firebaseAuthModule.sendPasswordResetEmail(auth, String(email || '').trim().toLowerCase());
}

function createTemporaryPassword() {
  const values = new Uint32Array(6);
  crypto.getRandomValues(values);
  return `N!${Array.from(values).map((value) => value.toString(36)).join('')}9a`;
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

function cleanFirebaseError(error) {
  const code = String(error?.code || '');
  if (code.includes('email-already-in-use')) return 'Ese correo ya tiene una cuenta en Firebase Authentication.';
  if (code.includes('permission-denied')) return 'No tienes permiso para realizar esta acción.';
  if (code.includes('weak-password')) return 'Firebase rechazó la contraseña temporal.';
  if (code.includes('network-request-failed')) return 'No hay conexión con Firebase.';
  return String(error?.message || 'No se pudo completar la operación.').replace(/^FirebaseError:\s*/i, '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

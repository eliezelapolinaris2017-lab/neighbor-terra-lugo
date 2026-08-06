import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

const actionGrid = document.querySelector('#actionGrid');

const observer = new MutationObserver(() => {
  if (!actionGrid) return;
  const residentsCard = [...actionGrid.querySelectorAll('.action-card')].find((card) => card.textContent.toLowerCase().includes('residentes'));
  if (!residentsCard) return;

  if (!actionGrid.querySelector('[data-neighbor-homes]')) {
    const homesCard = document.createElement('button');
    homesCard.className = 'action-card';
    homesCard.type = 'button';
    homesCard.dataset.neighborHomes = 'true';
    homesCard.innerHTML = '<span class="action-icon">🏠</span><strong>Residencias</strong><small>Unidades y propietarios</small>';
    actionGrid.insertBefore(homesCard, residentsCard);
  }

  if (!actionGrid.querySelector('[data-neighbor-vehicles]')) {
    const vehiclesCard = document.createElement('button');
    vehiclesCard.className = 'action-card';
    vehiclesCard.type = 'button';
    vehiclesCard.dataset.neighborVehicles = 'true';
    vehiclesCard.innerHTML = '<span class="action-icon">🚙</span><strong>Vehículos</strong><small>Tablillas y unidades</small>';
    residentsCard.insertAdjacentElement('afterend', vehiclesCard);
  }

  if (!actionGrid.querySelector('[data-neighbor-users]')) {
    const usersCard = document.createElement('button');
    usersCard.className = 'action-card';
    usersCard.type = 'button';
    usersCard.dataset.neighborUsers = 'true';
    usersCard.innerHTML = '<span class="action-icon">🔐</span><strong>Usuarios y roles</strong><small>Administrar accesos</small>';
    actionGrid.appendChild(usersCard);
  }
});

observer.observe(actionGrid, { childList: true });

// Editor de nombre de usuario. Se integra al formulario existente de Usuarios y roles.
const dialog = document.querySelector('#featureDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogBody = document.querySelector('#dialogBody');
const dialogForm = document.querySelector('#dialogForm');
let adminNameFirebase = null;

initializeAdminNameEditor();

async function initializeAdminNameEditor() {
  try {
    const appModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const firestore = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
    adminNameFirebase = {
      auth: authModule.getAuth(app),
      db: firestore.getFirestore(app),
      authModule,
      firestore
    };
  } catch (error) {
    console.warn('Editor de nombres disponible solo en modo local.', error);
  }
}

const accessFormObserver = new MutationObserver(() => {
  const title = dialogTitle?.textContent || '';
  const roleSelect = dialogForm?.querySelector('select[name="role"]');
  const statusSelect = dialogForm?.querySelector('select[name="status"]');
  if (!title.startsWith('Acceso de ') || !roleSelect || !statusSelect || dialogForm.querySelector('input[name="name"]')) return;

  const summary = dialogBody.querySelector('.module-list article');
  const displayedName = summary?.querySelector('strong')?.textContent?.trim() || title.replace(/^Acceso de\s+/, '').trim();
  const displayedEmail = summary?.querySelector('p')?.textContent?.trim() || '';
  const roleLabel = roleSelect.closest('label');
  const nameLabel = document.createElement('label');
  nameLabel.innerHTML = `Nombre para mostrar<input name="name" required maxlength="80" value="${escapeAdminHtml(displayedName)}" autocomplete="name">`;
  roleLabel.parentNode.insertBefore(nameLabel, roleLabel);

  dialogForm.dataset.editUserEmail = displayedEmail;
  dialogForm.dataset.editUserOriginalName = displayedName;
  dialogForm.onsubmit = saveUserProfileAndAccess;
});

accessFormObserver.observe(dialogBody, { childList: true, subtree: true });

async function saveUserProfileAndAccess(event) {
  event.preventDefault();
  const message = document.querySelector('#accessMessage');
  const data = Object.fromEntries(new FormData(dialogForm).entries());
  const name = String(data.name || '').trim();
  const email = String(dialogForm.dataset.editUserEmail || '').trim().toLowerCase();
  const role = String(data.role || 'resident');
  const status = String(data.status || 'active');

  if (!name) {
    message.textContent = 'Escribe el nombre que aparecerá en el Dashboard.';
    return;
  }

  if (!adminNameFirebase?.auth?.currentUser) {
    message.textContent = 'Debes iniciar sesión como administrador.';
    return;
  }

  message.textContent = 'Guardando nombre y acceso…';
  try {
    const { auth, db, firestore, authModule } = adminNameFirebase;
    const root = ['apps', APP_NAMESPACE, 'communities', COMMUNITY_ID];
    const usersSnapshot = await firestore.getDocs(firestore.collection(db, ...root, 'users'));
    const targetDoc = usersSnapshot.docs.find((item) => String(item.data().email || '').toLowerCase() === email);
    if (!targetDoc) throw new Error('No se encontró el perfil de este usuario.');

    const target = targetDoc.data();
    const activeAdmins = usersSnapshot.docs.filter((item) => {
      const user = item.data();
      return user.role === 'admin' && user.status === 'active';
    });
    if (target.role === 'admin' && target.status === 'active' && (role !== 'admin' || status !== 'active') && activeAdmins.length <= 1) {
      throw new Error('Debe permanecer al menos un administrador activo.');
    }

    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    const batch = firestore.writeBatch(db);
    batch.update(targetDoc.ref, {
      name,
      initials,
      role,
      status,
      updatedBy: auth.currentUser.uid,
      updatedAt: firestore.serverTimestamp()
    });

    const residentsQuery = firestore.query(
      firestore.collection(db, ...root, 'residents'),
      firestore.where('email', '==', email)
    );
    const residentsSnapshot = await firestore.getDocs(residentsQuery);
    residentsSnapshot.docs.forEach((residentDoc) => batch.update(residentDoc.ref, {
      name,
      updatedBy: auth.currentUser.uid,
      updatedAt: firestore.serverTimestamp()
    }));

    const activityRef = firestore.doc(firestore.collection(db, ...root, 'activity'));
    batch.set(activityRef, {
      type: 'user-profile-updated',
      icon: '✏️',
      title: 'Nombre de usuario actualizado',
      detail: `${name} · ${email}`,
      targetUserId: targetDoc.id,
      userId: auth.currentUser.uid,
      communityId: COMMUNITY_ID,
      createdAt: firestore.serverTimestamp()
    });

    await batch.commit();

    // Si el administrador está editando su propio perfil, actualiza también Firebase Auth y el Dashboard al instante.
    if (targetDoc.id === auth.currentUser.uid) {
      await authModule.updateProfile(auth.currentUser, { displayName: name }).catch(() => {});
      document.querySelector('#userName').textContent = name;
      document.querySelector('#avatarButton').textContent = initials || 'US';
    }

    window.dispatchEvent(new CustomEvent('neighbor:user-profile-updated', {
      detail: { uid: targetDoc.id, name, initials, role, status, email }
    }));

    message.textContent = 'Guardado. El nombre aparecerá en el Dashboard del usuario.';
    setTimeout(() => {
      dialog.close();
      document.querySelector('[data-neighbor-users]')?.click();
    }, 450);
  } catch (error) {
    message.textContent = cleanAdminNameError(error);
  }
}

function cleanAdminNameError(error) {
  const code = String(error?.code || '');
  if (code.includes('permission-denied')) return 'No tienes permiso para editar este usuario.';
  if (code.includes('network-request-failed') || code.includes('unavailable')) return 'No hay conexión. Intenta nuevamente.';
  return String(error?.message || 'No se pudo guardar el nombre.').replace(/^FirebaseError:\s*/i, '');
}

function escapeAdminHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

const COLLECTIONS = ['packages', 'incidents', 'reservations', 'announcements', 'visits'];
const LABELS = {
  packages: ['📦', 'Nuevo paquete'],
  incidents: ['🚨', 'Nueva incidencia'],
  reservations: ['📅', 'Nueva reservación'],
  announcements: ['📢', 'Nuevo comunicado'],
  visits: ['🚗', 'Nueva visita']
};
const STORAGE_PREFIX = `neighbor-${COMMUNITY_ID}-notifications`;

let auth;
let db;
let profile = null;
let currentUid = null;
let unsubscribeAll = [];
let initializedCollections = new Set();
let notifications = [];
let unread = 0;

initializeRealtime();

async function initializeRealtime() {
  try {
    const appModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const firestore = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
    auth = authModule.getAuth(app);
    db = firestore.getFirestore(app);
    createNotificationUi();

    authModule.onAuthStateChanged(auth, async (user) => {
      stopListeners();
      profile = null;
      currentUid = user?.uid || null;
      initializedCollections.clear();
      notifications = loadNotifications();
      unread = notifications.filter((item) => !item.read).length;
      updateBadge();

      if (!user) return;

      const profileRef = firestore.doc(db, 'apps', APP_NAMESPACE, 'communities', COMMUNITY_ID, 'users', user.uid);
      const snapshot = await firestore.getDoc(profileRef);
      profile = snapshot.exists() ? { uid: user.uid, ...snapshot.data() } : { uid: user.uid, role: 'resident' };
      startListeners(firestore, user);
    });
  } catch (error) {
    console.warn('Tiempo real no disponible:', error);
  }
}

function startListeners(firestore, user) {
  COLLECTIONS.forEach((module) => {
    const ref = firestore.collection(db, 'apps', APP_NAMESPACE, 'communities', COMMUNITY_ID, module);
    const liveQuery = firestore.query(ref, firestore.orderBy('createdAt', 'desc'), firestore.limit(50));
    const unsubscribe = firestore.onSnapshot(liveQuery, (snapshot) => {
      const visibleItems = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((item) => canSee(module, item, user));
      const isInitial = !initializedCollections.has(module);
      initializedCollections.add(module);

      if (!isInitial) {
        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const item = { id: change.doc.id, ...change.doc.data() };
          if (!canSee(module, item, user)) return;
          addNotification(module, item);
        });
      }

      window.dispatchEvent(new CustomEvent('neighbor:realtime-update', {
        detail: { module, items: visibleItems }
      }));
      updateLiveCounters(module, visibleItems);
      refreshOpenModule(module);
    }, (error) => console.warn(`Listener ${module}:`, error));
    unsubscribeAll.push(unsubscribe);
  });
}

function canSee(module, item, user) {
  const role = profile?.role || 'resident';
  if (role === 'admin') return true;

  if (module === 'announcements') {
    const audience = String(item.audience || 'Todos').toLowerCase();
    if (audience === 'todos') return true;
    if (role === 'guard') return audience === 'seguridad';
    if (role === 'board') return audience === 'junta';
    return audience === 'residentes';
  }

  if (role === 'guard') {
    return ['visits', 'packages', 'incidents'].includes(module) || item.createdBy === user.uid;
  }

  return item.createdBy === user.uid || item.userId === user.uid || item.residentId === user.uid;
}

function addNotification(module, item) {
  const [icon, title] = LABELS[module] || ['🔔', 'Nueva actualización'];
  const sourceId = `${module}-${item.id}`;
  if (notifications.some((entry) => entry.sourceId === sourceId)) return;

  const notification = {
    id: crypto.randomUUID(),
    sourceId,
    module,
    icon,
    title,
    detail: describe(module, item),
    createdAt: Date.now(),
    read: false
  };
  notifications.unshift(notification);
  notifications = notifications.slice(0, 50);
  persistNotifications();
  unread = notifications.filter((entry) => !entry.read).length;
  updateBadge();
  showToast(notification);

  if (navigator.vibrate) navigator.vibrate(120);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    const browserNotification = new Notification(`${icon} ${title}`, { body: notification.detail, icon: './neighbor-icon.svg', tag: sourceId });
    browserNotification.onclick = () => {
      window.focus();
      openTargetModule(module);
      browserNotification.close();
    };
  }
}

function describe(module, item) {
  if (module === 'packages') return `${item.carrier || 'Paquete'} · Unidad ${item.homeId || 'sin unidad'}`;
  if (module === 'incidents') return `${item.category || 'Incidencia'} · ${item.location || 'sin ubicación'}`;
  if (module === 'reservations') {
    const requester = String(item.requesterName || item.createdByName || item.residentName || item.requestedByName || 'Residente').trim() || 'Residente';
    const unit = item.homeId ? `Unidad ${item.homeId}` : 'Sin unidad';
    const when = [item.date || '', item.time || ''].filter(Boolean).join(' · ');
    return `${requester} · ${unit} · ${item.area || 'Área común'}${when ? ` · ${when}` : ''}`;
  }
  if (module === 'announcements') return item.message ? `${item.title || 'Comunicado'} · ${item.message}` : (item.title || 'La administración publicó un aviso.');
  if (module === 'visits') return `${item.visitor || item.visitorName || 'Visitante'} · Unidad ${item.homeId || ''}`;
  return 'Hay una actualización nueva.';
}

function updateLiveCounters(module, items) {
  const pending = items.filter((item) => ['pending', 'open', 'in-progress'].includes(String(item.status || '').toLowerCase())).length;
  const aliases = {
    packages: ['paquetes', 'registrar paquete'],
    incidents: ['incidencias', 'casos', 'reportar incidencia'],
    reservations: ['reservaciones', 'reservar gazebo'],
    announcements: ['comunicados', 'avisos'],
    visits: ['visitas', 'registrar visita']
  }[module] || [];

  document.querySelectorAll('.action-card').forEach((card) => {
    const text = card.textContent.toLowerCase();
    if (!aliases.some((alias) => text.includes(alias))) return;
    const detail = card.querySelector('small');
    if (!detail) return;
    detail.textContent = pending ? `${pending} pendiente${pending === 1 ? '' : 's'}` : `${items.length} registro${items.length === 1 ? '' : 's'}`;
  });
}

function refreshOpenModule(module) {
  const dialog = document.querySelector('#featureDialog');
  if (!dialog?.open) return;
  const currentTitle = document.querySelector('#dialogTitle')?.textContent?.toLowerCase() || '';
  const names = {
    packages: ['paquetes'], incidents: ['incidencias'], reservations: ['reservaciones'],
    announcements: ['comunicados', 'avisos'], visits: ['visitas']
  }[module] || [];
  if (!names.some((name) => currentTitle.includes(name))) return;
  const trigger = findModuleTrigger(module);
  if (trigger) setTimeout(() => trigger.click(), 80);
}

function createNotificationUi() {
  if (document.querySelector('#neighborBell')) return;
  const style = document.createElement('style');
  style.textContent = `
    .neighbor-bell{position:fixed;right:18px;bottom:86px;z-index:50;width:50px;height:50px;border:0;border-radius:50%;background:#071522;color:white;font-size:22px;box-shadow:0 10px 28px rgba(0,0,0,.24);display:none;align-items:center;justify-content:center}.neighbor-bell.visible{display:flex}
    .neighbor-badge{position:absolute;right:-3px;top:-3px;min-width:21px;height:21px;padding:0 5px;border-radius:11px;background:#dc2626;color:#fff;font:700 12px/21px Inter,sans-serif;display:none}.neighbor-badge.visible{display:block}
    .neighbor-toast{position:fixed;left:16px;right:16px;top:calc(env(safe-area-inset-top) + 14px);z-index:100;background:#fff;border:0;border-radius:16px;padding:14px 16px;box-shadow:0 16px 45px rgba(0,0,0,.24);display:flex;gap:12px;align-items:center;text-align:left;animation:neighborIn .22s ease}.neighbor-toast span{font-size:24px}.neighbor-toast strong,.neighbor-toast small{display:block}.neighbor-toast small{margin-top:3px;color:#52606d}
    .notification-row{width:100%;border:0;background:transparent;text-align:left;padding:0}.notification-row.unread strong:after{content:' •';color:#dc2626}.notification-meta{font-size:12px;color:#667085;margin-top:4px}.notification-actions{display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px}@keyframes neighborIn{from{transform:translateY(-20px);opacity:0}to{transform:none;opacity:1}}
  `;
  document.head.appendChild(style);

  const bell = document.createElement('button');
  bell.id = 'neighborBell';
  bell.className = 'neighbor-bell';
  bell.type = 'button';
  bell.setAttribute('aria-label', 'Abrir notificaciones');
  bell.innerHTML = '🔔<span class="neighbor-badge" id="neighborBadge">0</span>';
  bell.addEventListener('click', openNotificationCenter);
  document.body.appendChild(bell);

  const appShell = document.querySelector('#appShell');
  const syncVisibility = () => bell.classList.toggle('visible', !appShell?.classList.contains('hidden'));
  syncVisibility();
  if (appShell) new MutationObserver(syncVisibility).observe(appShell, { attributes: true, attributeFilter: ['class'] });
}

function updateBadge() {
  const badge = document.querySelector('#neighborBadge');
  if (!badge) return;
  badge.textContent = unread > 99 ? '99+' : String(unread);
  badge.classList.toggle('visible', unread > 0);
  document.title = unread > 0 ? `(${unread}) Neighbor · Terra Lugo` : 'Neighbor · Terra Lugo';
}

function showToast(notification) {
  document.querySelector('.neighbor-toast')?.remove();
  const toast = document.createElement('button');
  toast.type = 'button';
  toast.className = 'neighbor-toast';
  toast.innerHTML = `<span>${notification.icon}</span><div><strong>${escapeHtml(notification.title)}</strong><small>${escapeHtml(notification.detail)}</small></div>`;
  toast.onclick = () => { toast.remove(); openTargetModule(notification.module); };
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

async function openNotificationCenter() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  const dialog = document.querySelector('#featureDialog');
  const eyebrow = document.querySelector('#dialogEyebrow');
  const title = document.querySelector('#dialogTitle');
  const body = document.querySelector('#dialogBody');
  const form = document.querySelector('#dialogForm');
  if (!dialog || !body) return;

  form.onsubmit = null;
  eyebrow.textContent = 'Neighbor en vivo';
  title.textContent = 'Notificaciones';
  body.innerHTML = notifications.length ? `
    <div class="notification-actions"><button id="markAllRead" type="button">Marcar leídas</button><button id="clearNotifications" type="button">Limpiar</button></div>
    <div class="module-list">${notifications.map(notificationRow).join('')}</div>`
    : '<div class="empty-state">No hay notificaciones.</div>';
  if (!dialog.open) dialog.showModal();

  document.querySelector('#markAllRead')?.addEventListener('click', () => {
    notifications = notifications.map((item) => ({ ...item, read: true }));
    persistNotifications(); unread = 0; updateBadge(); openNotificationCenter();
  });
  document.querySelector('#clearNotifications')?.addEventListener('click', () => {
    notifications = []; persistNotifications(); unread = 0; updateBadge(); openNotificationCenter();
  });
  document.querySelectorAll('[data-notification-id]').forEach((button) => button.addEventListener('click', () => {
    const item = notifications.find((entry) => entry.id === button.dataset.notificationId);
    if (!item) return;
    item.read = true; persistNotifications(); unread = notifications.filter((entry) => !entry.read).length; updateBadge();
    dialog.close(); openTargetModule(item.module);
  }));
}

function notificationRow(item) {
  return `<article><button type="button" class="notification-row ${item.read ? '' : 'unread'}" data-notification-id="${escapeHtml(item.id)}"><strong>${item.icon} ${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p><div class="notification-meta">${relativeTime(item.createdAt)}</div></button></article>`;
}

function openTargetModule(module) {
  const trigger = findModuleTrigger(module);
  if (trigger) trigger.click();
}

function findModuleTrigger(module) {
  const names = {
    packages: ['paquetes', 'registrar paquete'], incidents: ['incidencias', 'casos', 'reportar incidencia'],
    reservations: ['reservaciones', 'reservar gazebo'], announcements: ['comunicados', 'avisos'],
    visits: ['visitas', 'registrar visita']
  }[module] || [];
  return [...document.querySelectorAll('.action-card, .nav-item')].find((button) => names.some((name) => button.textContent.toLowerCase().includes(name)));
}

function storageKey() { return `${STORAGE_PREFIX}-${currentUid || 'guest'}`; }
function loadNotifications() {
  try { const value = JSON.parse(localStorage.getItem(storageKey())); return Array.isArray(value) ? value : []; } catch { return []; }
}
function persistNotifications() { try { localStorage.setItem(storageKey(), JSON.stringify(notifications)); } catch {} }
function relativeTime(timestamp) {
  const seconds = Math.max(1, Math.floor((Date.now() - Number(timestamp || Date.now())) / 1000));
  if (seconds < 60) return 'Ahora mismo';
  const minutes = Math.floor(seconds / 60); if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60); if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24); return `Hace ${days} día${days === 1 ? '' : 's'}`;
}

function stopListeners() { unsubscribeAll.forEach((unsubscribe) => unsubscribe()); unsubscribeAll = []; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

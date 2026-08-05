import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

const COLLECTIONS = ['packages', 'incidents', 'reservations', 'announcements', 'visits'];
const LABELS = {
  packages: ['📦', 'Nuevo paquete'],
  incidents: ['🚨', 'Nueva incidencia'],
  reservations: ['📅', 'Nueva reservación'],
  announcements: ['📢', 'Nuevo comunicado'],
  visits: ['🚗', 'Nueva visita']
};

let auth;
let db;
let profile = null;
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
      initializedCollections.clear();
      if (!user) {
        updateBadge();
        return;
      }

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
    return module === 'visits' || module === 'packages' || module === 'incidents' || item.createdBy === user.uid;
  }

  return item.createdBy === user.uid || item.userId === user.uid || item.residentId === user.uid;
}

function addNotification(module, item) {
  const [icon, title] = LABELS[module] || ['🔔', 'Nueva actualización'];
  const detail = describe(module, item);
  const notification = {
    id: `${module}-${item.id}-${Date.now()}`,
    module,
    icon,
    title,
    detail,
    time: new Date().toLocaleTimeString('es-PR', { hour: 'numeric', minute: '2-digit' })
  };
  notifications.unshift(notification);
  notifications = notifications.slice(0, 30);
  unread += 1;
  updateBadge();
  showToast(notification);

  if (navigator.vibrate) navigator.vibrate(120);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(`${icon} ${title}`, { body: detail, icon: './neighbor-icon.svg' });
  }
}

function describe(module, item) {
  if (module === 'packages') return `${item.carrier || 'Paquete'} · Unidad ${item.homeId || 'sin unidad'}`;
  if (module === 'incidents') return `${item.category || 'Incidencia'} · ${item.location || 'sin ubicación'}`;
  if (module === 'reservations') return `${item.area || 'Área común'} · ${item.date || ''}`;
  if (module === 'announcements') return item.title || 'La administración publicó un aviso.';
  if (module === 'visits') return `${item.visitor || item.visitorName || 'Visitante'} · Unidad ${item.homeId || ''}`;
  return 'Hay una actualización nueva.';
}

function refreshOpenModule(module) {
  const dialog = document.querySelector('#featureDialog');
  if (!dialog?.open) return;
  const currentTitle = document.querySelector('#dialogTitle')?.textContent?.toLowerCase() || '';
  const names = {
    packages: ['paquetes'],
    incidents: ['incidencias'],
    reservations: ['reservaciones'],
    announcements: ['comunicados', 'avisos'],
    visits: ['visitas']
  }[module] || [];
  if (!names.some((name) => currentTitle.includes(name))) return;

  const actionButtons = [...document.querySelectorAll('.action-card, .nav-item')];
  const trigger = actionButtons.find((button) => names.some((name) => button.textContent.toLowerCase().includes(name)));
  if (trigger) setTimeout(() => trigger.click(), 80);
}

function createNotificationUi() {
  if (document.querySelector('#neighborBell')) return;
  const style = document.createElement('style');
  style.textContent = `
    .neighbor-bell{position:fixed;right:18px;bottom:86px;z-index:50;width:50px;height:50px;border:0;border-radius:50%;background:#071522;color:white;font-size:22px;box-shadow:0 10px 28px rgba(0,0,0,.24);display:none;align-items:center;justify-content:center}
    .neighbor-bell.visible{display:flex}.neighbor-badge{position:absolute;right:-3px;top:-3px;min-width:21px;height:21px;padding:0 5px;border-radius:11px;background:#dc2626;color:#fff;font:700 12px/21px Inter,sans-serif;display:none}.neighbor-badge.visible{display:block}
    .neighbor-toast{position:fixed;left:16px;right:16px;top:calc(env(safe-area-inset-top) + 14px);z-index:100;background:#fff;border-radius:16px;padding:14px 16px;box-shadow:0 16px 45px rgba(0,0,0,.24);display:flex;gap:12px;align-items:center;animation:neighborIn .22s ease}.neighbor-toast span{font-size:24px}.neighbor-toast strong,.neighbor-toast small{display:block}.neighbor-toast small{margin-top:3px;color:#52606d}@keyframes neighborIn{from{transform:translateY(-20px);opacity:0}to{transform:none;opacity:1}}
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
  new MutationObserver(() => bell.classList.toggle('visible', !appShell?.classList.contains('hidden')))
    .observe(appShell, { attributes: true, attributeFilter: ['class'] });
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
  const toast = document.createElement('div');
  toast.className = 'neighbor-toast';
  toast.innerHTML = `<span>${notification.icon}</span><div><strong>${escapeHtml(notification.title)}</strong><small>${escapeHtml(notification.detail)}</small></div>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

async function openNotificationCenter() {
  unread = 0;
  updateBadge();
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
  const dialog = document.querySelector('#featureDialog');
  const eyebrow = document.querySelector('#dialogEyebrow');
  const title = document.querySelector('#dialogTitle');
  const body = document.querySelector('#dialogBody');
  const form = document.querySelector('#dialogForm');
  if (!dialog || !body) return;
  form.onsubmit = null;
  eyebrow.textContent = 'Neighbor en vivo';
  title.textContent = 'Notificaciones';
  body.innerHTML = notifications.length
    ? `<div class="module-list">${notifications.map((item) => `<article><strong>${item.icon} ${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)} · ${escapeHtml(item.time)}</p></article>`).join('')}</div>`
    : '<div class="empty-state">No hay notificaciones nuevas.</div>';
  dialog.showModal();
}

function stopListeners() {
  unsubscribeAll.forEach((unsubscribe) => unsubscribe());
  unsubscribeAll = [];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

const MODULE_ALIASES = {
  packages: ['paquetes', 'registrar paquete'],
  incidents: ['incidencias', 'casos', 'reportar incidencia'],
  reservations: ['reservaciones', 'reservar gazebo'],
  announcements: ['comunicados', 'avisos'],
  visits: ['visitas', 'registrar visita']
};

const moduleCounts = new Map();
let lastAppBadge = -1;
let renderQueued = false;

installStyles();
watchNotificationBadge();
watchDynamicNavigation();

window.addEventListener('neighbor:realtime-update', (event) => {
  const detail = event.detail || {};
  const module = detail.module || detail.collection;
  const items = Array.isArray(detail.items) ? detail.items : [];
  if (!module) return;
  if (items.length) moduleCounts.set(module, countRelevant(module, items));
  queueRenderModuleBadges();
});

function countRelevant(module, items) {
  if (module === 'announcements') return items.length;
  const activeStates = new Set(['pending', 'open', 'in-progress']);
  return items.filter((item) => activeStates.has(String(item.status || 'pending').toLowerCase())).length;
}

function installStyles() {
  if (document.querySelector('#neighborModuleBadgeStyles')) return;
  const style = document.createElement('style');
  style.id = 'neighborModuleBadgeStyles';
  style.textContent = `
    .action-card,.nav-item{position:relative}
    .module-count-badge{position:absolute;top:8px;right:8px;z-index:4;min-width:21px;height:21px;padding:0 6px;border-radius:999px;background:#dc2626;color:#fff;font:700 12px/21px Inter,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(220,38,38,.35);pointer-events:none}
    .nav-item .module-count-badge{top:3px;right:calc(50% - 24px);min-width:18px;height:18px;padding:0 5px;font-size:10px;line-height:18px}
  `;
  document.head.appendChild(style);
}

function watchNotificationBadge() {
  const connect = () => {
    const badge = document.querySelector('#neighborBadge');
    if (!badge || badge.dataset.badgeObserver === 'true') return Boolean(badge);
    badge.dataset.badgeObserver = 'true';
    const sync = () => syncAppBadge(parseBadgeValue(badge.textContent));
    sync();
    new MutationObserver(sync).observe(badge, { childList: true, characterData: true, subtree: true });
    return true;
  };

  if (connect()) return;
  const observer = new MutationObserver(() => {
    if (connect()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function parseBadgeValue(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  if (text.includes('99+')) return 99;
  const count = Number.parseInt(text, 10);
  return Number.isFinite(count) ? count : 0;
}

async function syncAppBadge(count) {
  if (count === lastAppBadge) return;
  lastAppBadge = count;
  try {
    if (count > 0 && 'setAppBadge' in navigator) await navigator.setAppBadge(count);
    else if ('clearAppBadge' in navigator) await navigator.clearAppBadge();
  } catch (error) {
    console.debug('El dispositivo no permitió actualizar el badge del icono.', error);
  }
}

function watchDynamicNavigation() {
  const targets = [document.querySelector('#actionGrid'), document.querySelector('#bottomNav')].filter(Boolean);
  const observer = new MutationObserver(queueRenderModuleBadges);
  // Solo observar hijos directos. Observar subtree provocaba un ciclo al insertar/actualizar badges.
  targets.forEach((target) => observer.observe(target, { childList: true }));
  queueRenderModuleBadges();
}

function queueRenderModuleBadges() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderModuleBadges();
  });
}

function renderModuleBadges() {
  document.querySelectorAll('.action-card, .nav-item').forEach((element) => {
    const module = identifyModule(element.textContent);
    const oldBadge = element.querySelector(':scope > .module-count-badge');
    if (!module) {
      if (oldBadge) oldBadge.remove();
      return;
    }

    const count = moduleCounts.get(module) || 0;
    if (!count) {
      if (oldBadge) oldBadge.remove();
      return;
    }

    const nextText = count > 99 ? '99+' : String(count);
    const badge = oldBadge || document.createElement('span');
    badge.className = 'module-count-badge';
    if (badge.textContent !== nextText) badge.textContent = nextText;
    const aria = `${count} notificaciones pendientes`;
    if (badge.getAttribute('aria-label') !== aria) badge.setAttribute('aria-label', aria);
    if (!oldBadge) element.appendChild(badge);
  });
}

function identifyModule(textValue) {
  const text = String(textValue || '').toLowerCase();
  return Object.entries(MODULE_ALIASES).find(([, aliases]) => aliases.some((alias) => text.includes(alias)))?.[0] || null;
}

window.addEventListener('beforeunload', () => {
  if ('clearAppBadge' in navigator && lastAppBadge <= 0) navigator.clearAppBadge().catch(() => {});
});

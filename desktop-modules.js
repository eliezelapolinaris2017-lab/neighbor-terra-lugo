const DESKTOP_QUERY = window.matchMedia('(min-width: 980px)');
const actionGrid = document.querySelector('#actionGrid');

function ensureDesktopAdminModules() {
  if (!DESKTOP_QUERY.matches || !actionGrid) return;

  const residentsCard = [...actionGrid.querySelectorAll('.action-card')]
    .find((card) => card.textContent.toLowerCase().includes('residentes'));
  if (!residentsCard) return;

  if (!actionGrid.querySelector('[data-neighbor-homes]')) {
    const homesCard = document.createElement('button');
    homesCard.className = 'action-card';
    homesCard.type = 'button';
    homesCard.dataset.neighborHomes = 'true';
    homesCard.dataset.module = 'homes';
    homesCard.innerHTML = '<span class="action-icon">🏠</span><strong>Residencias</strong><small>Unidades y propietarios</small>';
    actionGrid.insertBefore(homesCard, residentsCard);
  }

  if (!actionGrid.querySelector('[data-neighbor-vehicles]')) {
    const vehiclesCard = document.createElement('button');
    vehiclesCard.className = 'action-card';
    vehiclesCard.type = 'button';
    vehiclesCard.dataset.neighborVehicles = 'true';
    vehiclesCard.dataset.module = 'vehicles';
    vehiclesCard.innerHTML = '<span class="action-icon">🚙</span><strong>Vehículos</strong><small>Tablillas y unidades</small>';
    residentsCard.insertAdjacentElement('afterend', vehiclesCard);
  }

  if (!actionGrid.querySelector('[data-neighbor-users]')) {
    const usersCard = document.createElement('button');
    usersCard.className = 'action-card';
    usersCard.type = 'button';
    usersCard.dataset.neighborUsers = 'true';
    usersCard.dataset.module = 'users';
    usersCard.innerHTML = '<span class="action-icon">🔐</span><strong>Usuarios y roles</strong><small>Administrar accesos</small>';
    actionGrid.appendChild(usersCard);
  }
}

let scheduled = false;
function scheduleEnsure() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    ensureDesktopAdminModules();
  });
}

if (actionGrid) {
  new MutationObserver(scheduleEnsure).observe(actionGrid, { childList: true });
}

DESKTOP_QUERY.addEventListener?.('change', scheduleEnsure);
window.addEventListener('load', scheduleEnsure);
window.addEventListener('pageshow', scheduleEnsure);
scheduleEnsure();

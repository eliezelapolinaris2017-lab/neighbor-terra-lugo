import { createHome, deleteHome, isFirebaseReady, listHomes, updateHome } from './firebase-service.js';

const LOCAL_KEY = 'neighbor-terra-lugo-homes';
const dialog = document.querySelector('#featureDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogEyebrow = document.querySelector('#dialogEyebrow');
const dialogBody = document.querySelector('#dialogBody');
const dialogForm = document.querySelector('#dialogForm');

let homes = [];
let editingId = null;

document.addEventListener('click', async (event) => {
  const card = event.target.closest('.action-card, .nav-item');
  if (!card) return;
  const label = card.textContent.toLowerCase();
  if (!label.includes('residentes')) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  await openHomes();
}, true);

async function openHomes() {
  dialogEyebrow.textContent = 'Neighbor Admin';
  dialogTitle.textContent = 'Residencias';
  dialogBody.innerHTML = '<div class="empty-state">Cargando residencias…</div>';
  dialog.showModal();

  try {
    homes = isFirebaseReady() ? await listHomes() : loadLocalHomes();
  } catch (error) {
    console.error(error);
    homes = loadLocalHomes();
  }

  renderHomes();
}

function renderHomes(filter = '') {
  const query = filter.trim().toLowerCase();
  const filtered = homes.filter((home) => {
    const text = `${home.unit} ${home.ownerName || ''} ${home.status || ''}`.toLowerCase();
    return text.includes(query);
  });

  dialogBody.innerHTML = `
    <div class="homes-toolbar">
      <input id="homeSearch" type="search" placeholder="Buscar unidad o propietario" value="${escapeHtml(filter)}">
      <button class="primary-button compact-button" id="newHomeButton" type="button">+ Nueva</button>
    </div>
    <div class="module-list homes-list" id="homesList">
      ${filtered.length ? filtered.map(homeCard).join('') : '<div class="empty-state">No hay residencias registradas.</div>'}
    </div>
  `;

  document.querySelector('#homeSearch').addEventListener('input', (event) => renderHomes(event.target.value));
  document.querySelector('#newHomeButton').addEventListener('click', () => showHomeForm());
  document.querySelectorAll('[data-edit-home]').forEach((button) => button.addEventListener('click', () => showHomeForm(button.dataset.editHome)));
  document.querySelectorAll('[data-delete-home]').forEach((button) => button.addEventListener('click', () => removeHome(button.dataset.deleteHome)));
}

function homeCard(home) {
  const statusText = home.status === 'inactive' ? 'Inactiva' : 'Activa';
  return `
    <article class="home-row">
      <div>
        <strong>${escapeHtml(home.unit)}</strong>
        <p>${escapeHtml(home.ownerName || 'Sin propietario')} · ${statusText} · Balance $${Number(home.balance || 0).toFixed(2)}</p>
      </div>
      <div class="row-actions">
        <button type="button" data-edit-home="${escapeHtml(home.id || home.unit)}">Editar</button>
        <button type="button" class="danger-link" data-delete-home="${escapeHtml(home.id || home.unit)}">Eliminar</button>
      </div>
    </article>
  `;
}

function showHomeForm(id = null) {
  editingId = id;
  const home = homes.find((item) => (item.id || item.unit) === id) || {};
  dialogTitle.textContent = id ? `Editar ${home.unit}` : 'Nueva residencia';
  dialogBody.innerHTML = `
    <label>Unidad<input name="unit" required ${id ? 'readonly' : ''} value="${escapeHtml(home.unit || '')}" placeholder="Ej. B-24"></label>
    <div class="form-grid">
      <label>Bloque<input name="block" value="${escapeHtml(home.block || '')}" placeholder="B"></label>
      <label>Número<input name="number" value="${escapeHtml(home.number || '')}" placeholder="24"></label>
    </div>
    <label>Propietario<input name="ownerName" value="${escapeHtml(home.ownerName || '')}" placeholder="Nombre completo"></label>
    <label>Estado<select name="status"><option value="active" ${home.status !== 'inactive' ? 'selected' : ''}>Activa</option><option value="inactive" ${home.status === 'inactive' ? 'selected' : ''}>Inactiva</option></select></label>
    <label>Balance<input name="balance" type="number" step="0.01" value="${Number(home.balance || 0)}"></label>
    <div class="form-actions">
      <button class="secondary-button" id="cancelHomeForm" type="button">Cancelar</button>
      <button class="primary-button" type="submit">Guardar</button>
    </div>
    <p class="form-message" id="homeFormMessage"></p>
  `;

  document.querySelector('#cancelHomeForm').addEventListener('click', () => {
    dialogTitle.textContent = 'Residencias';
    renderHomes();
  });

  dialogForm.onsubmit = saveHome;
}

async function saveHome(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(dialogForm).entries());
  const message = document.querySelector('#homeFormMessage');
  message.textContent = 'Guardando…';

  try {
    if (isFirebaseReady()) {
      if (editingId) await updateHome(editingId, data);
      else await createHome(data);
      homes = await listHomes();
    } else {
      saveLocalHome(data, editingId);
      homes = loadLocalHomes();
    }
    editingId = null;
    dialogTitle.textContent = 'Residencias';
    renderHomes();
  } catch (error) {
    message.textContent = error.message || 'No se pudo guardar.';
  }
}

async function removeHome(id) {
  const home = homes.find((item) => (item.id || item.unit) === id);
  if (!home || !confirm(`¿Eliminar la residencia ${home.unit}?`)) return;

  try {
    if (isFirebaseReady()) {
      await deleteHome(id);
      homes = await listHomes();
    } else {
      const updated = loadLocalHomes().filter((item) => (item.id || item.unit) !== id);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(updated));
      homes = updated;
    }
    renderHomes();
  } catch (error) {
    alert(error.message || 'No se pudo eliminar.');
  }
}

function loadLocalHomes() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveLocalHome(data, id) {
  const current = loadLocalHomes();
  const unit = String(data.unit || '').trim().toUpperCase();
  const record = {
    id: unit,
    unit,
    block: String(data.block || '').trim().toUpperCase(),
    number: String(data.number || '').trim(),
    ownerName: String(data.ownerName || '').trim(),
    status: data.status || 'active',
    balance: Number(data.balance || 0)
  };

  const index = current.findIndex((item) => (item.id || item.unit) === (id || unit));
  if (index >= 0) current[index] = record;
  else current.push(record);
  current.sort((a, b) => a.unit.localeCompare(b.unit));
  localStorage.setItem(LOCAL_KEY, JSON.stringify(current));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

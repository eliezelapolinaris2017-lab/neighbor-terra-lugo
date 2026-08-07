import { createResident, deleteResident, isFirebaseReady, listResidents, updateResident } from './firebase-service.js';

const LOCAL_KEY = 'neighbor-terra-lugo-residents';
const CACHE_KEY = 'neighbor-terra-lugo-residents-cache';
const dialog = document.querySelector('#featureDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogEyebrow = document.querySelector('#dialogEyebrow');
const dialogBody = document.querySelector('#dialogBody');
const dialogForm = document.querySelector('#dialogForm');

let residents = loadCache();
let editingId = null;
let syncPromise = null;
let lastSync = 0;

document.addEventListener('click', (event) => {
  const card = event.target.closest('.action-card, .nav-item');
  if (!card || !card.textContent.toLowerCase().includes('residentes')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openResidents();
}, true);

function openResidents() {
  dialogEyebrow.textContent = 'Neighbor Admin';
  dialogTitle.textContent = 'Residentes';
  residents = residents.length ? residents : loadCache();
  renderResidents();
  if (!dialog.open) dialog.showModal();
  if (Date.now() - lastSync > 45000) syncResidents(true);
}

async function syncResidents(renderWhenOpen = false) {
  if (!isFirebaseReady()) return residents;
  if (syncPromise) return syncPromise;
  syncPromise = listResidents()
    .then((items) => {
      residents = Array.isArray(items) ? items : [];
      saveCache(residents);
      lastSync = Date.now();
      if (renderWhenOpen && dialog.open && dialogTitle.textContent.toLowerCase().includes('residentes')) renderResidents();
      window.dispatchEvent(new CustomEvent('neighbor:module-synced', { detail: { module: 'residents', count: residents.length } }));
      return residents;
    })
    .catch((error) => { console.warn('No se pudieron sincronizar residentes.', error); return residents; })
    .finally(() => { syncPromise = null; });
  return syncPromise;
}

function renderResidents(filter = '') {
  const query = filter.trim().toLowerCase();
  const filtered = residents.filter((resident) => `${resident.name || ''} ${resident.homeId || ''} ${resident.email || ''} ${resident.phone || ''}`.toLowerCase().includes(query));
  dialogBody.innerHTML = `
    <div class="homes-toolbar">
      <input id="residentSearch" type="search" placeholder="Buscar nombre, unidad o teléfono" value="${escapeHtml(filter)}">
      <button class="primary-button compact-button" id="newResidentButton" type="button">+ Nuevo</button>
    </div>
    <div class="module-list homes-list">
      ${filtered.length ? filtered.map(residentCard).join('') : '<div class="empty-state">No hay residentes registrados.</div>'}
    </div>`;
  document.querySelector('#residentSearch')?.addEventListener('input', (event) => renderResidents(event.target.value));
  document.querySelector('#newResidentButton')?.addEventListener('click', () => showResidentForm());
  document.querySelectorAll('[data-edit-resident]').forEach((button) => button.addEventListener('click', () => showResidentForm(button.dataset.editResident)));
  document.querySelectorAll('[data-delete-resident]').forEach((button) => button.addEventListener('click', () => removeResident(button.dataset.deleteResident)));
}

function residentCard(resident) {
  const type = resident.residentType === 'tenant' ? 'Inquilino' : resident.residentType === 'authorized' ? 'Autorizado' : 'Propietario';
  const status = resident.status === 'inactive' ? 'Inactivo' : 'Activo';
  return `<article class="home-row">
    <div><strong>${escapeHtml(resident.name || 'Sin nombre')}</strong><p>${escapeHtml(resident.homeId || 'Sin unidad')} · ${type} · ${status}${resident.phone ? ` · ${escapeHtml(resident.phone)}` : ''}</p></div>
    <div class="row-actions"><button type="button" data-edit-resident="${escapeHtml(resident.id)}">Editar</button><button type="button" class="danger-link" data-delete-resident="${escapeHtml(resident.id)}">Eliminar</button></div>
  </article>`;
}

function showResidentForm(id = null) {
  editingId = id;
  const resident = residents.find((item) => item.id === id) || {};
  dialogTitle.textContent = id ? 'Editar residente' : 'Nuevo residente';
  dialogBody.innerHTML = `
    <label>Nombre completo<input name="name" required value="${escapeHtml(resident.name || '')}"></label>
    <div class="form-grid">
      <label>Unidad<input name="homeId" value="${escapeHtml(resident.homeId || '')}" placeholder="B-24"></label>
      <label>Tipo<select name="residentType"><option value="owner" ${resident.residentType !== 'tenant' && resident.residentType !== 'authorized' ? 'selected' : ''}>Propietario</option><option value="tenant" ${resident.residentType === 'tenant' ? 'selected' : ''}>Inquilino</option><option value="authorized" ${resident.residentType === 'authorized' ? 'selected' : ''}>Autorizado</option></select></label>
    </div>
    <label>Correo<input name="email" type="email" value="${escapeHtml(resident.email || '')}"></label>
    <label>Teléfono<input name="phone" inputmode="tel" value="${escapeHtml(resident.phone || '')}"></label>
    <label>Contacto de emergencia<input name="emergencyContact" value="${escapeHtml(resident.emergencyContact || '')}" placeholder="Nombre y teléfono"></label>
    <label>Estado<select name="status"><option value="active" ${resident.status !== 'inactive' ? 'selected' : ''}>Activo</option><option value="inactive" ${resident.status === 'inactive' ? 'selected' : ''}>Inactivo</option></select></label>
    <div class="form-actions"><button class="secondary-button" id="cancelResidentForm" type="button">Cancelar</button><button class="primary-button" type="submit">Guardar</button></div>
    <p class="form-message" id="residentFormMessage"></p>`;
  document.querySelector('#cancelResidentForm')?.addEventListener('click', () => { dialogTitle.textContent = 'Residentes'; renderResidents(); });
  dialogForm.onsubmit = saveResident;
}

async function saveResident(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(dialogForm).entries());
  const message = document.querySelector('#residentFormMessage');
  if(message) message.textContent = 'Guardando…';
  try {
    if (isFirebaseReady()) {
      if (editingId) await updateResident(editingId, data); else await createResident(data);
      lastSync = 0;
      await syncResidents(false);
    } else {
      saveLocal(data, editingId);
      residents = loadLocal();
      saveCache(residents);
    }
    editingId = null;
    dialogTitle.textContent = 'Residentes';
    renderResidents();
  } catch (error) { if(message) message.textContent = error.message || 'No se pudo guardar.'; }
}

async function removeResident(id) {
  const resident = residents.find((item) => item.id === id);
  if (!resident || !confirm(`¿Eliminar a ${resident.name}?`)) return;
  try {
    if (isFirebaseReady()) {
      await deleteResident(id);
      residents = residents.filter((item) => item.id !== id);
      saveCache(residents);
      renderResidents();
      lastSync = 0;
      syncResidents(true);
    } else {
      residents = loadLocal().filter((item) => item.id !== id);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(residents));
      saveCache(residents);
      renderResidents();
    }
  } catch (error) { alert(error.message || 'No se pudo eliminar.'); }
}

function loadCache() {
  try { const saved = JSON.parse(localStorage.getItem(CACHE_KEY)); if (Array.isArray(saved)) return saved; } catch {}
  return loadLocal();
}
function saveCache(items) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : [])); } catch {} }
function loadLocal() { try { const saved = JSON.parse(localStorage.getItem(LOCAL_KEY)); return Array.isArray(saved) ? saved : []; } catch { return []; } }
function saveLocal(data, id) {
  const current = loadLocal();
  const record = { id:id || crypto.randomUUID(), name:String(data.name || '').trim(), homeId:String(data.homeId || '').trim().toUpperCase(), email:String(data.email || '').trim().toLowerCase(), phone:String(data.phone || '').trim(), residentType:data.residentType || 'owner', status:data.status || 'active', emergencyContact:String(data.emergencyContact || '').trim() };
  const index = current.findIndex((item) => item.id === id);
  if (index >= 0) current[index] = record; else current.push(record);
  current.sort((a,b) => a.name.localeCompare(b.name));
  localStorage.setItem(LOCAL_KEY, JSON.stringify(current));
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char])); }

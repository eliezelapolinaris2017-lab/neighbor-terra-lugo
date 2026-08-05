import { createVehicle, deleteVehicle, isFirebaseReady, listVehicles, updateVehicle } from './firebase-service.js';

const LOCAL_KEY = 'neighbor-terra-lugo-vehicles';
const dialog = document.querySelector('#featureDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogEyebrow = document.querySelector('#dialogEyebrow');
const dialogBody = document.querySelector('#dialogBody');
const dialogForm = document.querySelector('#dialogForm');
let vehicles = [];
let editingId = null;

document.addEventListener('click', async (event) => {
  const trigger = event.target.closest('[data-neighbor-vehicles]');
  if (!trigger) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await openVehicles();
}, true);

async function openVehicles() {
  dialogEyebrow.textContent = 'Neighbor Admin';
  dialogTitle.textContent = 'Vehículos';
  dialogBody.innerHTML = '<div class="empty-state">Cargando vehículos…</div>';
  dialog.showModal();
  try { vehicles = isFirebaseReady() ? await listVehicles() : loadLocal(); }
  catch (error) { console.error(error); vehicles = loadLocal(); }
  renderVehicles();
}

function renderVehicles(filter = '') {
  const query = filter.trim().toLowerCase();
  const filtered = vehicles.filter((vehicle) => `${vehicle.plate} ${vehicle.homeId} ${vehicle.residentName} ${vehicle.make} ${vehicle.model}`.toLowerCase().includes(query));
  dialogBody.innerHTML = `
    <div class="homes-toolbar">
      <input id="vehicleSearch" type="search" placeholder="Buscar tablilla, unidad o residente" value="${escapeHtml(filter)}">
      <button class="primary-button compact-button" id="newVehicleButton" type="button">+ Nuevo</button>
    </div>
    <div class="module-list homes-list">
      ${filtered.length ? filtered.map(vehicleCard).join('') : '<div class="empty-state">No hay vehículos registrados.</div>'}
    </div>`;
  document.querySelector('#vehicleSearch').addEventListener('input', (event) => renderVehicles(event.target.value));
  document.querySelector('#newVehicleButton').addEventListener('click', () => showForm());
  document.querySelectorAll('[data-edit-vehicle]').forEach((button) => button.addEventListener('click', () => showForm(button.dataset.editVehicle)));
  document.querySelectorAll('[data-delete-vehicle]').forEach((button) => button.addEventListener('click', () => removeVehicle(button.dataset.deleteVehicle)));
}

function vehicleCard(vehicle) {
  return `<article class="home-row">
    <div><strong>${escapeHtml(vehicle.plate)}</strong><p>${escapeHtml(vehicle.make || 'Sin marca')} ${escapeHtml(vehicle.model || '')} · ${escapeHtml(vehicle.color || 'Sin color')} · ${escapeHtml(vehicle.homeId || 'Sin unidad')}</p></div>
    <div class="row-actions"><button type="button" data-edit-vehicle="${escapeHtml(vehicle.id || vehicle.plate)}">Editar</button><button type="button" class="danger-link" data-delete-vehicle="${escapeHtml(vehicle.id || vehicle.plate)}">Eliminar</button></div>
  </article>`;
}

function showForm(id = null) {
  editingId = id;
  const vehicle = vehicles.find((item) => (item.id || item.plate) === id) || {};
  dialogTitle.textContent = id ? `Editar ${vehicle.plate}` : 'Nuevo vehículo';
  dialogBody.innerHTML = `
    <label>Tablilla<input name="plate" required ${id ? 'readonly' : ''} value="${escapeHtml(vehicle.plate || '')}" placeholder="ABC-123"></label>
    <div class="form-grid"><label>Unidad<input name="homeId" value="${escapeHtml(vehicle.homeId || '')}" placeholder="B-24"></label><label>Año<input name="year" type="number" min="1950" max="2100" value="${vehicle.year || ''}"></label></div>
    <label>Residente<input name="residentName" value="${escapeHtml(vehicle.residentName || '')}" placeholder="Nombre completo"></label>
    <div class="form-grid"><label>Marca<input name="make" value="${escapeHtml(vehicle.make || '')}" placeholder="Toyota"></label><label>Modelo<input name="model" value="${escapeHtml(vehicle.model || '')}" placeholder="Corolla"></label></div>
    <div class="form-grid"><label>Color<input name="color" value="${escapeHtml(vehicle.color || '')}"></label><label>Estado<select name="status"><option value="active" ${vehicle.status !== 'inactive' ? 'selected' : ''}>Activo</option><option value="inactive" ${vehicle.status === 'inactive' ? 'selected' : ''}>Inactivo</option></select></label></div>
    <div class="form-actions"><button class="secondary-button" id="cancelVehicleForm" type="button">Cancelar</button><button class="primary-button" type="submit">Guardar</button></div>
    <p class="form-message" id="vehicleFormMessage"></p>`;
  document.querySelector('#cancelVehicleForm').addEventListener('click', () => { dialogTitle.textContent = 'Vehículos'; renderVehicles(); });
  dialogForm.onsubmit = saveVehicle;
}

async function saveVehicle(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(dialogForm).entries());
  const message = document.querySelector('#vehicleFormMessage');
  message.textContent = 'Guardando…';
  try {
    if (isFirebaseReady()) {
      if (editingId) await updateVehicle(editingId, data); else await createVehicle(data);
      vehicles = await listVehicles();
    } else {
      saveLocal(data, editingId);
      vehicles = loadLocal();
    }
    editingId = null;
    dialogTitle.textContent = 'Vehículos';
    renderVehicles();
  } catch (error) { message.textContent = error.message || 'No se pudo guardar.'; }
}

async function removeVehicle(id) {
  const vehicle = vehicles.find((item) => (item.id || item.plate) === id);
  if (!vehicle || !confirm(`¿Eliminar el vehículo ${vehicle.plate}?`)) return;
  try {
    if (isFirebaseReady()) { await deleteVehicle(id); vehicles = await listVehicles(); }
    else { vehicles = loadLocal().filter((item) => (item.id || item.plate) !== id); localStorage.setItem(LOCAL_KEY, JSON.stringify(vehicles)); }
    renderVehicles();
  } catch (error) { alert(error.message || 'No se pudo eliminar.'); }
}

function loadLocal() { try { const saved = JSON.parse(localStorage.getItem(LOCAL_KEY)); return Array.isArray(saved) ? saved : []; } catch { return []; } }
function saveLocal(data, id) {
  const current = loadLocal();
  const plate = String(data.plate || '').trim().toUpperCase();
  if (!id && current.some((item) => item.plate === plate)) throw new Error('Esa tablilla ya está registrada.');
  const record = { id:plate, plate, homeId:String(data.homeId || '').trim().toUpperCase(), residentName:String(data.residentName || '').trim(), make:String(data.make || '').trim(), model:String(data.model || '').trim(), year:Number(data.year || 0) || null, color:String(data.color || '').trim(), status:data.status || 'active' };
  const index = current.findIndex((item) => (item.id || item.plate) === (id || plate));
  if (index >= 0) current[index] = record; else current.push(record);
  current.sort((a,b) => a.plate.localeCompare(b.plate));
  localStorage.setItem(LOCAL_KEY, JSON.stringify(current));
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char])); }

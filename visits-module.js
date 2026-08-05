import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

const LOCAL_KEY = 'neighbor-terra-lugo-visits';
const dialog = document.querySelector('#featureDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogEyebrow = document.querySelector('#dialogEyebrow');
const dialogBody = document.querySelector('#dialogBody');
const dialogForm = document.querySelector('#dialogForm');

let db = null;
let auth = null;
let firebaseAvailable = false;
let visits = [];
let editingId = null;

initializeVisits();

document.addEventListener('click', async (event) => {
  const card = event.target.closest('.action-card, .nav-item');
  if (!card) return;
  const text = card.textContent.toLowerCase();
  if (!text.includes('visita') && !text.includes('entrada')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await openVisits();
}, true);

async function initializeVisits() {
  try {
    const appModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const firestoreModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
    auth = authModule.getAuth(app);
    db = firestoreModule.getFirestore(app);
    firebaseAvailable = true;
  } catch (error) {
    console.warn('Visitas operará en modo local.', error);
  }
}

function rootPath() {
  return ['apps', APP_NAMESPACE, 'communities', COMMUNITY_ID];
}

async function openVisits() {
  dialogEyebrow.textContent = 'Neighbor Access';
  dialogTitle.textContent = 'Visitas';
  dialogBody.innerHTML = '<div class="empty-state">Cargando visitas…</div>';
  dialog.showModal();

  try {
    visits = firebaseAvailable && auth?.currentUser ? await listFirebaseVisits() : loadLocalVisits();
  } catch (error) {
    console.error(error);
    visits = loadLocalVisits();
  }
  renderVisits();
}

async function listFirebaseVisits() {
  const { collection, getDocs, orderBy, query } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  const snapshot = await getDocs(query(collection(db, ...rootPath(), 'visits'), orderBy('startsAt', 'desc')));
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function renderVisits(filter = '') {
  const q = filter.trim().toLowerCase();
  const filtered = visits.filter((visit) => `${visit.visitorName || ''} ${visit.homeId || ''} ${visit.plate || ''} ${visit.status || ''}`.toLowerCase().includes(q));
  dialogTitle.textContent = 'Visitas';
  dialogBody.innerHTML = `
    <div class="homes-toolbar">
      <input id="visitSearch" type="search" placeholder="Nombre, unidad o tablilla" value="${escapeHtml(filter)}">
      <button class="primary-button compact-button" id="newVisitButton" type="button">+ Nueva</button>
    </div>
    <div class="module-list">
      ${filtered.length ? filtered.map(visitRow).join('') : '<div class="empty-state">No hay visitas registradas.</div>'}
    </div>`;

  document.querySelector('#visitSearch').addEventListener('input', (event) => renderVisits(event.target.value));
  document.querySelector('#newVisitButton').addEventListener('click', () => showVisitForm());
  document.querySelectorAll('[data-view-visit]').forEach((button) => button.addEventListener('click', () => showVisitPass(button.dataset.viewVisit)));
  document.querySelectorAll('[data-edit-visit]').forEach((button) => button.addEventListener('click', () => showVisitForm(button.dataset.editVisit)));
}

function visitRow(visit) {
  const statusLabel = { pending: 'Pendiente', active: 'Dentro', completed: 'Salió', revoked: 'Revocada', expired: 'Expirada' }[visit.status] || visit.status;
  const starts = formatDate(visit.startsAt);
  return `
    <article class="home-row">
      <div>
        <strong>${escapeHtml(visit.visitorName || 'Visitante')}</strong>
        <p>${escapeHtml(visit.homeId || 'Sin unidad')} · ${escapeHtml(visit.plate || 'Sin tablilla')} · ${escapeHtml(statusLabel)} · ${starts}</p>
      </div>
      <div class="row-actions">
        <button type="button" data-view-visit="${escapeHtml(visit.id)}">Pase</button>
        <button type="button" data-edit-visit="${escapeHtml(visit.id)}">Editar</button>
      </div>
    </article>`;
}

function showVisitForm(id = null) {
  editingId = id;
  const visit = visits.find((item) => item.id === id) || {};
  const startValue = toLocalInput(visit.startsAt) || toLocalInput(new Date(Date.now() + 30 * 60000));
  const endValue = toLocalInput(visit.expiresAt) || toLocalInput(new Date(Date.now() + 4 * 3600000));

  dialogTitle.textContent = id ? 'Editar visita' : 'Nueva visita';
  dialogBody.innerHTML = `
    <label>Nombre del visitante<input name="visitorName" required value="${escapeHtml(visit.visitorName || '')}"></label>
    <div class="form-grid">
      <label>Unidad<input name="homeId" required value="${escapeHtml(visit.homeId || '')}" placeholder="B-24"></label>
      <label>Teléfono<input name="phone" value="${escapeHtml(visit.phone || '')}" inputmode="tel"></label>
    </div>
    <label>Tipo<select name="visitType">
      ${['Familiar','Amigo','Delivery','Técnico','Contratista','Otro'].map((type) => `<option ${visit.visitType === type ? 'selected' : ''}>${type}</option>`).join('')}
    </select></label>
    <div class="form-grid">
      <label>Tablilla<input name="plate" value="${escapeHtml(visit.plate || '')}"></label>
      <label>Vehículo<input name="vehicle" value="${escapeHtml(visit.vehicle || '')}" placeholder="Toyota Corolla gris"></label>
    </div>
    <label>Comienza<input name="startsAt" type="datetime-local" required value="${startValue}"></label>
    <label>Expira<input name="expiresAt" type="datetime-local" required value="${endValue}"></label>
    ${id ? `<label>Estado<select name="status">
      <option value="pending" ${visit.status === 'pending' ? 'selected' : ''}>Pendiente</option>
      <option value="active" ${visit.status === 'active' ? 'selected' : ''}>Dentro</option>
      <option value="completed" ${visit.status === 'completed' ? 'selected' : ''}>Salió</option>
      <option value="revoked" ${visit.status === 'revoked' ? 'selected' : ''}>Revocada</option>
    </select></label>` : ''}
    <div class="form-actions">
      <button class="secondary-button" id="cancelVisit" type="button">Cancelar</button>
      <button class="primary-button" type="submit">Guardar</button>
    </div>
    <p class="form-message" id="visitMessage"></p>`;

  document.querySelector('#cancelVisit').addEventListener('click', () => renderVisits());
  dialogForm.onsubmit = saveVisit;
}

async function saveVisit(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(dialogForm).entries());
  const message = document.querySelector('#visitMessage');
  const startsAt = new Date(data.startsAt);
  const expiresAt = new Date(data.expiresAt);
  if (expiresAt <= startsAt) {
    message.textContent = 'La expiración debe ser posterior al inicio.';
    return;
  }

  message.textContent = 'Guardando…';
  const record = {
    visitorName: String(data.visitorName || '').trim(),
    homeId: String(data.homeId || '').trim().toUpperCase(),
    phone: String(data.phone || '').trim(),
    visitType: data.visitType || 'Otro',
    plate: String(data.plate || '').trim().toUpperCase(),
    vehicle: String(data.vehicle || '').trim(),
    startsAt,
    expiresAt,
    status: data.status || 'pending'
  };

  try {
    if (firebaseAvailable && auth?.currentUser) {
      await saveFirebaseVisit(record, editingId);
      visits = await listFirebaseVisits();
    } else {
      saveLocalVisit(record, editingId);
      visits = loadLocalVisits();
    }
    editingId = null;
    renderVisits();
  } catch (error) {
    message.textContent = error.message || 'No se pudo guardar la visita.';
  }
}

async function saveFirebaseVisit(record, id) {
  const { addDoc, collection, doc, serverTimestamp, setDoc, updateDoc, Timestamp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  const payload = {
    ...record,
    startsAt: Timestamp.fromDate(record.startsAt),
    expiresAt: Timestamp.fromDate(record.expiresAt),
    updatedBy: auth.currentUser.uid,
    updatedAt: serverTimestamp()
  };
  if (id) {
    await updateDoc(doc(db, ...rootPath(), 'visits', id), payload);
    return;
  }
  const code = generateCode();
  const token = crypto.randomUUID();
  await addDoc(collection(db, ...rootPath(), 'visits'), {
    ...payload,
    code,
    token,
    createdBy: auth.currentUser.uid,
    createdAt: serverTimestamp()
  });
}

function saveLocalVisit(record, id) {
  const current = loadLocalVisits();
  const now = new Date().toISOString();
  if (id) {
    const index = current.findIndex((item) => item.id === id);
    if (index >= 0) current[index] = { ...current[index], ...serializeDates(record), updatedAt: now };
  } else {
    current.unshift({ id: crypto.randomUUID(), ...serializeDates(record), code: generateCode(), token: crypto.randomUUID(), createdAt: now, updatedAt: now });
  }
  localStorage.setItem(LOCAL_KEY, JSON.stringify(current));
}

async function showVisitPass(id) {
  const visit = visits.find((item) => item.id === id);
  if (!visit) return;
  dialogTitle.textContent = 'Neighbor Pass';
  const payload = JSON.stringify({ visitId: visit.id, communityId: COMMUNITY_ID, token: visit.token || '', expiresAt: dateValue(visit.expiresAt) });
  dialogBody.innerHTML = `
    <div class="module-list">
      <article style="text-align:center">
        <p class="eyebrow">VISITA AUTORIZADA</p>
        <h2>${escapeHtml(visit.visitorName)}</h2>
        <p>Unidad ${escapeHtml(visit.homeId)} · ${formatDate(visit.expiresAt)}</p>
        <div id="visitQr" style="display:grid;place-items:center;min-height:220px"></div>
        <p>Código de respaldo</p>
        <h2 style="letter-spacing:.22em">${escapeHtml(visit.code || '------')}</h2>
        ${visit.status === 'pending' ? `<button class="secondary-button" id="revokeVisit" type="button">Revocar visita</button>` : ''}
      </article>
    </div>
    <div class="form-actions"><button class="primary-button" id="backToVisits" type="button">Volver</button></div>`;

  document.querySelector('#backToVisits').addEventListener('click', () => renderVisits());
  document.querySelector('#revokeVisit')?.addEventListener('click', () => changeVisitStatus(visit, 'revoked'));

  try {
    const QRCode = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, payload, { width: 210, margin: 1 });
    document.querySelector('#visitQr').appendChild(canvas);
  } catch {
    document.querySelector('#visitQr').innerHTML = '<p>No se pudo generar el QR. Usa el código de respaldo.</p>';
  }
}

async function changeVisitStatus(visit, status) {
  try {
    if (firebaseAvailable && auth?.currentUser) {
      const { doc, serverTimestamp, updateDoc } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
      await updateDoc(doc(db, ...rootPath(), 'visits', visit.id), { status, updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
      visits = await listFirebaseVisits();
    } else {
      visits = loadLocalVisits().map((item) => item.id === visit.id ? { ...item, status } : item);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(visits));
    }
    renderVisits();
  } catch (error) {
    alert(error.message || 'No se pudo cambiar el estado.');
  }
}

function loadLocalVisits() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function serializeDates(record) {
  return { ...record, startsAt: record.startsAt.toISOString(), expiresAt: record.expiresAt.toISOString() };
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function dateValue(value) {
  if (!value) return '';
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return new Date(value).toISOString();
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return new Intl.DateTimeFormat('es-PR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function toLocalInput(value) {
  const date = value ? (typeof value.toDate === 'function' ? value.toDate() : new Date(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

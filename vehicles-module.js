import { createVehicle, deleteVehicle, isFirebaseReady, listVehicles, updateVehicle } from './firebase-service.js';

const LOCAL_KEY='neighbor-terra-lugo-vehicles';
const dialog=document.querySelector('#featureDialog'),dialogTitle=document.querySelector('#dialogTitle'),dialogEyebrow=document.querySelector('#dialogEyebrow'),dialogBody=document.querySelector('#dialogBody'),dialogForm=document.querySelector('#dialogForm');
let vehicles=loadLocal(),editingId=null,syncing=false;

document.addEventListener('click',event=>{const trigger=event.target.closest('[data-neighbor-vehicles]');if(!trigger)return;event.preventDefault();event.stopImmediatePropagation();openVehicles();},true);

function openVehicles(){
  dialogEyebrow.textContent='Neighbor Admin'; dialogTitle.textContent='Vehículos'; dialog.showModal();
  vehicles=loadLocal(); renderVehicles('',isFirebaseReady());
  if(isFirebaseReady()) syncVehicles();
}
async function syncVehicles(){
  if(syncing)return; syncing=true;
  try{const fresh=await listVehicles();vehicles=fresh;saveCache(fresh);if(dialog.open&&dialogTitle.textContent==='Vehículos')renderVehicles();}
  catch(error){console.error(error);}
  finally{syncing=false;}
}
function renderVehicles(filter='',showSync=false){
  const query=filter.trim().toLowerCase(),filtered=vehicles.filter(v=>`${v.plate} ${v.homeId} ${v.residentName} ${v.make} ${v.model}`.toLowerCase().includes(query));
  dialogBody.innerHTML=`${showSync?'<p class="form-message">Mostrando datos guardados · Sincronizando…</p>':''}<div class="homes-toolbar"><input id="vehicleSearch" type="search" placeholder="Buscar tablilla, unidad o residente" value="${escapeHtml(filter)}"><button class="primary-button compact-button" id="newVehicleButton" type="button">+ Nuevo</button></div><div class="module-list homes-list">${filtered.length?filtered.map(vehicleCard).join(''):'<div class="empty-state">No hay vehículos registrados.</div>'}</div>`;
  document.querySelector('#vehicleSearch').addEventListener('input',e=>renderVehicles(e.target.value));
  document.querySelector('#newVehicleButton').addEventListener('click',()=>showForm());
  document.querySelectorAll('[data-edit-vehicle]').forEach(b=>b.addEventListener('click',()=>showForm(b.dataset.editVehicle)));
  document.querySelectorAll('[data-delete-vehicle]').forEach(b=>b.addEventListener('click',()=>removeVehicle(b.dataset.deleteVehicle)));
}
function vehicleCard(v){return `<article class="home-row"><div><strong>${escapeHtml(v.plate)}</strong><p>${escapeHtml(v.make||'Sin marca')} ${escapeHtml(v.model||'')} · ${escapeHtml(v.color||'Sin color')} · ${escapeHtml(v.homeId||'Sin unidad')}</p></div><div class="row-actions"><button type="button" data-edit-vehicle="${escapeHtml(v.id||v.plate)}">Editar</button><button type="button" class="danger-link" data-delete-vehicle="${escapeHtml(v.id||v.plate)}">Eliminar</button></div></article>`;}
function showForm(id=null){editingId=id;const v=vehicles.find(x=>(x.id||x.plate)===id)||{};dialogTitle.textContent=id?`Editar ${v.plate}`:'Nuevo vehículo';dialogBody.innerHTML=`<label>Tablilla<input name="plate" required ${id?'readonly':''} value="${escapeHtml(v.plate||'')}" placeholder="ABC-123"></label><div class="form-grid"><label>Unidad<input name="homeId" value="${escapeHtml(v.homeId||'')}" placeholder="B-24"></label><label>Año<input name="year" type="number" min="1950" max="2100" value="${v.year||''}"></label></div><label>Residente<input name="residentName" value="${escapeHtml(v.residentName||'')}"></label><div class="form-grid"><label>Marca<input name="make" value="${escapeHtml(v.make||'')}"></label><label>Modelo<input name="model" value="${escapeHtml(v.model||'')}"></label></div><div class="form-grid"><label>Color<input name="color" value="${escapeHtml(v.color||'')}"></label><label>Estado<select name="status"><option value="active" ${v.status!=='inactive'?'selected':''}>Activo</option><option value="inactive" ${v.status==='inactive'?'selected':''}>Inactivo</option></select></label></div><div class="form-actions"><button class="secondary-button" id="cancelVehicleForm" type="button">Cancelar</button><button class="primary-button" type="submit">Guardar</button></div><p class="form-message" id="vehicleFormMessage"></p>`;document.querySelector('#cancelVehicleForm').onclick=()=>{dialogTitle.textContent='Vehículos';renderVehicles();};dialogForm.onsubmit=saveVehicle;}
async function saveVehicle(event){event.preventDefault();const data=Object.fromEntries(new FormData(dialogForm).entries()),message=document.querySelector('#vehicleFormMessage');message.textContent='Guardando…';try{if(isFirebaseReady()){if(editingId)await updateVehicle(editingId,data);else await createVehicle(data);await syncVehicles();}else{saveLocal(data,editingId);vehicles=loadLocal();}editingId=null;dialogTitle.textContent='Vehículos';renderVehicles();}catch(error){message.textContent=error.message||'No se pudo guardar.';}}
async function removeVehicle(id){const v=vehicles.find(x=>(x.id||x.plate)===id);if(!v||!confirm(`¿Eliminar el vehículo ${v.plate}?`))return;try{if(isFirebaseReady()){await deleteVehicle(id);await syncVehicles();}else{vehicles=loadLocal().filter(x=>(x.id||x.plate)!==id);saveCache(vehicles);}renderVehicles();}catch(error){alert(error.message||'No se pudo eliminar.');}}
function loadLocal(){try{const saved=JSON.parse(localStorage.getItem(LOCAL_KEY));return Array.isArray(saved)?saved:[];}catch{return[];}}
function saveCache(items){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(items));}catch{}}
function saveLocal(data,id){const current=loadLocal(),plate=String(data.plate||'').trim().toUpperCase();if(!id&&current.some(x=>x.plate===plate))throw new Error('Esa tablilla ya está registrada.');const record={id:plate,plate,homeId:String(data.homeId||'').trim().toUpperCase(),residentName:String(data.residentName||'').trim(),make:String(data.make||'').trim(),model:String(data.model||'').trim(),year:Number(data.year||0)||null,color:String(data.color||'').trim(),status:data.status||'active'};const index=current.findIndex(x=>(x.id||x.plate)===(id||plate));if(index>=0)current[index]=record;else current.push(record);current.sort((a,b)=>a.plate.localeCompare(b.plate));saveCache(current);}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

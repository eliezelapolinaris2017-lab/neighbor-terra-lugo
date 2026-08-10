const FINANCE_CACHE='neighbor-terra-lugo-finance-cache';
const USER_CACHE='neighbor-terra-lugo-current-user';
const dialog=document.querySelector('#featureDialog');
const body=document.querySelector('#dialogBody');
const title=document.querySelector('#dialogTitle');

function readJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key));return value??fallback;}catch{return fallback;}}
function financeRecords(){const rows=readJson(FINANCE_CACHE,[]);return Array.isArray(rows)?rows:[];}
function currentUser(){const user=readJson(USER_CACHE,{});return user&&typeof user==='object'?user:{};}
function isAdmin(){return document.querySelector('#roleBadge')?.textContent?.toLowerCase().includes('admin');}
function money(value){return Number(value||0).toLocaleString('en-US',{style:'currency',currency:'USD'});}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function payment(row){return row.type==='payment'||row.type==='credit';}
function unitRows(homeId){const home=String(homeId||'').trim().toUpperCase();return financeRecords().filter(row=>String(row.homeId||'').trim().toUpperCase()===home).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));}
function totals(rows){return rows.reduce((acc,row)=>{const n=Number(row.amount||0);payment(row)?acc.payments+=n:acc.charges+=n;acc.balance=acc.charges-acc.payments;return acc;},{charges:0,payments:0,balance:0});}

function enhanceFinance(){
  if(!dialog?.open||!body||!title)return;
  if(!['Finanzas','Estado de cuenta'].includes(title.textContent))return;
  if(body.querySelector('[data-finance-statement-tools]'))return;
  const toolbar=body.querySelector('.homes-toolbar');
  if(!toolbar)return;
  const user=currentUser();
  const tools=document.createElement('div');
  tools.dataset.financeStatementTools='true';
  tools.className='finance-statement-tools';
  if(isAdmin()){
    const homes=[...new Set(financeRecords().map(row=>String(row.homeId||'').trim().toUpperCase()).filter(Boolean))].sort();
    tools.innerHTML=`<select id="statementHome" aria-label="Unidad para estado de cuenta"><option value="">Estado por unidad…</option>${homes.map(home=>`<option value="${esc(home)}">${esc(home)}</option>`).join('')}</select><button id="printStatement" type="button" class="secondary-button">Ver estado</button>`;
    tools.querySelector('#printStatement').onclick=()=>{const home=tools.querySelector('#statementHome').value;if(!home){tools.querySelector('#statementHome').focus();return;}openStatement(home);};
  }else{
    const home=String(user.homeId||'').trim().toUpperCase();
    tools.innerHTML=`<button id="printMyStatement" type="button" class="secondary-button" ${home?'':'disabled'}>Imprimir estado de cuenta</button>`;
    tools.querySelector('#printMyStatement').onclick=()=>home&&openStatement(home);
  }
  toolbar.insertAdjacentElement('afterend',tools);
}

function openStatement(homeId){
  const rows=unitRows(homeId),sum=totals(rows),user=currentUser();
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Estado de cuenta ${esc(homeId)}</title><style>body{font-family:Arial,sans-serif;color:#142033;margin:36px}header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #0c4f8a;padding-bottom:18px;margin-bottom:24px}h1{margin:0;font-size:28px}small{color:#64748b}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.summary div{border:1px solid #dbe4ee;border-radius:12px;padding:14px}.summary span{display:block;color:#64748b;font-size:12px}.summary strong{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:10px;border-bottom:1px solid #e4eaf0;text-align:left;font-size:13px}th{background:#f4f7fa}.amount{text-align:right}.payment{color:#147447}.balance{font-weight:700}.actions{margin:24px 0}.actions button{padding:10px 14px;border:0;border-radius:8px;background:#0c4f8a;color:white;font-weight:700;cursor:pointer}@media print{.actions{display:none}body{margin:18px}}</style></head><body><header><div><h1>Neighbor</h1><small>Terra Lugo · Cupey Bajo</small></div><div><strong>Estado de cuenta</strong><br><small>Unidad ${esc(homeId)} · ${new Date().toLocaleDateString('es-PR')}</small></div></header><div class="summary"><div><span>Cargos</span><strong>${money(sum.charges)}</strong></div><div><span>Pagos</span><strong>${money(sum.payments)}</strong></div><div><span>Balance</span><strong>${money(sum.balance)}</strong></div></div><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Referencia</th><th class="amount">Movimiento</th><th class="amount">Balance</th></tr></thead><tbody>${statementRows(rows)}</tbody></table><div class="actions"><button onclick="window.print()">Imprimir estado</button></div><small>Generado por Neighbor${user.name?` · ${esc(user.name)}`:''}. Los pagos registrados corresponden a cheques recibidos.</small></body></html>`;
  const win=window.open('','neighbor-statement','width=960,height=760');if(!win){alert('Permite ventanas emergentes para imprimir el estado de cuenta.');return;}win.document.open();win.document.write(html);win.document.close();
}

function statementRows(rows){
  if(!rows.length)return'<tr><td colspan="5">No hay movimientos para esta unidad.</td></tr>';
  let running=0;
  return rows.map(row=>{const n=Number(row.amount||0),isPayment=payment(row);running+=isPayment?-n:n;const ref=isPayment?`Cheque #${row.checkNumber||row.reference||'—'}`:(row.autoMonthly?'Cargo automático':row.reference||'');return `<tr><td>${esc(row.date||'')}</td><td>${esc(row.description||'Movimiento')}</td><td>${esc(ref)}</td><td class="amount ${isPayment?'payment':''}">${isPayment?'−':'+'}${money(n)}</td><td class="amount balance">${money(running)}</td></tr>`;}).join('');
}

let queued=false;
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhanceFinance();});}
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
dialog?.addEventListener('close',()=>{queued=false;});
window.addEventListener('pageshow',schedule);
schedule();

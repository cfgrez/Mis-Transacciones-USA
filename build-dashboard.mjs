import fs from 'node:fs';
import path from 'node:path';

// DATA_FILE is optional. In production the dashboard starts without embedded
// financial data and the user imports the CSV locally in the browser.
const source = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : null;
const out = path.resolve('dist/index.html');

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift();
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

function money(v) {
  if (!v) return 0;
  const neg = /^-/.test(v.trim()) || /^\(.*\)$/.test(v.trim());
  const n = Number(v.replace(/[^0-9.]/g, '')) || 0;
  return neg ? -n : n;
}

function isoDate(us) {
  const [m,d,y] = us.slice(0, 10).split('/');
  return `${y}-${m}-${d}`;
}

const raw = source ? parseCSV(fs.readFileSync(source, 'utf8')) : [];
const tx = raw.map((r, i) => ({
  id: i + 1,
  date: isoDate(r.Date),
  action: r.Action.trim(),
  symbol: r.Symbol.trim() || '—',
  description: r.Description.trim(),
  quantity: Number((r.Quantity || '0').replace(/,/g, '')) || 0,
  price: money(r.Price),
  fees: Math.abs(money(r['Fees & Comm'])),
  amount: money(r.Amount),
  realized: 0,
  matchedQty: 0
})).sort((a,b) => a.date.localeCompare(b.date) || a.id - b.id);

// Estimación FIFO: asigna el resultado al movimiento que cierra una posición.
const lots = new Map();
for (const t of tx) {
  let direction = 0;
  if (t.action === 'Buy' || t.action === 'Buy to Open') direction = 1;
  if (t.action === 'Sell' || t.action === 'Sell to Close' || t.action === 'Sell Short') direction = -1;
  if (!direction || !t.quantity || !t.price || t.symbol === '—') continue;
  const q = t.quantity;
  const queue = lots.get(t.symbol) || [];
  let remaining = q;
  let realized = 0;
  let matched = 0;
  while (remaining > 1e-10 && queue.length && Math.sign(queue[0].qty) !== direction) {
    const lot = queue[0];
    const m = Math.min(remaining, Math.abs(lot.qty));
    const pnl = direction === -1 ? (t.price - lot.price) * m : (lot.price - t.price) * m;
    realized += pnl - (lot.feePerShare * m);
    matched += m;
    lot.qty += direction * m;
    remaining -= m;
    if (Math.abs(lot.qty) < 1e-10) queue.shift();
  }
  if (matched > 0) realized -= t.fees * (matched / q);
  if (remaining > 1e-10) queue.push({qty: direction * remaining, price: t.price, feePerShare: t.fees / q});
  lots.set(t.symbol, queue);
  t.realized = Number(realized.toFixed(6));
  t.matchedQty = matched;
}

const data = JSON.stringify(tx).replace(/</g, '\\u003c');
const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Dashboard interactivo de transacciones de inversión 2026">
  <title>Dashboard de transacciones · 2026</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2307131f'/%3E%3Cpath d='M13 44l12-13 9 8 17-21' fill='none' stroke='%2349d7b0' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
  <style>
    :root{--bg:#07131f;--panel:#0d1d2b;--panel2:#102536;--line:#1d3a4d;--text:#eef7f7;--muted:#91a9b6;--accent:#49d7b0;--blue:#5aa8ff;--red:#ff6b7a;--amber:#f4bf58;--shadow:0 18px 45px rgba(0,0,0,.24)}
    *{box-sizing:border-box} body{margin:0;background:radial-gradient(circle at 90% -10%,#123c4d 0,transparent 35%),var(--bg);color:var(--text);font:16px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif} button,input,select{font:inherit} button{cursor:pointer}
    .shell{max-width:1500px;margin:auto;padding:26px}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:22px}.eyebrow{color:var(--accent);font-size:.8rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.top h1{font-size:clamp(1.7rem,3vw,2.65rem);line-height:1.05;margin:.28rem 0}.sub{color:var(--muted);margin:0}.pill{border:1px solid var(--line);background:#0b1a27;color:var(--muted);padding:8px 12px;border-radius:999px;font-size:.82rem;white-space:nowrap}.top-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;justify-content:flex-end}.primary{border:1px solid #2d7465;background:var(--accent);color:#062019;font-weight:800;padding:9px 14px;border-radius:10px}.secondary{border:1px solid var(--line);background:var(--panel);color:var(--text);padding:9px 13px;border-radius:10px}
    .filters{position:sticky;top:0;z-index:8;display:grid;grid-template-columns:1.7fr repeat(5,minmax(125px,1fr)) auto;gap:10px;background:rgba(7,19,31,.9);backdrop-filter:blur(16px);padding:12px 0 16px}.field label{display:block;color:var(--muted);font-size:.76rem;margin:0 0 5px}.field input,.field select{width:100%;border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:10px;padding:10px 12px;outline:none}.field input:focus,.field select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(73,215,176,.12)}.reset{align-self:end;border:1px solid var(--line);background:transparent;color:var(--text);padding:10px 14px;border-radius:10px}
    .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:12px;margin:4px 0 18px}.card,.panel{background:linear-gradient(145deg,rgba(16,37,54,.98),rgba(11,27,41,.98));border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow)}.card{padding:16px}.klabel{color:var(--muted);font-size:.78rem}.kvalue{font-size:clamp(1.2rem,2vw,1.75rem);font-weight:800;margin:5px 0 1px}.kfoot{color:var(--muted);font-size:.75rem}.positive{color:var(--accent)}.negative{color:var(--red)}
    .grid{display:grid;grid-template-columns:1.7fr 1fr;gap:14px}.panel{padding:17px;min-width:0}.panel h2{font-size:1rem;margin:0}.panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.legend{display:flex;gap:12px;color:var(--muted);font-size:.73rem}.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:5px}.chart{height:260px;position:relative}.wide{grid-column:1/-1}.split{display:grid;grid-template-columns:1fr 1fr;gap:14px}.bars{display:flex;flex-direction:column;gap:10px}.barrow{display:grid;grid-template-columns:62px 1fr 100px;align-items:center;gap:10px;font-size:.82rem}.track{height:9px;background:#183143;border-radius:99px;overflow:hidden}.fill{height:100%;border-radius:99px}.num{text-align:right;font-variant-numeric:tabular-nums}.donut-wrap{display:grid;grid-template-columns:170px 1fr;align-items:center;gap:18px}.donut{width:160px;height:160px;border-radius:50%;position:relative}.donut:after{content:'';position:absolute;inset:29px;border-radius:50%;background:var(--panel)}.action-list{display:grid;gap:7px}.action-item{display:flex;justify-content:space-between;gap:10px;font-size:.82rem;color:var(--muted)}
    .table-tools{display:flex;gap:10px;align-items:center}.export{border:1px solid #2d645b;background:#10352f;color:#bcf8e8;border-radius:9px;padding:8px 11px}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px}table{width:100%;border-collapse:collapse;min-width:900px;font-size:.82rem}th{position:sticky;top:0;background:#122b3c;color:#a7bdc7;text-align:left;padding:10px 12px;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em}td{padding:9px 12px;border-top:1px solid #173244;white-space:nowrap}.tag{display:inline-flex;padding:3px 8px;border-radius:999px;font-size:.7rem;background:#173347}.buy{color:#70d9ff}.sell{color:#ffb56d}.pager{display:flex;justify-content:space-between;align-items:center;color:var(--muted);font-size:.8rem;margin-top:10px}.pager button{border:1px solid var(--line);background:var(--panel);color:var(--text);padding:7px 10px;border-radius:8px}.pager button:disabled{opacity:.35}.note{color:var(--muted);font-size:.78rem;margin:14px 2px 0}.empty{height:100%;display:grid;place-items:center;color:var(--muted)}
    dialog{width:min(620px,calc(100% - 28px));border:1px solid var(--line);border-radius:18px;background:var(--panel);color:var(--text);padding:0;box-shadow:0 28px 80px rgba(0,0,0,.55)}dialog::backdrop{background:rgba(2,8,13,.72);backdrop-filter:blur(5px)}.modal-head,.modal-body,.modal-foot{padding:18px 20px}.modal-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line)}.modal-head h2{margin:0;font-size:1.15rem}.close{border:0;background:transparent;color:var(--muted);font-size:1.5rem}.modal-body{display:grid;gap:16px}.filebox{border:1px dashed #356278;border-radius:13px;padding:18px;background:#0a1a27}.filebox input{width:100%;margin-top:8px}.modes{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mode{border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;gap:9px;align-items:flex-start;background:#0a1a27}.mode b{display:block}.mode small{display:block;color:var(--muted);margin-top:2px}.import-status{min-height:44px;border-radius:10px;padding:10px 12px;background:#091925;color:var(--muted);font-size:.82rem}.modal-foot{display:flex;justify-content:space-between;gap:10px;border-top:1px solid var(--line)}.foot-right{display:flex;gap:9px}.danger{border:1px solid #6d3340;background:transparent;color:#ff9eaa;padding:9px 12px;border-radius:10px}
    svg{width:100%;height:100%;overflow:visible}.axis{stroke:#294759;stroke-width:1}.gridline{stroke:#173446;stroke-width:1}.axistext{fill:#7892a0;font-size:11px}.tooltip{position:fixed;display:none;background:#06111b;border:1px solid var(--line);padding:8px 10px;border-radius:8px;font-size:.78rem;pointer-events:none;z-index:20;box-shadow:var(--shadow)}
    @media(max-width:980px){.filters{grid-template-columns:repeat(2,1fr)}.reset{align-self:auto}.kpis{grid-template-columns:repeat(2,1fr)}.grid,.split{grid-template-columns:1fr}.wide{grid-column:auto}.donut-wrap{grid-template-columns:150px 1fr}.top{flex-direction:column}.top-actions{justify-content:flex-start}.pill{white-space:normal}}
    @media(max-width:560px){.shell{padding:18px 14px}.filters{position:relative;grid-template-columns:1fr}.kpis{grid-template-columns:1fr 1fr}.card{padding:13px}.grid{gap:10px}.panel{padding:13px}.chart{height:220px}.donut-wrap{grid-template-columns:1fr}.donut{margin:auto}.barrow{grid-template-columns:48px 1fr 82px}.table-tools{flex-direction:column;align-items:flex-end}}
  </style>
</head>
<body>
<main class="shell">
  <header class="top"><div><div class="eyebrow">Cuenta de inversión · USD</div><h1>Dashboard de transacciones</h1><p class="sub" id="dataSubtitle">Base consolidada guardada en este navegador</p></div><div class="top-actions"><div class="pill" id="scopePill"></div><button class="primary" id="updateData">Actualizar datos</button></div></header>
  <section class="filters" aria-label="Filtros">
    <div class="field"><label for="search">Buscar símbolo o descripción</label><input id="search" type="search" placeholder="Ej. INTC, Microsoft…"></div>
    <div class="field"><label for="symbol">Símbolo</label><select id="symbol"><option value="">Todos</option></select></div>
    <div class="field"><label for="category">Categoría</label><select id="category"><option value="">Todas</option><option value="trades">Operaciones</option><option value="transfers">Transferencias</option><option value="interest">Intereses</option><option value="dividends">Dividendos</option><option value="fees">Con comisiones</option><option value="taxes">Impuestos</option><option value="other">Otros</option></select></div>
    <div class="field"><label for="action">Tipo de movimiento</label><select id="action"><option value="">Todos</option></select></div>
    <div class="field"><label for="from">Desde</label><input id="from" type="date"></div>
    <div class="field"><label for="to">Hasta</label><input id="to" type="date"></div>
    <button class="reset" id="reset">Limpiar</button>
  </section>
  <section class="kpis">
    <div class="card"><div class="klabel">Movimientos</div><div class="kvalue" id="kCount">—</div><div class="kfoot" id="kDays">—</div></div>
    <div class="card"><div class="klabel">Volumen operado</div><div class="kvalue" id="kVolume">—</div><div class="kfoot">Compras + ventas en valor absoluto</div></div>
    <div class="card"><div class="klabel">P&amp;L realizado estimado</div><div class="kvalue" id="kPnl">—</div><div class="kfoot">FIFO; excluye transferencias e ingresos</div></div>
    <div class="card"><div class="klabel">Comisiones</div><div class="kvalue" id="kFees">—</div><div class="kfoot" id="kFeeRate">—</div></div>
    <div class="card"><div class="klabel">Transferencias externas netas</div><div class="kvalue" id="kTransfers">—</div><div class="kfoot" id="kTransferFoot">Entradas y salidas reales de efectivo</div></div>
    <div class="card"><div class="klabel">Dividendos e intereses</div><div class="kvalue" id="kIncome">—</div><div class="kfoot" id="kIncomeFoot">Ingresos registrados</div></div>
    <div class="card"><div class="klabel">Flujo neto de caja</div><div class="kvalue" id="kCash">—</div><div class="kfoot">No equivale a rentabilidad</div></div>
  </section>
  <section class="grid">
    <article class="panel"><div class="panel-head"><h2>Evolución diaria</h2><div class="legend"><span><i class="dot" style="background:var(--accent)"></i>P&amp;L acumulado</span><span><i class="dot" style="background:var(--blue)"></i>P&amp;L diario</span></div></div><div class="chart" id="lineChart"></div></article>
    <article class="panel"><div class="panel-head"><h2>Composición de movimientos</h2></div><div class="donut-wrap"><div class="donut" id="donut"></div><div class="action-list" id="actions"></div></div></article>
    <article class="panel"><div class="panel-head"><h2>Símbolos por P&amp;L realizado</h2><span class="kfoot">Top 10 por magnitud</span></div><div class="bars" id="pnlBars"></div></article>
    <article class="panel"><div class="panel-head"><h2>Símbolos más operados</h2><span class="kfoot">Por volumen USD</span></div><div class="bars" id="volumeBars"></div></article>
    <article class="panel wide"><div class="panel-head"><div><h2>Detalle de transacciones</h2><div class="kfoot" id="tableCount"></div></div><div class="table-tools"><button class="export" id="export">Exportar selección CSV</button></div></div><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Acción</th><th>Símbolo</th><th>Descripción</th><th>Cantidad</th><th>Precio</th><th>Comisión</th><th>Monto</th><th>P&amp;L FIFO</th></tr></thead><tbody id="tbody"></tbody></table></div><div class="pager"><span id="pageInfo"></span><div><button id="prev">Anterior</button> <button id="next">Siguiente</button></div></div></article>
  </section>
  <p class="note">Los signos se interpretan según el tipo de movimiento: compras y retiros restan; ventas, aportes, dividendos e intereses suman. Las transferencias internas y los asientos de migración entre corredores no se consideran flujo de caja. El P&amp;L realizado es una estimación FIFO y no incorpora posiciones abiertas, tipo de cambio ni impuestos; contrástalo con el estado oficial del corredor.</p>
</main><div class="tooltip" id="tooltip"></div>
<dialog id="importDialog">
  <div class="modal-head"><h2>Actualizar transacciones</h2><button class="close" id="closeDialog" aria-label="Cerrar">×</button></div>
  <div class="modal-body">
    <div class="filebox"><b>1. Selecciona el CSV de Schwab</b><div class="kfoot">Debe contener las columnas Date, Action, Symbol, Description, Quantity, Price, Fees &amp; Comm y Amount.</div><input id="csvFile" type="file" accept=".csv,text/csv"></div>
    <div><b>2. Elige cómo incorporarlo</b><div class="modes"><label class="mode"><input type="radio" name="importMode" value="replace" checked><span><b>Reemplazar</b><small>Úsalo si el archivo contiene todo el historial actualizado.</small></span></label><label class="mode"><input type="radio" name="importMode" value="append"><span><b>Agregar</b><small>Úsalo si el archivo contiene solamente movimientos nuevos.</small></span></label></div></div>
    <div class="import-status" id="importStatus">Ningún archivo seleccionado.</div>
  </div>
  <div class="modal-foot"><button class="danger" id="restoreOriginal">Restaurar base original</button><div class="foot-right"><button class="secondary" id="downloadBase">Descargar base consolidada</button><button class="primary" id="applyImport" disabled>Actualizar</button></div></div>
</dialog>
<script>
const BASE=${data};
const STORAGE_KEY='cfg_transactions_v2';
const DB_NAME='cfg_transactions_database';
const STORE_NAME='datasets';
const RECORD_KEY='current';
let ALL=BASE.map(x=>({...x}));
const fmtMoney=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
const fmtNum=new Intl.NumberFormat('es-CL',{maximumFractionDigits:2});
const fmtDate=new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
const tradeActions=new Set(['Buy','Sell','Sell Short','Buy to Open','Buy to Close','Sell to Open','Sell to Close']);
const colors=['#49d7b0','#5aa8ff','#f4bf58','#ff6b7a','#9b7cff','#52c7d9','#f18f5a','#a3d65c'];
const els=Object.fromEntries(['search','symbol','category','action','from','to','reset','kCount','kDays','kVolume','kPnl','kFees','kFeeRate','kTransfers','kTransferFoot','kIncome','kIncomeFoot','kCash','lineChart','donut','actions','pnlBars','volumeBars','tbody','tableCount','pageInfo','prev','next','export','scopePill','tooltip','updateData','importDialog','closeDialog','csvFile','importStatus','applyImport','restoreOriginal','downloadBase','dataSubtitle'].map(id=>[id,document.getElementById(id)]));
let page=1; const pageSize=25;
let pendingRows=null;
refreshControls();
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function readIndexed(){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readonly'),req=tx.objectStore(STORE_NAME).get(RECORD_KEY);req.onsuccess=()=>resolve(req.result?.rows||null);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
async function writeIndexed(rows){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).put({rows,updatedAt:new Date().toISOString()},RECORD_KEY);tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error)}})}
async function deleteIndexed(){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).delete(RECORD_KEY);tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>{db.close();reject(tx.error)}})}
async function loadSaved(){try{const rows=await readIndexed();if(Array.isArray(rows)&&rows.length)return rows}catch{}try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return null;const rows=JSON.parse(raw);if(Array.isArray(rows)&&rows.length){await writeIndexed(rows);localStorage.removeItem(STORAGE_KEY);return rows}}catch{}return null}
async function saveRows(rows){try{await writeIndexed(rows);try{localStorage.removeItem(STORAGE_KEY)}catch{}return true}catch{return false}}
async function removeSaved(){try{await deleteIndexed();try{localStorage.removeItem(STORAGE_KEY)}catch{}return true}catch{return false}}
async function bootstrap(){const saved=await loadSaved();if(saved)ALL=recomputeFIFO(saved);refreshControls();render()}
function refreshControls(){
  ALL.sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);ALL.forEach((x,i)=>x.id=i+1);
  const current=els.symbol?.value||'';if(els.symbol){els.symbol.innerHTML='<option value="">Todos</option>';[...new Set(ALL.filter(x=>x.symbol!=='—').map(x=>x.symbol))].sort().forEach(s=>els.symbol.add(new Option(s,s)));if([...els.symbol.options].some(o=>o.value===current))els.symbol.value=current}
  const currentAction=els.action?.value||'';if(els.action){els.action.innerHTML='<option value="">Todos</option>';[...new Set(ALL.map(x=>x.action).filter(Boolean))].sort().forEach(s=>els.action.add(new Option(s,s)));if([...els.action.options].some(o=>o.value===currentAction))els.action.value=currentAction}
  if(!ALL.length)return;const minDate=ALL[0].date,maxDate=ALL[ALL.length-1].date;if(els.from){els.from.min=minDate;els.from.max=maxDate;els.to.min=minDate;els.to.max=maxDate}if(els.dataSubtitle)els.dataSubtitle.textContent=fmtNum.format(ALL.length)+' movimientos · Base consolidada guardada en este navegador';
}
function parseCSVText(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"')quoted=false;else cell+=ch}else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell=''}else if(ch==='\\n'){row.push(cell.replace(/\\r$/,''));rows.push(row);row=[];cell=''}else cell+=ch}if(cell||row.length){row.push(cell);rows.push(row)}const headers=rows.shift()?.map(x=>x.replace(/^\\ufeff/,''))||[];const required=['Date','Action','Symbol','Description','Quantity','Price','Fees & Comm','Amount'];if(!required.every(x=>headers.includes(x)))throw new Error('El archivo no tiene el formato esperado de Schwab.');return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])))}
function parseMoney(v){if(!v)return 0;const neg=/^-/.test(v.trim())||/^\(.*\)$/.test(v.trim());const n=Number(v.replace(/[^0-9.]/g,''))||0;return neg?-n:n}
function normalizeImported(raw){return raw.map((r,i)=>{const d=(r.Date||'').slice(0,10);const [m,day,y]=d.split('/');if(!y||!m||!day)throw new Error('Hay una fecha no reconocida en la fila '+(i+2)+'.');return{id:i+1,date:y+'-'+m+'-'+day,action:(r.Action||'').trim(),symbol:(r.Symbol||'').trim()||'—',description:(r.Description||'').trim(),quantity:Number((r.Quantity||'0').replace(/,/g,''))||0,price:parseMoney(r.Price),fees:Math.abs(parseMoney(r['Fees & Comm'])),amount:parseMoney(r.Amount),realized:0,matchedQty:0}})}
function recomputeFIFO(rows){const data=rows.map(x=>({...x,price:Math.abs(Number(x.price)||0),fees:Math.abs(Number(x.fees)||0),realized:0,matchedQty:0})).sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);const lots=new Map();for(const t of data){let direction=0;if(t.action==='Buy'||t.action==='Buy to Open'||t.action==='Buy to Close')direction=1;if(t.action==='Sell'||t.action==='Sell to Close'||t.action==='Sell to Open'||t.action==='Sell Short')direction=-1;if(!direction||!t.quantity||!t.price||t.symbol==='—')continue;const q=t.quantity,queue=lots.get(t.symbol)||[];let remaining=q,realized=0,matched=0;while(remaining>1e-10&&queue.length&&Math.sign(queue[0].qty)!==direction){const lot=queue[0],m=Math.min(remaining,Math.abs(lot.qty));realized+=(direction===-1?(t.price-lot.price):(lot.price-t.price))*m-lot.feePerShare*m;matched+=m;lot.qty+=direction*m;remaining-=m;if(Math.abs(lot.qty)<1e-10)queue.shift()}if(matched>0)realized-=t.fees*(matched/q);if(remaining>1e-10)queue.push({qty:direction*remaining,price:t.price,feePerShare:t.fees/q});lots.set(t.symbol,queue);t.realized=Number(realized.toFixed(6));t.matchedQty=matched}data.forEach((x,i)=>x.id=i+1);return data}
function rowKey(x){return[x.date,x.action,x.symbol,x.description,x.quantity,Math.abs(Number(x.price)||0),Math.abs(Number(x.fees)||0),semanticAmount(x)].join('|')}
function mergeMultiset(existing,incoming){const counts=new Map();existing.forEach(x=>counts.set(rowKey(x),(counts.get(rowKey(x))||0)+1));const seen=new Map(),added=[];for(const x of incoming){const k=rowKey(x),n=(seen.get(k)||0)+1;seen.set(k,n);if(n>(counts.get(k)||0))added.push(x)}return{rows:[...existing,...added],added:added.length,skipped:incoming.length-added.length}}
function exportRows(rows,name){const cols=['Fecha','Acción','Símbolo','Descripción','Cantidad','Precio','Comisión','Monto interpretado','P&L FIFO'];const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';const body=[cols,...rows.map(x=>[x.date,x.action,x.symbol,x.description,x.quantity,x.price,x.fees,semanticAmount(x),x.realized])].map(r=>r.map(esc).join(',')).join('\\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\\ufeff'+body],{type:'text/csv'}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
function exportConsolidated(rows){const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"',usd=v=>v<0?'-$'+Math.abs(v).toFixed(2):'$'+v.toFixed(2),usDate=d=>d.slice(5,7)+'/'+d.slice(8,10)+'/'+d.slice(0,4);const cols=['Date','Action','Symbol','Description','Quantity','Price','Fees & Comm','Amount'];const body=[cols,...rows.map(x=>{const amount=semanticAmount(x),price=Math.abs(Number(x.price)||0);return[usDate(x.date),x.action,x.symbol==='—'?'':x.symbol,x.description,x.quantity||'',price?'$'+price:'',x.fees?'$'+x.fees.toFixed(2):'',amount?usd(amount):'']})].map(r=>r.map(esc).join(',')).join('\\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\\ufeff'+body],{type:'text/csv'}));a.download='transacciones_consolidadas.csv';a.click();URL.revokeObjectURL(a.href)}
function actionName(x){return x.action.toLowerCase()}
function actionText(x){return(x.action+' '+x.description).toLowerCase()}
function isTransfer(x){const s=actionName(x);return s.includes('wire transfer')||s.includes('wire received')||s.includes('wire funds')||s.includes('moneylink transfer')||s.includes('funds received')}
function isInternalTransfer(x){const s=actionName(x);return s.includes('internal transfer')||s.includes('journaled shares')||s.includes('journaled funds')||s==='journal'}
function isInterest(x){return actionName(x).includes('interest')}
function isDividend(x){const s=actionName(x);return s.includes('dividend')||s.includes('qual div')}
function isTax(x){const s=actionName(x);return s.includes('tax')||s.includes('withholding')}
function semanticAmount(x){const a=actionName(x),v=Math.abs(Number(x.amount)||0);if(isInternalTransfer(x))return 0;if(a.startsWith('buy'))return-v;if(a.startsWith('sell'))return v;if(isTransfer(x)){if(a.includes(' out')||a.includes('outgoing')||a.includes('sent'))return-v;return v}if(isDividend(x))return v;if(isInterest(x))return a.includes('debit')||a.includes('margin')?-v:v;if(a.includes('service fee')||a.includes('foreign tax')||a.includes('nra tax'))return-v;if(a.includes('cash in lieu'))return v;return Number(x.amount)||0}
function matchesCategory(x,c){if(!c)return true;if(c==='trades')return tradeActions.has(x.action);if(c==='transfers')return isTransfer(x);if(c==='interest')return isInterest(x);if(c==='dividends')return isDividend(x);if(c==='fees')return x.fees>0||actionText(x).includes('commission')||actionText(x).includes('fee');if(c==='taxes')return isTax(x);return !tradeActions.has(x.action)&&!isTransfer(x)&&!isInterest(x)&&!isDividend(x)&&!isTax(x)&&x.fees===0}
function filtered(){const q=els.search.value.trim().toLowerCase();return ALL.filter(x=>(!q||(x.symbol+' '+x.description+' '+x.action).toLowerCase().includes(q))&&(!els.symbol.value||x.symbol===els.symbol.value)&&(!els.action.value||x.action===els.action.value)&&matchesCategory(x,els.category.value)&&(!els.from.value||x.date>=els.from.value)&&(!els.to.value||x.date<=els.to.value));}
function sum(a,f){return a.reduce((s,x)=>s+f(x),0)} function cls(v){return v>0?'positive':v<0?'negative':''} function money(v){return fmtMoney.format(v)}
function group(rows,key,val){const m=new Map();rows.forEach(x=>m.set(key(x),(m.get(key(x))||0)+val(x)));return m}
function render(){const rows=filtered();page=Math.min(page,Math.max(1,Math.ceil(rows.length/pageSize)));const trades=rows.filter(x=>tradeActions.has(x.action));const transfers=rows.filter(isTransfer),dividends=rows.filter(isDividend),interest=rows.filter(isInterest);const volume=sum(trades,x=>Math.abs(x.amount));const pnl=sum(rows,x=>x.realized);const fees=sum(rows,x=>x.fees);const cash=sum(rows,x=>semanticAmount(x));const transferNet=sum(transfers,x=>semanticAmount(x)),transferIn=sum(transfers.filter(x=>semanticAmount(x)>0),x=>semanticAmount(x)),transferOut=Math.abs(sum(transfers.filter(x=>semanticAmount(x)<0),x=>semanticAmount(x)));const dividendTotal=sum(dividends,x=>semanticAmount(x)),interestTotal=sum(interest,x=>semanticAmount(x)),income=dividendTotal+interestTotal;const days=new Set(rows.map(x=>x.date)).size;
 els.kCount.textContent=fmtNum.format(rows.length);els.kDays.textContent=days+' días con actividad';els.kVolume.textContent=money(volume);els.kPnl.textContent=money(pnl);els.kPnl.className='kvalue '+cls(pnl);els.kFees.textContent=money(fees);els.kFeeRate.textContent=volume?((fees/volume)*100).toFixed(3)+'% del volumen':'—';els.kTransfers.textContent=money(transferNet);els.kTransfers.className='kvalue '+cls(transferNet);els.kTransferFoot.textContent='Entradas '+money(transferIn)+' · Salidas '+money(transferOut);els.kIncome.textContent=money(income);els.kIncome.className='kvalue '+cls(income);els.kIncomeFoot.textContent='Dividendos '+money(dividendTotal)+' · Intereses '+money(interestTotal);els.kCash.textContent=money(cash);els.kCash.className='kvalue '+cls(cash);els.scopePill.textContent=rows.length?fmtDate.format(new Date(rows[0].date+'T00:00:00Z'))+' — '+fmtDate.format(new Date(rows[rows.length-1].date+'T00:00:00Z')):'Sin resultados';
 renderLine(rows);renderDonut(rows);renderBars(rows);renderTable(rows);
}
function renderLine(rows){const daily=group(rows,x=>x.date,x=>x.realized);const arr=[...daily].sort((a,b)=>a[0].localeCompare(b[0]));if(!arr.length){els.lineChart.innerHTML='<div class="empty">Sin datos para estos filtros</div>';return}let cum=0;const points=arr.map(([d,v])=>({d,v,c:cum+=v}));const W=900,H=250,p={l:54,r:18,t:14,b:30};const vals=points.flatMap(x=>[x.v,x.c,0]);let lo=Math.min(...vals),hi=Math.max(...vals);if(hi===lo){hi+=1;lo-=1}const x=i=>p.l+(points.length===1?0:(i/(points.length-1))*(W-p.l-p.r));const y=v=>p.t+(hi-v)/(hi-lo)*(H-p.t-p.b);const line=points.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v.c).toFixed(1)).join(' ');let svg='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">';for(let i=0;i<5;i++){const yy=p.t+i*(H-p.t-p.b)/4;const val=hi-i*(hi-lo)/4;svg+='<line class="gridline" x1="'+p.l+'" y1="'+yy+'" x2="'+(W-p.r)+'" y2="'+yy+'"/><text class="axistext" x="0" y="'+(yy+4)+'">'+compact(val)+'</text>'}svg+='<line class="axis" x1="'+p.l+'" y1="'+y(0)+'" x2="'+(W-p.r)+'" y2="'+y(0)+'"/>';points.forEach((v,i)=>{const bw=Math.max(2,(W-p.l-p.r)/points.length*.55);const top=y(Math.max(0,v.v)),bot=y(Math.min(0,v.v));svg+='<rect data-i="'+i+'" class="hoverpt" x="'+(x(i)-bw/2)+'" y="'+top+'" width="'+bw+'" height="'+Math.max(1,bot-top)+'" fill="#5aa8ff" opacity=".52" rx="2"/>'});svg+='<path d="'+line+'" fill="none" stroke="#49d7b0" stroke-width="3" vector-effect="non-scaling-stroke"/><text class="axistext" x="'+p.l+'" y="'+(H-4)+'">'+arr[0][0].slice(5)+'</text><text class="axistext" text-anchor="end" x="'+(W-p.r)+'" y="'+(H-4)+'">'+arr[arr.length-1][0].slice(5)+'</text></svg>';els.lineChart.innerHTML=svg;els.lineChart.querySelectorAll('.hoverpt').forEach(n=>{n.onmousemove=e=>{const v=points[+n.dataset.i];showTip(e,'<b>'+fmtDate.format(new Date(v.d+'T00:00:00Z'))+'</b><br>P&L diario: '+money(v.v)+'<br>Acumulado: '+money(v.c))};n.onmouseleave=hideTip})}
function renderDonut(rows){const counts=[...group(rows,x=>x.action,()=>1)].sort((a,b)=>b[1]-a[1]);const total=sum(counts,x=>x[1]);let cur=0;const stops=counts.map((x,i)=>{const a=cur/total*360;cur+=x[1];return colors[i%colors.length]+' '+a+'deg '+cur/total*360+'deg'});els.donut.style.background=total?'conic-gradient('+stops.join(',')+')':'#173244';els.actions.innerHTML=counts.slice(0,7).map((x,i)=>'<div class="action-item"><span><i class="dot" style="background:'+colors[i%colors.length]+'"></i>'+x[0]+'</span><b>'+fmtNum.format(x[1])+'</b></div>').join('')}
function renderBars(rows){const pnl=[...group(rows,x=>x.symbol,x=>x.realized)].filter(x=>x[0]!=='—'&&Math.abs(x[1])>.005).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,10);const vol=[...group(rows.filter(x=>tradeActions.has(x.action)),x=>x.symbol,x=>Math.abs(x.amount))].filter(x=>x[0]!=='—').sort((a,b)=>b[1]-a[1]).slice(0,10);barList(els.pnlBars,pnl,true);barList(els.volumeBars,vol,false)}
function barList(el,arr,signed){if(!arr.length){el.innerHTML='<div class="empty">Sin datos</div>';return}const max=Math.max(...arr.map(x=>Math.abs(x[1])));el.innerHTML=arr.map(([k,v])=>'<div class="barrow"><b>'+k+'</b><div class="track"><div class="fill" style="width:'+(Math.abs(v)/max*100)+'%;background:'+(signed?(v>=0?'#49d7b0':'#ff6b7a'):'#5aa8ff')+'"></div></div><span class="num '+(signed?cls(v):'')+'">'+compactMoney(v)+'</span></div>').join('')}
function renderTable(rows){const start=(page-1)*pageSize,view=rows.slice(start,start+pageSize);els.tbody.innerHTML=view.map(x=>{const amount=semanticAmount(x);return'<tr><td>'+fmtDate.format(new Date(x.date+'T00:00:00Z'))+'</td><td><span class="tag '+(x.action.startsWith('Buy')?'buy':x.action.startsWith('Sell')?'sell':'')+'">'+x.action+'</span></td><td><b>'+x.symbol+'</b></td><td>'+escapeHtml(x.description)+'</td><td class="num">'+(x.quantity?fmtNum.format(x.quantity):'—')+'</td><td class="num">'+(x.price?money(x.price):'—')+'</td><td class="num">'+(x.fees?money(x.fees):'—')+'</td><td class="num '+cls(amount)+'">'+money(amount)+'</td><td class="num '+cls(x.realized)+'">'+(x.matchedQty?money(x.realized):'—')+'</td></tr>'}).join('');els.tableCount.textContent=fmtNum.format(rows.length)+' movimientos filtrados';const pages=Math.max(1,Math.ceil(rows.length/pageSize));els.pageInfo.textContent='Página '+page+' de '+pages;els.prev.disabled=page<=1;els.next.disabled=page>=pages}
function compact(v){return new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(v)} function compactMoney(v){return (v<0?'−':'')+'$'+compact(Math.abs(v))} function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))} function showTip(e,h){els.tooltip.innerHTML=h;els.tooltip.style.display='block';els.tooltip.style.left=Math.min(e.clientX+12,innerWidth-220)+'px';els.tooltip.style.top=(e.clientY+12)+'px'} function hideTip(){els.tooltip.style.display='none'}
['search','symbol','category','action','from','to'].forEach(id=>els[id].addEventListener('input',()=>{page=1;render()}));els.reset.onclick=()=>{els.search.value='';els.symbol.value='';els.category.value='';els.action.value='';els.from.value='';els.to.value='';page=1;render()};els.prev.onclick=()=>{page--;render()};els.next.onclick=()=>{page++;render()};
els.export.onclick=()=>exportRows(filtered(),'transacciones_filtradas.csv');
els.updateData.onclick=()=>{pendingRows=null;els.csvFile.value='';els.importStatus.textContent='Ningún archivo seleccionado.';els.applyImport.disabled=true;els.importDialog.showModal()};
els.closeDialog.onclick=()=>els.importDialog.close();
els.importDialog.addEventListener('click',e=>{if(e.target===els.importDialog)els.importDialog.close()});
els.csvFile.onchange=async()=>{const file=els.csvFile.files[0];pendingRows=null;els.applyImport.disabled=true;if(!file){els.importStatus.textContent='Ningún archivo seleccionado.';return}try{const text=await file.text();pendingRows=normalizeImported(parseCSVText(text));const min=pendingRows.reduce((a,x)=>x.date<a?x.date:a,pendingRows[0].date),max=pendingRows.reduce((a,x)=>x.date>a?x.date:a,pendingRows[0].date);els.importStatus.innerHTML='<b>'+escapeHtml(file.name)+'</b><br>'+fmtNum.format(pendingRows.length)+' movimientos · '+fmtDate.format(new Date(min+'T00:00:00Z'))+' a '+fmtDate.format(new Date(max+'T00:00:00Z'));els.applyImport.disabled=false}catch(err){els.importStatus.textContent=err.message||'No fue posible leer el archivo.'}};
els.applyImport.onclick=async()=>{if(!pendingRows)return;els.applyImport.disabled=true;els.importStatus.textContent='Guardando la base consolidada…';const mode=document.querySelector('input[name="importMode"]:checked').value;let candidate,detail;if(mode==='replace'){candidate=pendingRows;detail=fmtNum.format(candidate.length)+' movimientos reemplazaron la base anterior.'}else{const merged=mergeMultiset(ALL,pendingRows);candidate=merged.rows;detail=fmtNum.format(merged.added)+' movimientos nuevos agregados; '+fmtNum.format(merged.skipped)+' ya estaban registrados.'}candidate=recomputeFIFO(candidate);if(!await saveRows(candidate)){els.importStatus.textContent='El navegador no pudo guardar la base. Descarga el consolidado como respaldo.';els.applyImport.disabled=false;return}ALL=candidate;els.search.value='';els.from.value='';els.to.value='';page=1;refreshControls();render();els.importDialog.close();setTimeout(()=>alert('Dashboard actualizado. '+detail),50)};
els.restoreOriginal.onclick=async()=>{if(!confirm('¿Restaurar la base original y borrar las actualizaciones guardadas en este navegador?'))return;if(!await removeSaved()){els.importStatus.textContent='No fue posible borrar la base guardada.';return}ALL=recomputeFIFO(BASE.map(x=>({...x})));pendingRows=null;page=1;refreshControls();render();els.importDialog.close()};
els.downloadBase.onclick=()=>exportConsolidated(ALL);
bootstrap();
</script></body></html>`;
fs.mkdirSync(path.dirname(out), {recursive:true});
fs.writeFileSync(out, html);
console.log(JSON.stringify({output:out,transactions:tx.length,bytes:Buffer.byteLength(html)}));

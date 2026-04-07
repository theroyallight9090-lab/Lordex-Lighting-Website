// =============================================
//  LORDEX — Product Identification System
//  app.js  (v3 — Supabase + Full Admin)
// =============================================

// ─── SUPABASE CONFIG ──────────────────────────
// !! Replace these two lines with your actual Supabase project values !!
const SUPABASE_URL = 'https://obenbrakqzgicdfodkjz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZW5icmFrcXpnaWNkZm9ka2p6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NTM5NDMsImV4cCI6MjA5MTAyOTk0M30.MhSfQ1qxUGvBZWW8rXkvRsvu84U1UtscEOnf2R_Ix5o';
const TABLE_NAME   = 'products'; // must match your Supabase table name

// Supabase REST helper (no SDK needed)
const sb = {
  h: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  url(q='') { return `${SUPABASE_URL}/rest/v1/${TABLE_NAME}${q}`; },
async get(q = '', from = 0, to = 999) {
  const r = await fetch(sb.url(q), {
    headers: {
      ...sb.h,
      Range: `${from}-${to}`
    }
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
},
  async post(body) {
    const r = await fetch(sb.url(), { method:'POST', headers:sb.h, body:JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async patch(id, body) {
    const r = await fetch(sb.url(`?id=eq.${id}`), { method:'PATCH', headers:sb.h, body:JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async del(id) {
    const r = await fetch(sb.url(`?id=eq.${id}`), { method:'DELETE', headers:sb.h });
    if (!r.ok) throw new Error(await r.text());
    return true;
  }
};

// ─── APP CONFIG ───────────────────────────────
const CONFIG = {
  SESSION_TIMEOUT: 10 * 60 * 1000,
  WARNING_BEFORE:  60 * 1000,
  USERS: [
    { username: 'admin',   password: 'Lordex-Admin', role: 'admin'   },
    { username: 'user1',   password: 'pass1234',     role: 'user'    },
    { username: 'manager', password: 'mgr@lordex',   role: 'manager' },
  ]
};

// ─── STATE ────────────────────────────────────
let allProducts      = [];
let filteredProducts = [];
let sessionTimer     = null;
let warnTimer        = null;
let sessionStart     = null;
let currentUser      = null;
let _deleteId        = null;

// ─── CSV PARSER ───────────────────────────────
function parseCSV(text) {
  const rows = []; let row=[], cur='', inQ=false;
  for (let i=0; i<text.length; i++) {
    const c=text[i], n=text[i+1];
    if (c==='"'&&inQ&&n==='"') { cur+='"'; i++; }
    else if (c==='"') { inQ=!inQ; }
    else if (c===','&&!inQ) { row.push(cur.trim()); cur=''; }
    else if ((c==='\n'||c==='\r')&&!inQ) {
      if (cur||row.length) { row.push(cur.trim()); rows.push(row); row=[]; cur=''; }
    } else { cur+=c; }
  }
  if (cur||row.length) { row.push(cur.trim()); rows.push(row); }
  const headers=rows[0];
  return rows.slice(1).map(cols=>{
    const obj={}; headers.forEach((h,i)=>obj[h.trim()]=cols[i]||''); return obj;
  });
}

// ─── CSV EXPORTER ─────────────────────────────
function toCSV(data) {
  if (!data.length) return '';
  const cols=['ItemNo','Alu','ItemName','Size','Colour','Department',
              'Vendor','Unit','Qty','Cost','RegularPrice','ItemDescription','FinalPrice','Picture'];
  const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  return [cols.join(','), ...data.map(p=>cols.map(c=>esc(p[c]??'')).join(','))].join('\n');
}

// ─── AUTH ─────────────────────────────────────
function login() {
  const u=document.getElementById('username').value.trim();
  const p=document.getElementById('password').value;
  const err=document.getElementById('login-error');
  const match=CONFIG.USERS.find(x=>x.username===u&&x.password===p);
  if (!match) {
    err.textContent='Invalid username or password.';
    document.getElementById('login-box').classList.add('shake');
    setTimeout(()=>document.getElementById('login-box').classList.remove('shake'),500);
    return;
  }
  currentUser=match;
  sessionStorage.setItem('lordex_user',u);
  sessionStorage.setItem('lordex_role',match.role);
  showProductPage();
}

function logout(reason) {
  clearTimers(); currentUser=null;
  sessionStorage.removeItem('lordex_user');
  sessionStorage.removeItem('lordex_role');
  ['product-page','admin-page'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('username').value='';
  document.getElementById('password').value='';
  document.getElementById('login-error').textContent='';
  if (reason==='timeout') showTimeoutModal();
}

function showTimeoutModal() { document.getElementById('timeout-modal').classList.remove('hidden'); }
function dismissTimeout()   { document.getElementById('timeout-modal').classList.add('hidden'); }

// ─── SESSION TIMER ────────────────────────────
function startSessionTimer() {
  clearTimers(); sessionStart=Date.now(); updateTimerBar();
  warnTimer   =setTimeout(()=>document.getElementById('session-warn').classList.remove('hidden'), CONFIG.SESSION_TIMEOUT-CONFIG.WARNING_BEFORE);
  sessionTimer=setTimeout(()=>logout('timeout'), CONFIG.SESSION_TIMEOUT);
}
function clearTimers() {
  clearTimeout(sessionTimer); clearTimeout(warnTimer); sessionTimer=warnTimer=null;
}
function extendSession() {
  document.getElementById('session-warn').classList.add('hidden'); startSessionTimer();
}
function updateTimerBar() {
  const bar=document.getElementById('timer-progress');
  if (!bar||!sessionStart) return;
  const elapsed=Date.now()-sessionStart;
  const pct=Math.max(0,100-(elapsed/CONFIG.SESSION_TIMEOUT)*100);
  bar.style.width=pct+'%';
  bar.style.background=pct>40?'var(--gold)':pct>15?'#e07b00':'#ef4444';
  const mins=Math.floor((CONFIG.SESSION_TIMEOUT-elapsed)/60000);
  const secs=Math.floor(((CONFIG.SESSION_TIMEOUT-elapsed)%60000)/1000);
  const lbl=document.getElementById('timer-label');
  if(lbl) lbl.textContent=`Session: ${mins}:${secs.toString().padStart(2,'0')}`;
  if(elapsed<CONFIG.SESSION_TIMEOUT) requestAnimationFrame(updateTimerBar);
}

// ─── PAGE NAVIGATION ──────────────────────────
function showProductPage() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('admin-page').classList.add('hidden');
  document.getElementById('product-page').classList.remove('hidden');
  const uEl=document.getElementById('logged-user');
  if(uEl) uEl.textContent=sessionStorage.getItem('lordex_user')||'';
  const role=sessionStorage.getItem('lordex_role');
  const adminBtn=document.getElementById('admin-nav-btn');
  if(adminBtn) adminBtn.style.display=(role==='admin'||role==='manager')?'inline-flex':'none';
  startSessionTimer();
  if(allProducts.length===0) loadProducts();
  else renderProducts(allProducts);
}

function showAdminPage() {
  const role=sessionStorage.getItem('lordex_role');
  if(role!=='admin'&&role!=='manager') return;
  document.getElementById('product-page').classList.add('hidden');
  document.getElementById('admin-page').classList.remove('hidden');
  renderAdminTable();
}

function backToProducts() {
  document.getElementById('admin-page').classList.add('hidden');
  document.getElementById('product-page').classList.remove('hidden');
}

// ─── LOAD FROM SUPABASE ───────────────────────
async function loadProducts() {
  const grid = document.getElementById('product-grid');
  grid.innerHTML = '<div class="loading-msg">Loading products…</div>';

  try {
    let from = 0;
    const limit = 1000;
    let all = [];
    let keepLoading = true;

    while (keepLoading) {
      const data = await sb.get('?order=ItemNo.asc&select=*', from, from + limit - 1);
      all = all.concat(data);

      if (data.length < limit) {
        keepLoading = false;
      } else {
        from += limit;
      }
    }

    allProducts = all;
    applyFilters();

  } catch (e) {
    grid.innerHTML = `<div class="error-msg">⚠ ${e.message}</div>`;
  }
}
// ─── FILTERS ──────────────────────────────────
function applyFilters() {
  const v=id=>document.getElementById(id).value.trim().toLowerCase();
  const itemNo=v('filter-itemno'), alu=v('filter-alu'), colour=v('filter-colour'),
        size=v('filter-size'), dept=v('filter-department'),
        desc=v('filter-desc'), unit=v('filter-unit');
  const qtyMin=parseFloat(document.getElementById('filter-qty-min').value)||0;
  const qtyMax=parseFloat(document.getElementById('filter-qty-max').value)||Infinity;

  filteredProducts=allProducts.filter(p=>{
    if(itemNo&&!String(p.ItemNo??'').toLowerCase().includes(itemNo)) return false;
    if(alu   &&!String(p.Alu??'').toLowerCase().includes(alu))       return false;
    if(colour&&!String(p.Colour??'').toLowerCase().includes(colour)) return false;
    if(size  &&!String(p.Size??'').toLowerCase().includes(size))     return false;
    if(dept  &&!String(p.Department??'').toLowerCase().includes(dept)) return false;
    if(desc  &&!String(p.ItemDescription??'').toLowerCase().includes(desc)) return false;
    if(unit  &&!String(p.Unit??'').toLowerCase().includes(unit))     return false;
    const qty=parseFloat(p.Qty)||0;
    if(qty<qtyMin||qty>qtyMax) return false;
    return true;
  });

  renderProducts(filteredProducts);
  const rc=document.getElementById('result-count');
  if(rc) rc.textContent=`${filteredProducts.length} item${filteredProducts.length!==1?'s':''} found`;
}

function clearFilters() {
  ['filter-itemno','filter-alu','filter-colour','filter-size','filter-department',
   'filter-desc','filter-unit','filter-qty-min','filter-qty-max']
    .forEach(id=>{document.getElementById(id).value='';});
  applyFilters();
}

// ─── RENDER PRODUCTS ──────────────────────────
function renderProducts(products) {
  const grid=document.getElementById('product-grid');
  if(!grid) return;
  if(products.length===0){
    grid.innerHTML='<div class="no-results">No products match your filters.</div>'; return;
  }
  grid.innerHTML=products.map((p,i)=>`
    <div class="product-card" style="animation-delay:${Math.min(i,20)*40}ms">
      <div class="card-img-wrap" onclick="openLightbox(${allProducts.indexOf(p)})">
        <img src="${p.Picture||''}" alt="${p.ItemName||''}"
             onerror="this.src='';this.parentElement.classList.add('no-img')" loading="lazy">
        <div class="img-placeholder">📦</div>
        <div class="img-zoom-hint">🔍 View</div>
      </div>
      <div class="card-body" onclick="openModal(${allProducts.indexOf(p)})">
        <div class="card-header-row">
          <span class="item-no">#${p.ItemNo}</span>
          <span class="alu-badge">${p.Alu||''}</span>
        </div>
        <div class="item-name">${p.ItemName||'—'}</div>
        <div class="item-attr">${p.Attribute||''}</div>
        <div class="card-tags">
          ${p.Size?`<span class="tag">📐 ${p.Size}</span>`:''}
          ${p.Colour?`<span class="tag">🎨 ${p.Colour}</span>`:''}
          ${p.Department?`<span class="tag">🏷 ${p.Department}</span>`:''}
        </div>
        <div class="card-footer-row">
          <span class="qty-badge">Qty: ${p.Qty} ${p.Unit||''}</span>
          <span class="price">Code ${p.RegularPrice||''}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ─── PRODUCT DETAIL MODAL ─────────────────────
function openModal(idx) {
  const p=allProducts[idx]; if(!p) return;
  const fields=[
    ['Item No',p.ItemNo],['ALU',p.Alu],['Item Name',p.ItemName],
    ['Size',p.Size],['Colour',p.Colour],
    ['Department',p.Department],['Vendor',p.Vendor],['Unit',p.Unit],
    ['Qty',p.Qty],['Code',p.RegularPrice?`${p.RegularPrice}`:'—'],
    ['Item Description',p.ItemDescription],
  ];
  const img=document.getElementById('modal-img');
  img.src=p.Picture||''; img.style.display='';
  img.onerror=function(){this.style.display='none';};
  document.getElementById('modal-title').textContent=p.ItemName||'Product Details';
  document.getElementById('modal-fields').innerHTML=fields
    .filter(([,v])=>v)
    .map(([k,v])=>`<div class="detail-row"><span class="detail-key">${k}</span><span class="detail-val">${v}</span></div>`)
    .join('');
  document.getElementById('product-modal').classList.remove('hidden');
  document.body.style.overflow='hidden';
}
function closeModal() {
  document.getElementById('product-modal').classList.add('hidden');
  document.body.style.overflow='';
}

// ─── LIGHTBOX ─────────────────────────────────
function openLightbox(idx) {
  const p=allProducts[idx];
  if(!p) return;
  if(!p.Picture) { openModal(idx); return; }
  document.getElementById('lightbox-img').src=p.Picture;
  document.getElementById('lightbox-caption').textContent=`${p.ItemName||''} · #${p.ItemNo}`;
  document.getElementById('lightbox').classList.remove('hidden');
  document.body.style.overflow='hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.body.style.overflow='';
}

// ─── FILTER TOGGLE ────────────────────────────
function toggleFilters(btn) {
  const body=document.getElementById('filter-body');
  if(body.style.display==='none'){body.style.display='';btn.textContent='Collapse ▲';}
  else{body.style.display='none';btn.textContent='Expand ▼';}
}

// ═══════════════════════════════════════════════
//  ADMIN / MANAGER
// ═══════════════════════════════════════════════

function renderAdminTable() {
  const tbody=document.getElementById('admin-tbody'); if(!tbody) return;
  const role=sessionStorage.getItem('lordex_role');

  document.getElementById('admin-stat-total').textContent =allProducts.length;
  document.getElementById('admin-stat-dept').textContent  =[...new Set(allProducts.map(p=>p.Department).filter(Boolean))].length;
  document.getElementById('admin-stat-vendor').textContent=[...new Set(allProducts.map(p=>p.Vendor).filter(Boolean))].length;
  document.getElementById('admin-stat-qty').textContent   =allProducts.reduce((s,p)=>s+(parseFloat(p.Qty)||0),0).toLocaleString();

  if(!allProducts.length){
    tbody.innerHTML='<tr><td colspan="9" class="empty-row">No products loaded — check Supabase connection.</td></tr>';
    return;
  }
  tbody.innerHTML=allProducts.map(p=>`
    <tr>
      <td><span class="tbl-no">${p.ItemNo}</span></td>
      <td class="mono">${p.Alu||''}</td>
      <td class="tbl-name">${p.ItemName||'—'}</td>
      <td>${p.Size||'—'}</td>
      <td>${p.Colour||'—'}</td>
      <td><span class="dept-chip">${p.Department||'—'}</span></td>
      <td>
        <div class="qty-edit-row">
          <button class="qty-btn" onclick="adjustStock(${p.id},-1)">−</button>
          <span class="qty-num ${parseFloat(p.Qty)<10?'low':''}" id="qty-${p.id}">${p.Qty}</span>
          <button class="qty-btn" onclick="adjustStock(${p.id},1)">+</button>
        </div>
      </td>
      <td class="price-col">Code ${p.RegularPrice||''}</td>
      <td class="action-col">
        <button class="tbl-btn edit" onclick="openEditModal(${p.id})" title="Edit">✏</button>
        ${role==='admin'?`<button class="tbl-btn del" onclick="confirmDelete(${p.id})" title="Delete">🗑</button>`:''}
      </td>
    </tr>
  `).join('');
}

function adminSearch() {
  const q=document.getElementById('admin-search').value.trim().toLowerCase();
  document.querySelectorAll('#admin-tbody tr').forEach(row=>{
    row.style.display=row.textContent.toLowerCase().includes(q)?'':'none';
  });
}

// ─── ADJUST STOCK ─────────────────────────────
async function adjustStock(id, delta) {
  const p=allProducts.find(x=>x.id===id); if(!p) return;
  const newQty=Math.max(0,(parseFloat(p.Qty)||0)+delta);
  try {
    await sb.patch(id,{Qty:newQty}); p.Qty=newQty;
    const el=document.getElementById(`qty-${id}`);
    if(el){el.textContent=newQty;el.className=`qty-num ${newQty<10?'low':''}`;}
    document.getElementById('admin-stat-qty').textContent=
      allProducts.reduce((s,x)=>s+(parseFloat(x.Qty)||0),0).toLocaleString();
    showToast('Stock updated ✓');
  } catch(e){showToast('Error: '+e.message,true);}
}

// ─── CREATE / EDIT MODAL ──────────────────────
function openCreateModal() {
  fillProductForm(null);
  document.getElementById('product-form-title').textContent='New Product';
  document.getElementById('product-modal-form').classList.remove('hidden');
  document.body.style.overflow='hidden';
}
function openEditModal(id) {
  const p=allProducts.find(x=>x.id===id); if(!p) return;
  fillProductForm(p);
  document.getElementById('product-form-title').textContent='Edit Product';
  document.getElementById('product-modal-form').classList.remove('hidden');
  document.body.style.overflow='hidden';
}
function fillProductForm(p) {
  const f=document.getElementById('pf');
  const set=(n,v)=>{if(f[n])f[n].value=v??'';};
  set('pf-id',p?.id); set('pf-ItemNo',p?.ItemNo); set('pf-Alu',p?.Alu);
  set('pf-ItemName',p?.ItemName); set('pf-Attribute',p?.Attribute);
  set('pf-Size',p?.Size); set('pf-Colour',p?.Colour);
  set('pf-Department',p?.Department); set('pf-Vendor',p?.Vendor);
  set('pf-Unit',p?.Unit); set('pf-Qty',p?.Qty); set('pf-Cost',p?.Cost);
  set('pf-RegularPrice',p?.RegularPrice); set('pf-FinalPrice',p?.FinalPrice);
  set('pf-ItemDescription',p?.ItemDescription); set('pf-Picture',p?.Picture);
  document.getElementById('pf-error').textContent='';
}
function closeProductForm() {
  document.getElementById('product-modal-form').classList.add('hidden');
  document.body.style.overflow='';
}
async function saveProduct() {
  const f=document.getElementById('pf');
  const id=f['pf-id'].value;
  const data={
    ItemNo:f['pf-ItemNo'].value.trim(), Alu:f['pf-Alu'].value.trim(),
    ItemName:f['pf-ItemName'].value.trim(), Attribute:f['pf-Attribute'].value.trim(),
    Size:f['pf-Size'].value.trim(), Colour:f['pf-Colour'].value.trim(),
    Department:f['pf-Department'].value.trim(), Vendor:f['pf-Vendor'].value.trim(),
    Unit:f['pf-Unit'].value.trim(), Qty:parseFloat(f['pf-Qty'].value)||0,
    Cost:parseFloat(f['pf-Cost'].value)||0, RegularPrice:parseFloat(f['pf-RegularPrice'].value)||0,
    FinalPrice:parseFloat(f['pf-FinalPrice'].value)||0,
    ItemDescription:f['pf-ItemDescription'].value.trim(), Picture:f['pf-Picture'].value.trim(),
  };
  if(!data.ItemNo||!data.ItemName){
    document.getElementById('pf-error').textContent='Item No and Item Name are required.'; return;
  }
  const btn=document.getElementById('pf-save-btn');
  btn.disabled=true; btn.textContent='Saving…';
  try {
    if(id) {
      const [u]=await sb.patch(id,data);
      const idx=allProducts.findIndex(p=>p.id===parseInt(id));
      if(idx!==-1) allProducts[idx]={...allProducts[idx],...u};
    } else {
      const [c]=await sb.post(data); allProducts.push(c);
    }
    closeProductForm(); renderAdminTable(); applyFilters();
    showToast(id?'Product updated ✓':'Product created ✓');
  } catch(e){
    document.getElementById('pf-error').textContent='Save failed: '+e.message;
  } finally{btn.disabled=false;btn.textContent='Save Product';}
}

// ─── DELETE WITH PASSWORD CONFIRM ─────────────
function confirmDelete(id) {
  _deleteId=id;
  const p=allProducts.find(x=>x.id===id);
  document.getElementById('delete-product-name').textContent=p?`"${p.ItemName}"`:`#${id}`;
  document.getElementById('delete-confirm-pwd').value='';
  document.getElementById('delete-error').textContent='';
  document.getElementById('delete-modal').classList.remove('hidden');
  document.body.style.overflow='hidden';
}
function closeDeleteModal() {
  document.getElementById('delete-modal').classList.add('hidden');
  document.body.style.overflow=''; _deleteId=null;
}
async function executeDelete() {
  const pwd=document.getElementById('delete-confirm-pwd').value;
  const admin=CONFIG.USERS.find(u=>u.role==='admin');
  if(!admin||pwd!==admin.password){
    document.getElementById('delete-error').textContent='Incorrect admin password.'; return;
  }
  const btn=document.getElementById('delete-exec-btn');
  btn.disabled=true; btn.textContent='Deleting…';
  try {
    await sb.del(_deleteId);
    allProducts=allProducts.filter(p=>p.id!==_deleteId);
    closeDeleteModal(); renderAdminTable(); applyFilters();
    showToast('Product deleted');
  } catch(e){
    document.getElementById('delete-error').textContent='Delete failed: '+e.message;
  } finally{btn.disabled=false;btn.textContent='Delete';}
}

// ─── EXPORT CSV ───────────────────────────────
function exportCSV() {
  const csv=toCSV(allProducts);
  const a=Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),
    download:`lordex_products_${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click(); showToast(`Exported ${allProducts.length} products ✓`);
}

// ─── IMPORT CSV ───────────────────────────────
function triggerImport() { document.getElementById('import-file-input').click(); }
async function handleImport(e) {
  const file=e.target.files[0]; if(!file) return;
  const imported=parseCSV(await file.text());
  if(!imported.length){showToast('No data in file',true);return;}
  if(!confirm(`Import ${imported.length} products?\nThis ADDS them to your database. Continue?`)){
    e.target.value=''; return;
  }
  document.getElementById('import-status').textContent='Importing…';
  let ok=0, fail=0;
  for(const p of imported){try{await sb.post(p);allProducts.push(p);ok++;}catch{fail++;}}
  document.getElementById('import-status').textContent='';
  e.target.value='';
  renderAdminTable(); applyFilters();
  showToast(`Imported ${ok}${fail?`, ${fail} failed`:''} products`);
}

// ─── TOAST ────────────────────────────────────
function showToast(msg, err=false) {
  let t=document.getElementById('toast');
  if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t);}
  t.textContent=msg; t.className='toast'+(err?' toast-err':'');
  t.style.opacity='1'; clearTimeout(t._t);
  t._t=setTimeout(()=>{t.style.opacity='0';},2800);
}

// ─── KEYBOARD / CLICK OUTSIDE ─────────────────
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeModal();closeLightbox();closeProductForm();closeDeleteModal();}
  if(e.key==='Enter'&&!document.getElementById('login-page').classList.contains('hidden')) login();
});
document.getElementById('product-modal').addEventListener('click',function(e){if(e.target===this)closeModal();});
document.getElementById('lightbox').addEventListener('click',function(e){if(e.target===this)closeLightbox();});

// ─── INIT ─────────────────────────────────────
window.addEventListener('DOMContentLoaded',()=>{
  const grid=document.getElementById('users-grid');
  if(grid) grid.innerHTML=CONFIG.USERS.map(u=>`
    <div class="user-card">
      <div class="user-avatar">${u.username[0].toUpperCase()}</div>
      <div class="user-info-block">
        <div class="uname">${u.username}</div>
        <div class="urole">${u.role}</div>
      </div>
    </div>`).join('');

  const user=sessionStorage.getItem('lordex_user');
  if(user){
    currentUser=CONFIG.USERS.find(u=>u.username===user)||null;
    showProductPage();
  }
});

// =============================================
//  LORDEX — Product Identification System
//  app.js  (v4 — Correct DB Columns)
// =============================================

// ─── SUPABASE CONFIG ──────────────────────────
const SUPABASE_URL = 'https://obenbrakqzgicdfodkjz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZW5icmFrcXpnaWNkZm9ka2p6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NTM5NDMsImV4cCI6MjA5MTAyOTk0M30.MhSfQ1qxUGvBZWW8rXkvRsvu84U1UtscEOnf2R_Ix5o';
const TABLE_NAME   = 'products';

// ─── DB COLUMN MAP ────────────────────────────
// Exact column names as they exist in Supabase:
//   ltemNo        → Item No   (NOTE: starts with lowercase L, not capital I)
//   alu           → ALU
//   ItemName      → Item Name
//   Attribute     → Colour (this field holds colour data)
//   Size          → Size
//   DepartmentName→ Department Name
//   Vendor        → Vendor
//   unit          → Unit
//   Qty           → Qty
//   Cost          → Cost
//   RegularPrice  → Code / Price shown
//   ItemDescription → Item Description
//   FinalPrice    → Final Price
//   Picture       → Picture URL (image link)

// Helper: read any product field safely
const col = {
  itemNo : p => p.ltemNo        ?? '',   // lowercase-l + temNo
  picture: p => p.Picture ?? '',
  alu    : p => p.alu           ?? '',
  name   : p => p.ItemName      ?? '',
  colour : p => p.Attribute     ?? '',   // Attribute = Colour
  size   : p => p.Size          ?? '',
  dept   : p => p.DepartmentName?? '',
  vendor : p => p.Vendor        ?? '',
  unit   : p => p.unit          ?? '',   // lowercase 'unit'
  qty    : p => p.Qty           ?? '',
  cost   : p => p.Cost          ?? '',
  price  : p => p.RegularPrice  ?? '',
  desc   : p => p.ItemDescription ?? '',
  final  : p => p.FinalPrice    ?? '',
};

// ─── SUPABASE REST HELPER ─────────────────────
const sb = {
  h: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  url(q='') { return `${SUPABASE_URL}/rest/v1/${TABLE_NAME}${q}`; },

  async get(q='', from=0, to=999) {
    const r = await fetch(sb.url(q), { headers: { ...sb.h, Range: `${from}-${to}` } });
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
// Maps CSV header names → correct DB column names
const CSV_TO_DB = {
  // accept both display names and DB names in CSV
  'Item No'         : 'ltemNo',
  'ItemNo'          : 'ltemNo',
  'ltemNo'          : 'ltemNo',
  'ALU'             : 'alu',
  'Alu'             : 'alu',
  'alu'             : 'alu',
  'Item Name'       : 'ItemName',
  'ItemName'        : 'ItemName',
  'Colour'          : 'Attribute',   // CSV "Colour" → DB "Attribute"
  'Attribute'       : 'Attribute',
  'Size'            : 'Size',
  'Department'      : 'DepartmentName',
  'DepartmentName'  : 'DepartmentName',
  'Department Name' : 'DepartmentName',
  'Vendor'          : 'Vendor',
  'Unit'            : 'unit',
  'unit'            : 'unit',
  'Qty'             : 'Qty',
  'Cost'            : 'Cost',
  'Code'            : 'RegularPrice',
  'RegularPrice'    : 'RegularPrice',
  'Regular Price'   : 'RegularPrice',
  'Item Description': 'ItemDescription',
  'ItemDescription' : 'ItemDescription',
  'Final Price'     : 'FinalPrice',
  'FinalPrice'      : 'FinalPrice',
  'Picture'         : 'Picture',
  'picture'         : 'Picture',
  'Image'           : 'Picture',
  'image'           : 'Picture',
};

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
  if (rows.length < 2) return [];

  const rawHeaders = rows[0];
  // Map headers to DB column names
  const headers = rawHeaders.map(h => CSV_TO_DB[h.trim()] || h.trim());

  return rows.slice(1).filter(cols => cols.some(c=>c)).map(cols => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = cols[i] || ''; });
    // Coerce numeric fields
    ['Qty','Cost','RegularPrice','FinalPrice'].forEach(f => {
      if (obj[f] !== undefined) obj[f] = parseFloat(obj[f]) || 0;
    });
    return obj;
  });
}

// ─── CSV EXPORTER ─────────────────────────────
// Exports using friendly display names
function toCSV(data) {
  if (!data.length) return '';
  const map = [
    ['Item No',          p => col.itemNo(p)],
    ['ALU',              p => col.alu(p)],
    ['Item Name',        p => col.name(p)],
    ['Colour',           p => col.colour(p)],   // export Attribute as "Colour"
    ['Size',             p => col.size(p)],
    ['Department',       p => col.dept(p)],
    ['Vendor',           p => col.vendor(p)],
    ['Unit',             p => col.unit(p)],
    ['Qty',              p => col.qty(p)],
    ['Cost',             p => col.cost(p)],
    ['Code',             p => col.price(p)],
    ['Item Description', p => col.desc(p)],
    ['Final Price',      p => col.final(p)],
    ['Picture',          p => col.picture(p)],
  ];
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = map.map(([h]) => h).join(',');
  const rows   = data.map(p => map.map(([, fn]) => esc(fn(p))).join(','));
  return [header, ...rows].join('\n');
}

// ─── AUTH ─────────────────────────────────────
function login() {
  const u   = document.getElementById('username').value.trim();
  const p   = document.getElementById('password').value;
  const err = document.getElementById('login-error');
  const match = CONFIG.USERS.find(x => x.username===u && x.password===p);
  if (!match) {
    err.textContent = 'Invalid username or password.';
    document.getElementById('login-box').classList.add('shake');
    setTimeout(() => document.getElementById('login-box').classList.remove('shake'), 500);
    return;
  }
  currentUser = match;
  sessionStorage.setItem('lordex_user', u);
  sessionStorage.setItem('lordex_role', match.role);
  showProductPage();
}

function logout(reason) {
  clearTimers(); currentUser = null;
  sessionStorage.removeItem('lordex_user');
  sessionStorage.removeItem('lordex_role');
  ['product-page','admin-page'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.getElementById('login-error').textContent = '';
  if (reason === 'timeout') showTimeoutModal();
}

function showTimeoutModal() { document.getElementById('timeout-modal').classList.remove('hidden'); }
function dismissTimeout()   { document.getElementById('timeout-modal').classList.add('hidden'); }

// ─── SESSION TIMER ────────────────────────────
function startSessionTimer() {
  clearTimers(); sessionStart = Date.now(); updateTimerBar();
  warnTimer    = setTimeout(() => document.getElementById('session-warn').classList.remove('hidden'), CONFIG.SESSION_TIMEOUT - CONFIG.WARNING_BEFORE);
  sessionTimer = setTimeout(() => logout('timeout'), CONFIG.SESSION_TIMEOUT);
}
function clearTimers() {
  clearTimeout(sessionTimer); clearTimeout(warnTimer); sessionTimer = warnTimer = null;
}
function extendSession() {
  document.getElementById('session-warn').classList.add('hidden'); startSessionTimer();
}
function updateTimerBar() {
  const bar = document.getElementById('timer-progress');
  if (!bar || !sessionStart) return;
  const elapsed = Date.now() - sessionStart;
  const pct = Math.max(0, 100 - (elapsed / CONFIG.SESSION_TIMEOUT) * 100);
  bar.style.width = pct + '%';
  bar.style.background = pct > 40 ? 'var(--gold)' : pct > 15 ? '#e07b00' : '#ef4444';
  const mins = Math.floor((CONFIG.SESSION_TIMEOUT - elapsed) / 60000);
  const secs = Math.floor(((CONFIG.SESSION_TIMEOUT - elapsed) % 60000) / 1000);
  const lbl = document.getElementById('timer-label');
  if (lbl) lbl.textContent = `Session: ${mins}:${secs.toString().padStart(2,'0')}`;
  if (elapsed < CONFIG.SESSION_TIMEOUT) requestAnimationFrame(updateTimerBar);
}

// ─── PAGE NAVIGATION ──────────────────────────
function showProductPage() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('admin-page').classList.add('hidden');
  document.getElementById('product-page').classList.remove('hidden');
  const uEl = document.getElementById('logged-user');
  if (uEl) uEl.textContent = sessionStorage.getItem('lordex_user') || '';
  const role = sessionStorage.getItem('lordex_role');
  const adminBtn = document.getElementById('admin-nav-btn');
  if (adminBtn) adminBtn.style.display = (role==='admin'||role==='manager') ? 'inline-flex' : 'none';
  startSessionTimer();
  if (allProducts.length === 0) loadProducts();
  else renderProducts(allProducts);
}

function showAdminPage() {
  const role = sessionStorage.getItem('lordex_role');
  if (role !== 'admin' && role !== 'manager') return;
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
  grid.innerHTML = '<div class="loading-msg"><span class="spin">⟳</span> Loading products…</div>';
  try {
    let from = 0, all = [], keepGoing = true;
    while (keepGoing) {
      const data = await sb.get('?order=ltemNo.asc&select=*', from, from + 999);
      all = all.concat(data);
      keepGoing = data.length === 1000;
      from += 1000;
    }
    allProducts = all;
    applyFilters();
  } catch(e) {
    grid.innerHTML = `<div class="error-msg">⚠ Supabase error: ${e.message}</div>`;
  }
}

// ─── FILTERS ──────────────────────────────────
function applyFilters() {
  const v = id => document.getElementById(id).value.trim().toLowerCase();
  const itemNo = v('filter-itemno'), alu    = v('filter-alu'),
        colour = v('filter-colour'), size   = v('filter-size'),
        dept   = v('filter-department'), desc = v('filter-desc'),
        unit   = v('filter-unit');
  const qtyMin = parseFloat(document.getElementById('filter-qty-min').value) || 0;
  const qtyMax = parseFloat(document.getElementById('filter-qty-max').value) || Infinity;

  filteredProducts = allProducts.filter(p => {
    if (itemNo && !col.itemNo(p).toLowerCase().includes(itemNo)) return false;
    if (alu    && !col.alu(p).toLowerCase().includes(alu))       return false;
    if (colour && !col.colour(p).toLowerCase().includes(colour)) return false;  // searches Attribute
    if (size   && !col.size(p).toLowerCase().includes(size))     return false;
    if (dept   && !col.dept(p).toLowerCase().includes(dept))     return false;
    if (desc   && !col.desc(p).toLowerCase().includes(desc))     return false;
    if (unit   && !col.unit(p).toLowerCase().includes(unit))     return false;
    const qty = parseFloat(col.qty(p)) || 0;
    if (qty < qtyMin || qty > qtyMax) return false;
    return true;
  });

  renderProducts(filteredProducts);
  const rc = document.getElementById('result-count');
  if (rc) rc.textContent = `${filteredProducts.length} item${filteredProducts.length !== 1 ? 's' : ''} found`;
}

function clearFilters() {
  ['filter-itemno','filter-alu','filter-colour','filter-size','filter-department',
   'filter-desc','filter-unit','filter-qty-min','filter-qty-max']
    .forEach(id => { document.getElementById(id).value = ''; });
  applyFilters();
}

// ─── RENDER PRODUCTS ──────────────────────────
function renderProducts(products) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  if (products.length === 0) {
    grid.innerHTML = '<div class="no-results">No products match your filters.</div>';
    return;
  }
  grid.innerHTML = products.map((p, i) => {
    const idx = allProducts.indexOf(p);
    const deptVal   = col.dept(p);
    const sizeVal   = col.size(p);
    const colourVal = col.colour(p);
    const picUrl    = col.picture(p);
    return `
    <div class="product-card" style="animation-delay:${Math.min(i,20)*40}ms">
      <div class="card-img-wrap${picUrl ? '' : ' no-img'}" onclick="openModal(${idx})">
        ${picUrl ? `<img src="${picUrl}" alt="${col.name(p)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('no-img')">` : ''}
        <div class="img-placeholder">📦</div>
      </div>
      <div class="card-body" onclick="openModal(${idx})">
        <div class="card-header-row">
          <span class="item-no">#${col.itemNo(p)}</span>
          <span class="alu-badge">${col.alu(p)}</span>
        </div>
        <div class="item-name">${col.name(p) || '—'}</div>
        <div class="card-tags">
          ${sizeVal   ? `<span class="tag">📐 ${sizeVal}</span>`   : ''}
          ${colourVal ? `<span class="tag">🎨 ${colourVal}</span>` : ''}
          ${deptVal   ? `<span class="tag">🏷 ${deptVal}</span>`   : ''}
        </div>
        <div class="card-footer-row">
          <span class="qty-badge">Qty: ${col.qty(p)} ${col.unit(p)}</span>
          <span class="price">Code ${col.price(p)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── PRODUCT DETAIL MODAL ─────────────────────
function openModal(idx) {
  const p = allProducts[idx]; if (!p) return;
  const picUrl = col.picture(p);
  const fields = [
    ['Item No',          col.itemNo(p)],
    ['ALU',              col.alu(p)],
    ['Item Name',        col.name(p)],
    ['Colour',           col.colour(p)],
    ['Size',             col.size(p)],
    ['Department',       col.dept(p)],
    ['Vendor',           col.vendor(p)],
    ['Unit',             col.unit(p)],
    ['Qty',              col.qty(p)],
    ['Code',             col.price(p) ? `${col.price(p)}` : '—'],
    ['Final Price',      col.final(p) ? `${col.final(p)}` : ''],
    ['Item Description', col.desc(p)],
  ];

  // Show or hide image section based on whether Picture URL exists
  const imgWrap = document.getElementById('modal-img-wrap');
  const modalImg = document.getElementById('modal-img');
  if (picUrl) {
    imgWrap.style.display = '';
    modalImg.src = picUrl;
    modalImg.alt = col.name(p);
    modalImg.onclick = () => openLightbox(picUrl, col.name(p));
    modalImg.style.cursor = 'zoom-in';
  } else {
    imgWrap.style.display = 'none';
    modalImg.src = '';
  }

  document.getElementById('modal-title').textContent = col.name(p) || 'Product Details';
  document.getElementById('modal-fields').innerHTML = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="detail-row"><span class="detail-key">${k}</span><span class="detail-val">${v}</span></div>`)
    .join('');
  document.getElementById('product-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('product-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// ─── IMAGE LIGHTBOX ───────────────────────────
function openLightbox(url, caption) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox-caption').textContent = caption || '';
  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  const lb = document.getElementById('lightbox');
  lb.style.display = 'none';
  document.getElementById('lightbox-img').src = '';
  document.body.style.overflow = '';
}

// ─── FILTER TOGGLE ────────────────────────────
function toggleFilters(btn) {
  const body = document.getElementById('filter-body');
  if (body.style.display === 'none') { body.style.display = ''; btn.textContent = 'Collapse ▲'; }
  else { body.style.display = 'none'; btn.textContent = 'Expand ▼'; }
}

// ═══════════════════════════════════════════════
//  ADMIN / MANAGER
// ═══════════════════════════════════════════════

function renderAdminTable() {
  const tbody = document.getElementById('admin-tbody'); if (!tbody) return;
  const role = sessionStorage.getItem('lordex_role');

  document.getElementById('admin-stat-total').textContent  = allProducts.length;
  document.getElementById('admin-stat-dept').textContent   = [...new Set(allProducts.map(p => col.dept(p)).filter(Boolean))].length;
  document.getElementById('admin-stat-vendor').textContent = [...new Set(allProducts.map(p => col.vendor(p)).filter(Boolean))].length;
  document.getElementById('admin-stat-qty').textContent    = allProducts.reduce((s, p) => s + (parseFloat(col.qty(p)) || 0), 0).toLocaleString();

  if (!allProducts.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No products — check Supabase connection.</td></tr>';
    return;
  }
  tbody.innerHTML = allProducts.map(p => `
    <tr>
      <td><span class="tbl-no">${col.itemNo(p)}</span></td>
      <td class="mono">${col.alu(p)}</td>
      <td class="tbl-name">${col.name(p) || '—'}</td>
      <td>${col.size(p) || '—'}</td>
      <td>${col.colour(p) || '—'}</td>
      <td><span class="dept-chip">${col.dept(p) || '—'}</span></td>
      <td>
        <div class="qty-edit-row">
          <button class="qty-btn" onclick="adjustStock(${p.id}, -1)">−</button>
          <span class="qty-num ${parseFloat(col.qty(p)) < 10 ? 'low' : ''}" id="qty-${p.id}">${col.qty(p)}</span>
          <button class="qty-btn" onclick="adjustStock(${p.id}, 1)">+</button>
        </div>
      </td>
      <td class="price-col">Code ${col.price(p)}</td>
      <td class="action-col">
        <button class="tbl-btn edit" onclick="openEditModal(${p.id})" title="Edit">✏</button>
        ${role==='admin' ? `<button class="tbl-btn del" onclick="confirmDelete(${p.id})" title="Delete">🗑</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function adminSearch() {
  const q = document.getElementById('admin-search').value.trim().toLowerCase();
  document.querySelectorAll('#admin-tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ─── ADJUST STOCK ─────────────────────────────
async function adjustStock(id, delta) {
  const p = allProducts.find(x => x.id === id); if (!p) return;
  const newQty = Math.max(0, (parseFloat(col.qty(p)) || 0) + delta);
  try {
    await sb.patch(id, { Qty: newQty });
    p.Qty = newQty;
    const el = document.getElementById(`qty-${id}`);
    if (el) { el.textContent = newQty; el.className = `qty-num ${newQty < 10 ? 'low' : ''}`; }
    document.getElementById('admin-stat-qty').textContent =
      allProducts.reduce((s, x) => s + (parseFloat(col.qty(x)) || 0), 0).toLocaleString();
    showToast('Stock updated ✓');
  } catch(e) { showToast('Error: ' + e.message, true); }
}

// ─── CREATE / EDIT MODAL ──────────────────────
function openCreateModal() {
  fillProductForm(null);
  document.getElementById('product-form-title').textContent = 'New Product';
  document.getElementById('product-modal-form').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function openEditModal(id) {
  const p = allProducts.find(x => x.id === id); if (!p) return;
  fillProductForm(p);
  document.getElementById('product-form-title').textContent = 'Edit Product';
  document.getElementById('product-modal-form').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function fillProductForm(p) {
  const f = document.getElementById('pf');
  const set = (n, v) => { if (f[n]) f[n].value = v ?? ''; };
  set('pf-id',             p?.id);
  set('pf-ltemNo',         col.itemNo(p ?? {}));
  set('pf-alu',            col.alu(p ?? {}));
  set('pf-ItemName',       col.name(p ?? {}));
  set('pf-Attribute',      col.colour(p ?? {}));   // Attribute = Colour
  set('pf-Size',           col.size(p ?? {}));
  set('pf-DepartmentName', col.dept(p ?? {}));
  set('pf-Vendor',         col.vendor(p ?? {}));
  set('pf-unit',           col.unit(p ?? {}));
  set('pf-Qty',            col.qty(p ?? {}));
  set('pf-Cost',           col.cost(p ?? {}));
  set('pf-RegularPrice',   col.price(p ?? {}));
  set('pf-FinalPrice',     col.final(p ?? {}));
  set('pf-ItemDescription',col.desc(p ?? {}));
  set('pf-Picture',        col.picture(p ?? {}));
  document.getElementById('pf-error').textContent = '';
}

function closeProductForm() {
  document.getElementById('product-modal-form').classList.add('hidden');
  document.body.style.overflow = '';
}

async function saveProduct() {
  const f   = document.getElementById('pf');
  const id  = f['pf-id'].value;
  // Build payload using EXACT DB column names
  const data = {
    ltemNo:          f['pf-ltemNo'].value.trim(),
    alu:             f['pf-alu'].value.trim(),
    ItemName:        f['pf-ItemName'].value.trim(),
    Attribute:       f['pf-Attribute'].value.trim(),    // Colour goes into Attribute
    Size:            f['pf-Size'].value.trim(),
    DepartmentName:  f['pf-DepartmentName'].value.trim(),
    Vendor:          f['pf-Vendor'].value.trim(),
    unit:            f['pf-unit'].value.trim(),
    Qty:             parseFloat(f['pf-Qty'].value) || 0,
    Cost:            parseFloat(f['pf-Cost'].value) || 0,
    RegularPrice:    parseFloat(f['pf-RegularPrice'].value) || 0,
    FinalPrice:      parseFloat(f['pf-FinalPrice'].value) || 0,
    ItemDescription: f['pf-ItemDescription'].value.trim(),
    Picture:         f['pf-Picture'].value.trim(),
  };

  if (!data.ltemNo || !data.ItemName) {
    document.getElementById('pf-error').textContent = 'Item No and Item Name are required.';
    return;
  }
  const btn = document.getElementById('pf-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (id) {
      const [updated] = await sb.patch(id, data);
      const idx = allProducts.findIndex(p => p.id === parseInt(id));
      if (idx !== -1) allProducts[idx] = { ...allProducts[idx], ...updated };
    } else {
      const [created] = await sb.post(data);
      allProducts.push(created);
    }
    closeProductForm();
    renderAdminTable();
    applyFilters();
    showToast(id ? 'Product updated ✓' : 'Product created ✓');
  } catch(e) {
    document.getElementById('pf-error').textContent = 'Save failed: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Save Product';
  }
}

// ─── DELETE WITH PASSWORD CONFIRM ─────────────
function confirmDelete(id) {
  _deleteId = id;
  const p = allProducts.find(x => x.id === id);
  document.getElementById('delete-product-name').textContent = p ? `"${col.name(p)}"` : `#${id}`;
  document.getElementById('delete-confirm-pwd').value = '';
  document.getElementById('delete-error').textContent = '';
  document.getElementById('delete-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeDeleteModal() {
  document.getElementById('delete-modal').classList.add('hidden');
  document.body.style.overflow = ''; _deleteId = null;
}
async function executeDelete() {
  const pwd   = document.getElementById('delete-confirm-pwd').value;
  const admin = CONFIG.USERS.find(u => u.role === 'admin');
  if (!admin || pwd !== admin.password) {
    document.getElementById('delete-error').textContent = 'Incorrect admin password.'; return;
  }
  const btn = document.getElementById('delete-exec-btn');
  btn.disabled = true; btn.textContent = 'Deleting…';
  try {
    await sb.del(_deleteId);
    allProducts = allProducts.filter(p => p.id !== _deleteId);
    closeDeleteModal(); renderAdminTable(); applyFilters();
    showToast('Product deleted');
  } catch(e) {
    document.getElementById('delete-error').textContent = 'Delete failed: ' + e.message;
  } finally { btn.disabled = false; btn.textContent = 'Delete'; }
}

// ─── EXPORT CSV ───────────────────────────────
function exportCSV() {
  const csv = toCSV(allProducts);
  const a = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `lordex_products_${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click();
  showToast(`Exported ${allProducts.length} products ✓`);
}

// ─── IMPORT CSV ───────────────────────────────
function triggerImport() { document.getElementById('import-file-input').click(); }

async function handleImport(e) {
  const file = e.target.files[0]; if (!file) return;
  const raw  = await file.text();
  const rows = parseCSV(raw);

  if (!rows.length) { showToast('No valid rows found in CSV', true); e.target.value = ''; return; }

  // Show preview of first row so user can confirm mapping
  const firstKeys = Object.keys(rows[0]).join(', ');
  const ok = confirm(
    `Found ${rows.length} rows.\nDetected columns: ${firstKeys}\n\nImport to Supabase? (rows will be ADDED to existing data)`
  );
  if (!ok) { e.target.value = ''; return; }

  const statusEl = document.getElementById('import-status');
  statusEl.textContent = `Importing 0 / ${rows.length}…`;

  let success = 0, fail = 0;
  for (let i = 0; i < rows.length; i++) {
    try {
      await sb.post(rows[i]);
      allProducts.push(rows[i]);
      success++;
    } catch { fail++; }
    if ((i + 1) % 10 === 0 || i === rows.length - 1) {
      statusEl.textContent = `Importing ${i + 1} / ${rows.length}…`;
    }
  }

  statusEl.textContent = '';
  e.target.value = '';
  renderAdminTable();
  applyFilters();
  showToast(`Imported ${success} products${fail ? `, ${fail} failed` : ''} ✓`);
}

// ─── TOAST ────────────────────────────────────
function showToast(msg, err=false) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className   = 'toast' + (err ? ' toast-err' : '');
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 3000);
}

// ─── KEYBOARD / CLICK OUTSIDE ─────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeProductForm(); closeDeleteModal(); closeLightbox(); }
  if (e.key === 'Enter' && !document.getElementById('login-page').classList.contains('hidden')) login();
});
document.getElementById('product-modal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });

// ─── INIT ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('users-grid');
  if (grid) grid.innerHTML = CONFIG.USERS.map(u => `
    <div class="user-card">
      <div class="user-avatar">${u.username[0].toUpperCase()}</div>
      <div class="user-info-block">
        <div class="uname">${u.username}</div>
        <div class="urole">${u.role}</div>
      </div>
    </div>`).join('');

  const user = sessionStorage.getItem('lordex_user');
  if (user) {
    currentUser = CONFIG.USERS.find(u => u.username === user) || null;
    showProductPage();
  }
});

// =============================================
//  LORDEX — Product Identification System
//  app.js  (v2 — Gold & Gray Theme)
// =============================================

// ─── CONFIG ───────────────────────────────────
const CONFIG = {
  CSV_FILE: 'products.csv',
  SESSION_TIMEOUT: 10 * 60 * 1000,
  WARNING_BEFORE:  60 * 1000,
  USERS: [
    { username: 'admin',   password: 'Lordex-Admin', role: 'admin'   },
    { username: 'user1',   password: 'pass1234',   role: 'user'    },
    { username: 'manager', password: 'mgr@lordex', role: 'manager' },
  ]
};

// ─── STATE ────────────────────────────────────
let allProducts      = [];
let filteredProducts = [];
let sessionTimer     = null;
let warnTimer        = null;
let sessionStart     = null;
let currentUser      = null;

// ─── CSV PARSER ───────────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
    } 
    else if (char === '"') {
      inQuotes = !inQuotes;
    } 
    else if (char === ',' && !inQuotes) {
      row.push(cur.trim());
      cur = '';
    } 
    else if ((char === '\n' || char === '\r') && !inQuotes) {
      // ✅ ONLY split row if NOT inside quotes
      if (cur || row.length) {
        row.push(cur.trim());
        rows.push(row);
        row = [];
        cur = '';
      }
    } 
    else {
      cur += char;
    }
  }

  if (cur || row.length) {
    row.push(cur.trim());
    rows.push(row);
  }

  const headers = rows[0];

  return rows.slice(1).map(cols => {
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = cols[i] || '');
    return obj;
  });
}
// ─── AUTH ─────────────────────────────────────
function login() {
  const u   = document.getElementById('username').value.trim();
  const p   = document.getElementById('password').value;
  const err = document.getElementById('login-error');

  const match = CONFIG.USERS.find(x => x.username === u && x.password === p);
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
  clearTimers();
  currentUser = null;
  sessionStorage.removeItem('lordex_user');
  sessionStorage.removeItem('lordex_role');

  ['product-page','admin-page'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.getElementById('login-error').textContent = '';
  if (reason === 'timeout') showTimeoutModal();
}

function showTimeoutModal() {
  document.getElementById('timeout-modal').classList.remove('hidden');
}

function dismissTimeout() {
  document.getElementById('timeout-modal').classList.add('hidden');
}

// ─── SESSION TIMER ────────────────────────────
function startSessionTimer() {
  clearTimers();
  sessionStart = Date.now();
  updateTimerBar();

  warnTimer = setTimeout(() => {
    document.getElementById('session-warn').classList.remove('hidden');
  }, CONFIG.SESSION_TIMEOUT - CONFIG.WARNING_BEFORE);

  sessionTimer = setTimeout(() => {
    logout('timeout');
  }, CONFIG.SESSION_TIMEOUT);
}

function clearTimers() {
  clearTimeout(sessionTimer);
  clearTimeout(warnTimer);
  sessionTimer = null;
  warnTimer = null;
}

function extendSession() {
  document.getElementById('session-warn').classList.add('hidden');
  startSessionTimer();
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

  const adminBtn = document.getElementById('admin-nav-btn');
  if (adminBtn) {
    adminBtn.style.display = (sessionStorage.getItem('lordex_role') === 'admin') ? 'inline-flex' : 'none';
  }

  startSessionTimer();
  if (allProducts.length === 0) loadProducts();
  else renderProducts(allProducts);
}

function showAdminPage() {
  if (sessionStorage.getItem('lordex_role') !== 'admin') return;
  document.getElementById('product-page').classList.add('hidden');
  document.getElementById('admin-page').classList.remove('hidden');
  renderAdminTable();
}

function backToProducts() {
  document.getElementById('admin-page').classList.add('hidden');
  document.getElementById('product-page').classList.remove('hidden');
}

// ─── LOAD PRODUCTS ────────────────────────────
async function loadProducts() {
  const grid = document.getElementById('product-grid');
  grid.innerHTML = '<div class="loading-msg"><span class="spin">⟳</span> Loading products…</div>';
  try {
    const res = await fetch(CONFIG.CSV_FILE);
    if (!res.ok) throw new Error('products.csv not found — place it in the same folder.');
    const text = await res.text();
    allProducts = parseCSV(text);
    applyFilters();
  } catch (e) {
    grid.innerHTML = `<div class="error-msg">⚠ ${e.message}</div>`;
  }
}

// ─── FILTERS (all text inputs — partial match) ─
function applyFilters() {
  const v = id => document.getElementById(id).value.trim().toLowerCase();

  const itemNo = v('filter-itemno');
  const alu    = v('filter-alu');
  const colour = v('filter-colour');
  const size   = v('filter-size');
  const dept   = v('filter-department');
  const desc   = v('filter-desc');
  const unit   = v('filter-unit');
  const qtyMin = parseFloat(document.getElementById('filter-qty-min').value) || 0;
  const qtyMax = parseFloat(document.getElementById('filter-qty-max').value) || Infinity;

  filteredProducts = allProducts.filter(p => {
    if (itemNo && !p.ItemNo?.toLowerCase().includes(itemNo))        return false;
    if (alu    && !p.alu?.toLowerCase().includes(alu))              return false;
    if (colour && !p.Attribute?.toLowerCase().includes(colour))        return false;
    if (size   && !p.Size?.toLowerCase().includes(size))            return false;
    if (dept   && !p.Department?.toLowerCase().includes(dept))      return false;
    if (desc   && !p.ItemDescription?.toLowerCase().includes(desc)) return false;
    if (unit   && !p.Unit?.toLowerCase().includes(unit))            return false;
    const qty = parseFloat(p.Qty) || 0;
    if (qty < qtyMin || qty > qtyMax) return false;
    return true;
  });

  renderProducts(filteredProducts);
  const rc = document.getElementById('result-count');
  if (rc) rc.textContent = `${filteredProducts.length} item${filteredProducts.length !== 1 ? 's' : ''} found`;
}

function clearFilters() {
  ['filter-itemno','filter-alu','filter-colour','filter-size',
   'filter-department','filter-desc','filter-unit',
   'filter-qty-min','filter-qty-max']
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

  grid.innerHTML = products.map((p, i) => `
    <div class="product-card" style="animation-delay:${Math.min(i,20)*40}ms"
         onclick="openModal(${allProducts.indexOf(p)})">
      <div class="card-img-wrap">
        <img src="${p.Picture || ''}" alt="${p.ItemName || ''}"
             onerror="this.src='';this.parentElement.classList.add('no-img')"
             loading="lazy">
        <div class="img-placeholder">📦</div>
      </div>
      <div class="card-body">
        <div class="card-header-row">
          <span class="item-no">#${p.ItemNo}</span>
          <span class="alu-badge">${p.alu}</span>
        </div>
        <div class="item-name">${p.ItemName || '—'}</div>
        <div class="item-attr">${p.Attribute || ''}</div>
        <div class="card-tags">
          ${p.Size       ? `<span class="tag">📐 ${p.Size}</span>` : ''}
          ${p.Colour     ? `<span class="tag">🎨 ${p.Colour}</span>` : ''}
          ${p.Department ? `<span class="tag">🏷 ${p.Department}</span>` : ''}
        </div>
        <div class="card-footer-row">
          <span class="qty-badge">Qty: ${p.Qty} ${p.Unit}</span>
          <span class="price">Code ${p.RegularPrice}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ─── MODAL ────────────────────────────────────
function openModal(idx) {
  const p = allProducts[idx];
  if (!p) return;

  const fields = [
    ['Item No',          p.ItemNo],
    ['ALU',              p.alu],
    ['Item Name',        p.ItemName],
    ['Attribute',        p.Attribute],
    ['Size',             p.Size],
    ['Colour',           p.Colour],
    ['Department',       p.Department],
    ['Vendor',           p.Vendor],
    ['Unit',             p.Unit],
    ['Qty',              p.Qty],
    ['Code',    p.RegularPrice ? ` ${p.RegularPrice}` : '—'],
    ['Item Description', p.ItemDescription],
  ];

  const img = document.getElementById('modal-img');
  img.src = p.Picture || '';
  img.style.display = '';
  img.onerror = function() { this.style.display = 'none'; };

  document.getElementById('modal-title').textContent = p.ItemName || 'Product Details';
  document.getElementById('modal-fields').innerHTML = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `
      <div class="detail-row">
        <span class="detail-key">${k}</span>
        <span class="detail-val">${v}</span>
      </div>
    `).join('');

  document.getElementById('product-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('product-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// ─── ADMIN PAGE ───────────────────────────────
function renderAdminTable() {
  const tbody = document.getElementById('admin-tbody');
  if (!tbody) return;

  if (allProducts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:40px">No products loaded.</td></tr>';
    return;
  }

  document.getElementById('admin-stat-total').textContent  = allProducts.length;
  document.getElementById('admin-stat-dept').textContent   = [...new Set(allProducts.map(p => p.Department).filter(Boolean))].length;
  document.getElementById('admin-stat-vendor').textContent = [...new Set(allProducts.map(p => p.Vendor).filter(Boolean))].length;
  const totalQty = allProducts.reduce((s, p) => s + (parseFloat(p.Qty) || 0), 0);
  document.getElementById('admin-stat-qty').textContent = totalQty.toLocaleString();

  tbody.innerHTML = allProducts.map((p) => `
    <tr>
      <td><span class="tbl-no">${p.ItemNo}</span></td>
      <td class="mono">${p.alu}</td>
      <td class="tbl-name">${p.ItemName || '—'}</td>
      <td>${p.Size || '—'}</td>
      <td>${p.Colour || '—'}</td>
      <td><span class="dept-chip">${p.Department || '—'}</span></td>
      <td><span class="qty-num ${parseFloat(p.Qty) < 10 ? 'low' : ''}">${p.Qty}</span></td>
      <td class="price-col">Code ${p.RegularPrice}</td>
    </tr>
  `).join('');
}

function adminSearch() {
  const q = document.getElementById('admin-search').value.trim().toLowerCase();
  const rows = document.querySelectorAll('#admin-tbody tr');
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ─── FILTER PANEL TOGGLE ──────────────────────
function toggleFilters(btn) {
  const body = document.getElementById('filter-body');
  if (body.style.display === 'none') {
    body.style.display = '';
    btn.textContent = 'Collapse ▲';
  } else {
    body.style.display = 'none';
    btn.textContent = 'Expand ▼';
  }
}

// ─── KEYBOARD / CLICK OUTSIDE ─────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && !document.getElementById('login-page').classList.contains('hidden')) login();
});

document.getElementById('product-modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ─── INIT ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const user = sessionStorage.getItem('lordex_user');
  if (user) {
    currentUser = CONFIG.USERS.find(u => u.username === user) || null;
    showProductPage();
  }
});
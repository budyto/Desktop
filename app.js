(function () {
  const CFG = window.TIENDA_CONFIG || {};
  const CART_KEY = 'byn_cart_v1';
  const $ = id => document.getElementById(id);
  const money = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR');

  let products = [];
  let brandFilter = 'Todas';
  let genderFilter = 'Todos';
  let choice = { sku: '', full: 0, decant: 0 };
  let cart = loadCart();
  let loading = false;

  // ---------- Utilidades ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  }
  function normKey(s) {
    return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }
  function toNumber(v) {
    if (typeof v === 'number') return v;
    const s = String(v || '').replace(/[^\d,.-]/g, '');
    // "185.000" o "185.000,50" (formato AR) -> 185000 / 185000.5
    const n = Number(s.replace(/\./g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  // Convierte links de Google Drive en una URL de imagen que se puede mostrar.
  function photoUrl(url) {
    const s = String(url || '').trim();
    const m = s.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
    return m ? 'https://lh3.googleusercontent.com/d/' + m[1] : s;
  }
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2000);
  }

  // Parser CSV que respeta comillas y saltos de línea dentro de celdas.
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows[0].map(normKey);
    return rows.slice(1).filter(r => r.some(x => String(x).trim())).map(r => {
      const o = {};
      headers.forEach((h, i) => { o[h] = r[i]; });
      return o;
    });
  }

  // Lleva una fila de la hoja (con cualquier mayúscula/acento en los encabezados) al formato interno.
  function normalizeProduct(raw) {
    const r = {};
    Object.keys(raw).forEach(k => { r[normKey(k)] = raw[k]; });
    const stock = Math.max(0, Math.floor(toNumber(r.stock)));
    return {
      sku: String(r.sku || r.codigo || r.nombre || '').trim(),
      brand: String(r.marca || '').trim(),
      name: String(r.nombre || r.producto || '').trim(),
      gender: String(r.genero || r.categoria || '').trim(),
      price: toNumber(r.precio),
      decantPrice: toNumber(r.decant || r.preciodecant),
      stock: stock,
      photo: photoUrl(r.foto || r.imagen),
      description: String(r.descripcion || '').trim(),
      visible: !/^(no|false|0)$/i.test(String(r.visible == null ? 'si' : r.visible).trim()),
    };
  }

  // ---------- Carga del catálogo ----------
  async function fetchCatalog() {
    if (CFG.appsScriptUrl) {
      const res = await fetch(CFG.appsScriptUrl + '?accion=catalogo&t=' + Date.now());
      const data = await res.json();
      return { rows: data.productos || [], updatedAt: data.actualizado };
    }
    if (CFG.csvUrl) {
      const sep = CFG.csvUrl.includes('?') ? '&' : '?';
      const res = await fetch(CFG.csvUrl + sep + 't=' + Date.now());
      return { rows: parseCsv(await res.text()), updatedAt: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) };
    }
    $('demoBanner').hidden = false;
    return { rows: window.DEMO_PRODUCTOS || [], updatedAt: 'demo' };
  }

  async function loadCatalog(silent) {
    if (loading) return;
    loading = true;
    try {
      const { rows, updatedAt } = await fetchCatalog();
      products = rows.map(normalizeProduct).filter(p => p.visible && p.name && p.sku);
      $('updated').textContent = updatedAt ? 'Actualizado ' + updatedAt : '';
      dropUnavailableFromCart();
      renderFilters();
      renderProducts();
      renderCart();
    } catch (err) {
      console.error(err);
      if (!silent) $('grid').innerHTML = '<div class="msg">No pudimos cargar el catálogo. Recargá la página.</div>';
    } finally {
      loading = false;
    }
  }

  // ---------- Catálogo ----------
  function stockBadge(p) {
    if (p.stock <= 0) return '<span class="badge out">Sin stock</span>';
    if (p.stock <= (CFG.pocoStock || 3)) return '<span class="badge low">Últimas unidades</span>';
    return '<span class="badge ok">Disponible</span>';
  }

  function bottleSvg(p) {
    // Imagen ilustrativa cuando el producto no tiene foto cargada.
    let h = 0;
    for (const c of p.sku) h = (h * 31 + c.charCodeAt(0)) % 360;
    return '<svg class="bottle" viewBox="0 0 100 140" aria-hidden="true">' +
      '<rect x="40" y="8" width="20" height="16" rx="3" fill="#2a2a2a"/>' +
      '<rect x="44" y="22" width="12" height="10" fill="#6b6d6c"/>' +
      '<rect x="18" y="32" width="64" height="98" rx="14" fill="hsl(' + h + ',10%,' + (72 + h % 14) + '%)"/>' +
      '<rect x="28" y="62" width="44" height="34" rx="4" fill="#fff" opacity=".85"/>' +
      '<text x="50" y="83" text-anchor="middle" font-family="Georgia,serif" font-size="7" fill="#333">' + escapeHtml(p.brand.slice(0, 14)) + '</text></svg>';
  }

  function renderFilters() {
    const genders = ['Todos'].concat([...new Set(products.map(p => p.gender).filter(Boolean))].sort());
    const brands = ['Todas'].concat([...new Set(products.map(p => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')));
    if (!genders.includes(genderFilter)) genderFilter = 'Todos';
    if (!brands.includes(brandFilter)) brandFilter = 'Todas';
    $('genderFilters').innerHTML = genders.length > 2 ? genders.map(g => '<button class="chip ' + (g === genderFilter ? 'active' : '') + '" data-gender="' + escapeHtml(g) + '">' + escapeHtml(g) + '</button>').join('') : '';
    $('brandFilters').innerHTML = brands.map(b => '<button class="chip ' + (b === brandFilter ? 'active' : '') + '" data-brand="' + escapeHtml(b) + '">' + escapeHtml(b) + '</button>').join('');
  }

  function filtered() {
    const q = normKey($('search').value);
    const list = products.filter(p =>
      (!q || normKey(p.name + p.brand).includes(q)) &&
      (brandFilter === 'Todas' || p.brand === brandFilter) &&
      (genderFilter === 'Todos' || p.gender === genderFilter));
    const sort = $('sort').value;
    // Siempre los que tienen stock primero.
    return list.sort((a, b) => (b.stock > 0) - (a.stock > 0) ||
      (sort === 'precioAsc' ? a.price - b.price : sort === 'precioDesc' ? b.price - a.price : (a.brand + a.name).localeCompare(b.brand + b.name, 'es')));
  }

  function renderProducts() {
    const list = filtered();
    $('resultCount').textContent = list.length + (list.length === 1 ? ' producto' : ' productos');
    if (!list.length) { $('grid').innerHTML = '<div class="msg">No encontramos productos con ese filtro.</div>'; return; }
    $('grid').innerHTML = list.map(p => {
      const photo = p.photo ? '<img loading="lazy" src="' + escapeHtml(p.photo) + '" alt="' + escapeHtml(p.name) + '">' : bottleSvg(p);
      const decant = p.decantPrice > 0 && p.stock > 0 ? '<span class="badge decant">Decant ' + money(p.decantPrice) + '</span>' : '';
      return '<article class="card"><div class="photo">' + photo + '</div><div class="body">' +
        '<div class="brand">' + escapeHtml(p.brand) + '</div><div class="name">' + escapeHtml(p.name) + '</div>' +
        (p.description ? '<div class="desc">' + escapeHtml(p.description) + '</div>' : '') +
        '<div class="badges">' + stockBadge(p) + decant + '</div>' +
        '<div class="price">' + money(p.price) + '</div>' +
        '<button class="add" data-add="' + escapeHtml(p.sku) + '"' + (p.stock > 0 ? '' : ' disabled') + '>' + (p.stock > 0 ? 'AGREGAR' : 'SIN STOCK') + '</button>' +
        '</div></article>';
    }).join('');
    // Si una foto no carga, mostramos la ilustración.
    $('grid').querySelectorAll('.photo img').forEach(img => {
      img.onerror = () => { const p = bySku(img.closest('.card').querySelector('[data-add]').dataset.add); img.outerHTML = bottleSvg(p); };
    });
  }

  // ---------- Carrito ----------
  const keyFor = (sku, tipo) => tipo + '::' + sku;
  const bySku = sku => products.find(p => p.sku === sku);
  function loadCart() { try { return JSON.parse(localStorage.getItem(CART_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} renderCart(); }

  function cartRows() {
    return Object.keys(cart).map(key => {
      const [tipo, ...rest] = key.split('::');
      const p = bySku(rest.join('::'));
      const qty = Number(cart[key] || 0);
      if (!p || qty <= 0) return null;
      const dec = tipo === 'decant';
      return { key, p, tipo, qty, price: dec ? p.decantPrice : p.price, label: (dec ? 'Decant 5 ml · ' : '') + p.brand + ' ' + p.name };
    }).filter(Boolean);
  }

  // Los decants se fraccionan de un frasco abierto, así que no se limitan por el stock de frascos.
  function maxFor(p, tipo) { return tipo === 'decant' ? 20 : p.stock; }

  function setQty(sku, tipo, qty) {
    const p = bySku(sku);
    if (!p) return false;
    const key = keyFor(sku, tipo);
    if (qty <= 0) { delete cart[key]; return true; }
    if (qty > maxFor(p, tipo)) { toast('Solo hay ' + p.stock + ' unidad(es) disponibles'); return false; }
    cart[key] = qty;
    return true;
  }

  function dropUnavailableFromCart() {
    let changed = false;
    Object.keys(cart).forEach(key => {
      const [tipo, ...rest] = key.split('::');
      const p = bySku(rest.join('::'));
      if (!p || p.stock <= 0) { delete cart[key]; changed = true; }
      else if (tipo === 'full' && cart[key] > p.stock) { cart[key] = p.stock; changed = true; }
    });
    if (changed) { saveCart(); toast('Actualizamos tu carrito según el stock disponible'); }
  }

  function renderCart() {
    const rows = cartRows();
    $('cartCount').textContent = rows.reduce((s, x) => s + x.qty, 0);
    $('checkout').disabled = !rows.length;
    $('cartItems').innerHTML = rows.length ? rows.map(x =>
      '<div class="cartItem"><div><div class="cartName">' + escapeHtml(x.label) + '</div><div class="cartPrice">' + money(x.price) + ' c/u</div>' +
      '<button class="remove" data-remove="' + escapeHtml(x.key) + '">Quitar</button></div>' +
      '<div class="qty"><button data-delta="-1" data-key="' + escapeHtml(x.key) + '">−</button><b>' + x.qty + '</b><button data-delta="1" data-key="' + escapeHtml(x.key) + '">+</button></div></div>'
    ).join('') : '<div class="msg">Todavía no agregaste productos.</div>';
    $('total').textContent = money(rows.reduce((s, x) => s + x.qty * x.price, 0));
  }

  function addProduct(sku) {
    const p = bySku(sku);
    if (!p || p.stock <= 0) return;
    if (p.decantPrice > 0) { openChoice(p); return; }
    if (setQty(sku, 'full', Number(cart[keyFor(sku, 'full')] || 0) + 1)) { saveCart(); toast('Agregado al carrito'); }
  }

  function openChoice(p) {
    choice = { sku: p.sku, full: Number(cart[keyFor(p.sku, 'full')] || 0), decant: Number(cart[keyFor(p.sku, 'decant')] || 0) };
    if (!choice.full && !choice.decant) choice.full = 1;
    $('choiceName').textContent = p.brand + ' ' + p.name;
    $('choiceFullPrice').textContent = money(p.price);
    $('choiceDecantPrice').textContent = money(p.decantPrice);
    renderChoice();
    $('choiceModal').classList.add('show');
  }
  function renderChoice() { $('choiceFull').textContent = choice.full; $('choiceDecant').textContent = choice.decant; }
  function applyChoice() {
    if (setQty(choice.sku, 'full', choice.full) && setQty(choice.sku, 'decant', choice.decant)) {
      saveCart();
      $('choiceModal').classList.remove('show');
      toast('Carrito actualizado');
    }
  }

  function openCart() { $('overlay').classList.add('show'); $('drawer').classList.add('show'); }
  function closeCart() { $('overlay').classList.remove('show'); $('drawer').classList.remove('show'); }

  // ---------- Pedido ----------
  function orderMessage(data, rows, orderId) {
    const lines = ['Hola! Quiero hacer este pedido' + (orderId ? ' (' + orderId + ')' : '') + ':', ''];
    rows.forEach(x => lines.push('• ' + x.qty + ' x ' + x.label + ' — ' + money(x.qty * x.price)));
    lines.push('', 'Total: ' + money(rows.reduce((s, x) => s + x.qty * x.price, 0)), '');
    lines.push('Nombre: ' + data.nombre, 'WhatsApp: ' + data.telefono, 'Entrega: ' + data.entrega);
    if (data.entrega === 'Envío') lines.push('Dirección: ' + data.direccion + ', ' + data.localidad + (data.cp ? ' (CP ' + data.cp + ')' : ''));
    if (data.observaciones) lines.push('Obs: ' + data.observaciones);
    return lines.join('\n');
  }

  async function submitOrder(e) {
    e.preventDefault();
    const rows = cartRows();
    if (!rows.length) return;
    const data = Object.fromEntries(new FormData($('orderForm')).entries());
    if (data.entrega === 'Envío' && (!data.direccion || !data.localidad)) {
      $('formStatus').textContent = 'Completá la dirección y la localidad para el envío.';
      return;
    }
    $('sendOrder').disabled = true;
    $('formStatus').textContent = '';
    let orderId = '';
    if (CFG.appsScriptUrl) {
      // Registra el pedido en la hoja "Pedidos". text/plain evita el preflight CORS de Apps Script.
      try {
        const res = await fetch(CFG.appsScriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ accion: 'pedido', cliente: data, items: rows.map(x => ({ sku: x.p.sku, tipo: x.tipo, cantidad: x.qty, precio: x.price })) }),
        });
        const r = await res.json();
        if (!r.ok) {
          $('formStatus').textContent = r.mensaje || 'No pudimos registrar el pedido.';
          $('sendOrder').disabled = false;
          loadCatalog(true);
          return;
        }
        orderId = r.pedido;
      } catch (err) {
        console.error(err); // Si falla el registro, igual mandamos el pedido por WhatsApp.
      }
    }
    const url = 'https://wa.me/' + CFG.whatsapp + '?text=' + encodeURIComponent(orderMessage(data, rows, orderId));
    cart = {};
    saveCart();
    $('sendOrder').disabled = false;
    $('checkoutModal').classList.remove('show');
    $('orderForm').reset();
    window.location.href = url;
  }

  // ---------- Eventos ----------
  document.addEventListener('click', e => {
    const t = e.target;
    const g = t.closest('[data-gender]');
    if (g) { genderFilter = g.dataset.gender; renderFilters(); renderProducts(); return; }
    const b = t.closest('[data-brand]');
    if (b) { brandFilter = b.dataset.brand; renderFilters(); renderProducts(); return; }
    const add = t.closest('[data-add]');
    if (add) { addProduct(add.dataset.add); return; }
    const rem = t.closest('[data-remove]');
    if (rem) { delete cart[rem.dataset.remove]; saveCart(); return; }
    const d = t.closest('[data-delta]');
    if (d) {
      const [tipo, ...rest] = d.dataset.key.split('::');
      if (setQty(rest.join('::'), tipo, Number(cart[d.dataset.key] || 0) + Number(d.dataset.delta))) saveCart();
      return;
    }
    const c = t.closest('[data-choice]');
    if (c) {
      const field = c.dataset.choice, p = bySku(choice.sku), next = Math.max(0, choice[field] + Number(c.dataset.step));
      if (p && next > maxFor(p, field)) { toast('Solo hay ' + p.stock + ' unidad(es) disponibles'); return; }
      choice[field] = next;
      renderChoice();
      return;
    }
    const close = t.closest('[data-close]');
    if (close) { $(close.dataset.close).classList.remove('show'); return; }
    if (t.classList.contains('modal')) t.classList.remove('show');
  });

  $('search').addEventListener('input', renderProducts);
  $('sort').addEventListener('change', renderProducts);
  $('cartBtn').onclick = openCart;
  $('closeCart').onclick = closeCart;
  $('overlay').onclick = closeCart;
  $('applyChoice').onclick = applyChoice;
  $('checkout').onclick = () => { closeCart(); $('formStatus').textContent = ''; $('checkoutModal').classList.add('show'); };
  $('entrega').onchange = () => { $('shipFields').hidden = $('entrega').value !== 'Envío'; };
  $('orderForm').addEventListener('submit', submitOrder);

  // ---------- Inicio ----------
  if (CFG.nombre) { $('brandName').textContent = CFG.nombre; document.title = CFG.nombre; }
  $('brandSub').textContent = CFG.subtitulo || '';
  $('igLink').href = CFG.instagram || '#';
  $('waLink').href = 'https://wa.me/' + (CFG.whatsapp || '');
  renderCart();
  loadCatalog(false);
  setInterval(() => { if (!document.hidden) loadCatalog(true); }, (CFG.refrescoSegundos || 60) * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadCatalog(true); });
})();

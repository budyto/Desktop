/**
 * Backend de la tienda en Google Sheets (Apps Script).
 *
 * Hojas que usa:
 *  - Productos: SKU | Marca | Nombre | Genero | Precio | Decant | Stock | Foto | Descripcion | Visible
 *  - Pedidos:   se completa sola con cada pedido que entra desde la web.
 *
 * Publicación: Implementar > Nueva implementación > Aplicación web
 *   Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario
 * La URL que termina en /exec va en config.js -> appsScriptUrl.
 */

const HOJA_PRODUCTOS = 'Productos';
const HOJA_PEDIDOS = 'Pedidos';
const COLUMNAS_PRODUCTOS = ['SKU', 'Marca', 'Nombre', 'Genero', 'Precio', 'Decant', 'Stock', 'Foto', 'Descripcion', 'Visible'];
const COLUMNAS_PEDIDOS = ['Pedido', 'Fecha', 'Estado', 'Cliente', 'Telefono', 'Entrega', 'Direccion', 'Detalle', 'Total', 'Items JSON', 'Observaciones'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Tienda')
    .addItem('Confirmar pedido (descuenta stock)', 'confirmarPedidoSeleccionado')
    .addItem('Cancelar pedido', 'cancelarPedidoSeleccionado')
    .addSeparator()
    .addItem('Crear hojas iniciales', 'crearHojas')
    .addToUi();
}

// ---------- Web: lectura del catálogo ----------
function doGet() {
  const sh = hoja_(HOJA_PRODUCTOS);
  const values = sh.getDataRange().getValues();
  const headers = values.shift().map(String);
  const productos = values
    .filter(r => r.some(c => c !== ''))
    .map(r => {
      const o = {};
      headers.forEach((h, i) => { o[h] = r[i]; });
      return o;
    });
  const actualizado = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM HH:mm');
  return json_({ ok: true, actualizado: actualizado, productos: productos });
}

// ---------- Web: alta de pedidos ----------
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.accion !== 'pedido') return json_({ ok: false, mensaje: 'Acción desconocida' });

    const productos = productosPorSku_();
    let total = 0;
    const detalle = [];
    for (const it of body.items || []) {
      const p = productos[String(it.sku)];
      const cantidad = Number(it.cantidad) || 0;
      if (!p || cantidad <= 0) return json_({ ok: false, mensaje: 'Un producto del carrito ya no está disponible.' });
      const esDecant = it.tipo === 'decant';
      if (!esDecant && cantidad > p.stock) {
        return json_({ ok: false, mensaje: 'De ' + p.nombre + ' quedan ' + p.stock + ' unidad(es). Ajustá el carrito.' });
      }
      // El precio sale siempre de la hoja, nunca del navegador.
      const precio = esDecant ? p.decant : p.precio;
      total += precio * cantidad;
      detalle.push(cantidad + ' x ' + (esDecant ? 'Decant ' : '') + p.marca + ' ' + p.nombre);
    }
    if (!detalle.length) return json_({ ok: false, mensaje: 'El carrito está vacío.' });

    const c = body.cliente || {};
    const sh = hoja_(HOJA_PEDIDOS);
    const id = 'P-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd') + '-' + String(sh.getLastRow()).padStart(3, '0');
    sh.appendRow([
      id, new Date(), 'PENDIENTE', c.nombre || '', c.telefono || '', c.entrega || '',
      [c.direccion, c.localidad, c.cp].filter(Boolean).join(', '),
      detalle.join('\n'), total, JSON.stringify(body.items), c.observaciones || '',
    ]);
    return json_({ ok: true, pedido: id, total: total });
  } catch (err) {
    return json_({ ok: false, mensaje: 'No pudimos registrar el pedido.' });
  } finally {
    lock.releaseLock();
  }
}

// ---------- Menú: confirmar / cancelar ----------
function confirmarPedidoSeleccionado() {
  const ui = SpreadsheetApp.getUi();
  const fila = filaPedidoSeleccionada_();
  if (!fila) return;
  const sh = hoja_(HOJA_PEDIDOS);
  const estado = sh.getRange(fila, 3).getValue();
  if (estado !== 'PENDIENTE') { ui.alert('Este pedido está ' + estado + '.'); return; }

  const items = JSON.parse(sh.getRange(fila, 10).getValue() || '[]').filter(it => it.tipo !== 'decant');
  const prod = hoja_(HOJA_PRODUCTOS);
  const values = prod.getDataRange().getValues();
  const headers = values[0].map(String);
  const colSku = headers.indexOf('SKU'), colStock = headers.indexOf('Stock');

  // Verifica todo antes de descontar, para no dejar el stock a medias.
  const cambios = [];
  for (const it of items) {
    const i = values.findIndex((r, idx) => idx > 0 && String(r[colSku]) === String(it.sku));
    if (i < 0) { ui.alert('No se encontró el SKU ' + it.sku + '.'); return; }
    const nuevo = Number(values[i][colStock]) - Number(it.cantidad);
    if (nuevo < 0) { ui.alert('No hay stock suficiente de ' + values[i][headers.indexOf('Nombre')] + '.'); return; }
    values[i][colStock] = nuevo;
    cambios.push([i + 1, nuevo]);
  }
  cambios.forEach(([row, stock]) => prod.getRange(row, colStock + 1).setValue(stock));
  sh.getRange(fila, 3).setValue('CONFIRMADO');
  ui.alert('Pedido confirmado. Stock actualizado: la web ya lo muestra.');
}

function cancelarPedidoSeleccionado() {
  const fila = filaPedidoSeleccionada_();
  if (fila) hoja_(HOJA_PEDIDOS).getRange(fila, 3).setValue('CANCELADO');
}

function crearHojas() {
  const ss = SpreadsheetApp.getActive();
  [[HOJA_PRODUCTOS, COLUMNAS_PRODUCTOS], [HOJA_PEDIDOS, COLUMNAS_PEDIDOS]].forEach(([nombre, cols]) => {
    const sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
    if (sh.getLastRow() === 0) {
      sh.appendRow(cols);
      sh.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#111').setFontColor('#fff');
      sh.setFrozenRows(1);
    }
  });
}

// ---------- Helpers ----------
function hoja_(nombre) {
  const sh = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!sh) throw new Error('Falta la hoja "' + nombre + '". Usá Tienda > Crear hojas iniciales.');
  return sh;
}

function productosPorSku_() {
  const values = hoja_(HOJA_PRODUCTOS).getDataRange().getValues();
  const h = values.shift().map(String);
  const col = name => h.indexOf(name);
  const out = {};
  values.forEach(r => {
    const sku = String(r[col('SKU')]).trim();
    if (!sku || /^(no|false)$/i.test(String(r[col('Visible')]))) return;
    out[sku] = {
      marca: r[col('Marca')], nombre: r[col('Nombre')],
      precio: Number(r[col('Precio')]) || 0, decant: Number(r[col('Decant')]) || 0,
      stock: Number(r[col('Stock')]) || 0,
    };
  });
  return out;
}

function filaPedidoSeleccionada_() {
  const sh = SpreadsheetApp.getActiveSheet();
  const fila = sh.getActiveRange().getRow();
  if (sh.getName() !== HOJA_PEDIDOS || fila < 2) {
    SpreadsheetApp.getUi().alert('Seleccioná una fila de la hoja "Pedidos".');
    return 0;
  }
  return fila;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

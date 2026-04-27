/**
 * Backend para la venta de garaje.
 *
 * Configuracion recomendada:
 * 1. Pegar este archivo en Apps Script ligado a la hoja de calculo.
 * 2. Ejecutar inicializarHoja().
 * 3. En Propiedades del script crear ADMIN_PASSWORD con la clave del panel.
 * 4. Desplegar como App Web: ejecutar como "Yo", acceso "Cualquier persona".
 */

const SHEET_NAME = 'Productos';
const ADMIN_PASSWORD_PROPERTY = 'ADMIN_PASSWORD';
const SPREADSHEET_ID_PROPERTY = 'SPREADSHEET_ID';
const PUBLIC_CACHE_KEY = 'productos_publicos_v2';
const PUBLIC_CACHE_SECONDS = 5;
const PURCHASES_SHEET_NAME = 'Compras';
const HEADERS = [
  'ID',
  'Imagen URL',
  'Nombre',
  'Descripcion',
  'Precio',
  'Estado',
  'Comprador',
  'Cedula',
  'Fecha/Hora',
  'Cantidad Disponible',
  'Cantidad Inicial'
];
const PURCHASE_HEADERS = [
  'Fecha/Hora',
  'ID Producto',
  'Producto',
  'Cantidad',
  'Precio Unitario',
  'Total',
  'Comprador',
  'Cedula'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Venta de garaje')
    .addItem('Inicializar hoja', 'inicializarHoja')
    .addItem('Configurar clave admin', 'configurarClaveAdmin')
    .addToUi();
}

function inicializarHoja() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  if (sheet.getMaxColumns() < HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
  }

  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setValues([HEADERS]);
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, HEADERS.length);
  inicializarHojaCompras_();
  invalidatePublicCache_();
}

function inicializarHojaCompras_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(PURCHASES_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(PURCHASES_SHEET_NAME);

  if (sheet.getMaxColumns() < PURCHASE_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), PURCHASE_HEADERS.length - sheet.getMaxColumns());
  }

  const headerRange = sheet.getRange(1, 1, 1, PURCHASE_HEADERS.length);
  headerRange.setValues([PURCHASE_HEADERS]);
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function configurarClaveAdmin() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Clave admin', 'Escribe la clave para el panel de administracion:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const clave = String(response.getResponseText() || '').trim();
  if (!clave) {
    ui.alert('La clave no puede estar vacia.');
    return;
  }

  PropertiesService.getScriptProperties().setProperty(ADMIN_PASSWORD_PROPERTY, clave);
  ui.alert('Clave admin guardada.');
}

function doGet() {
  try {
    const cached = getPublicCache_();
    if (cached) {
      return json_(cached);
    }

    const payload = {
      ok: true,
      productos: listProducts_(false)
    };
    setPublicCache_(payload);
    return json_(payload);
  } catch (err) {
    return json_({ ok: false, mensaje: cleanError_(err) });
  }
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    const accion = String(body.accion || '').trim();

    if (accion === 'verificarClave') return json_({ ok: isAdmin_(body.clave) });
    if (accion === 'listarAdmin') return listAdmin_(body);
    if (accion === 'listarVentas') return listPurchases_(body);
    if (accion === 'compra') return comprar_(body);
    if (accion === 'agregarProducto') return agregarProducto_(body);
    if (accion === 'subirImagen') return subirImagen_(body);
    if (accion === 'resetear') return resetear_(body);

    return json_({ ok: false, mensaje: 'Accion no valida.' });
  } catch (err) {
    return json_({ ok: false, mensaje: cleanError_(err) });
  }
}

function listAdmin_(body) {
  requireAdmin_(body.clave);
  return json_({
    ok: true,
    productos: listProducts_(true)
  });
}

function listPurchases_(body) {
  requireAdmin_(body.clave);
  const sheet = getPurchasesSheet_();
  const lastRow = sheet.getLastRow();
  const values = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, PURCHASE_HEADERS.length).getValues();

  const ventas = values.map((row) => ({
    fecha: formatDate_(row[0]),
    idProducto: String(row[1] || ''),
    producto: String(row[2] || ''),
    cantidad: row[3],
    precio: row[4],
    total: row[5],
    comprador: String(row[6] || ''),
    cedula: String(row[7] || '')
  })).reverse(); // Mas recientes primero

  return json_({ ok: true, ventas });
}

function comprar_(body) {
  const nombre = String(body.nombre || '').trim();
  const cedula = String(body.cedula || '').trim();
  const cantidadSolicitada = parseQuantity_(body.cantidad);
  if (!nombre) return json_({ ok: false, mensaje: 'El nombre es obligatorio.' });
  if (!cedula) return json_({ ok: false, mensaje: 'La cedula es obligatoria.' });
  if (!cantidadSolicitada) return json_({ ok: false, mensaje: 'La cantidad no es valida.' });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return json_({
      ok: false,
      mensaje: 'Hay muchas compras al mismo tiempo. Intenta de nuevo en unos segundos.'
    });
  }

  try {
    const sheet = getSheet_();
    const product = findProduct_(sheet, body.id, body.rowIndex);
    if (!product) return json_({ ok: false, mensaje: 'Producto no encontrado.' });
    const disponible = getAvailableQty_(product.values);
    if (String(product.values[5] || '') === 'Vendido' || disponible <= 0) {
      return json_({ ok: false, mensaje: 'Este producto ya fue vendido.' });
    }
    if (cantidadSolicitada > disponible) {
      return json_({
        ok: false,
        mensaje: 'Solo quedan ' + disponible + ' unidades disponibles.'
      });
    }

    const restante = disponible - cantidadSolicitada;
    const cantidadInicial = getInitialQty_(product.values);
    const estado = restante > 0 ? 'Disponible' : 'Vendido';
    const fecha = new Date();

    sheet.getRange(product.rowNumber, 6, 1, 6).setValues([[
      estado,
      nombre,
      cedula,
      fecha,
      restante,
      cantidadInicial
    ]]);
    registrarCompra_(product.values, cantidadSolicitada, nombre, cedula, fecha);

    invalidatePublicCache_();
    return json_({
      ok: true,
      mensaje: restante > 0
        ? 'Compra registrada. Quedan ' + restante + ' unidades disponibles.'
        : 'Compra registrada. Producto agotado.'
    });
  } finally {
    lock.releaseLock();
  }
}

function agregarProducto_(body) {
  requireAdmin_(body.clave);

  const id = String(body.id || '').trim();
  const nombre = String(body.nombre || '').trim();
  const descripcion = String(body.descripcion || '').trim();
  const imagenUrl = String(body.imagenUrl || '').trim();
  const precio = Number(body.precio);
  const cantidad = parseQuantity_(body.cantidad) || 1;

  if (!id || !nombre || !Number.isFinite(precio)) {
    return json_({ ok: false, mensaje: 'ID, nombre y precio valido son obligatorios.' });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return json_({ ok: false, mensaje: 'El sistema esta ocupado. Intenta de nuevo.' });
  }

  try {
    const sheet = getSheet_();
    if (findProduct_(sheet, id, null)) {
      return json_({ ok: false, mensaje: 'Ya existe un producto con ese ID.' });
    }

    sheet.appendRow([id, imagenUrl, nombre, descripcion, precio, 'Disponible', '', '', '', cantidad, cantidad]);
    invalidatePublicCache_();
    return json_({ ok: true, mensaje: 'Producto publicado.' });
  } finally {
    lock.releaseLock();
  }
}

function resetear_(body) {
  requireAdmin_(body.clave);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return json_({ ok: false, mensaje: 'El sistema esta ocupado. Intenta de nuevo.' });
  }

  try {
    const sheet = getSheet_();
    const product = findProduct_(sheet, body.id, body.rowIndex);
    if (!product) return json_({ ok: false, mensaje: 'Producto no encontrado.' });
    const cantidadInicial = getInitialQty_(product.values);

    sheet.getRange(product.rowNumber, 6, 1, 6).setValues([['Disponible', '', '', '', cantidadInicial, cantidadInicial]]);
    invalidatePublicCache_();
    return json_({ ok: true, mensaje: 'Producto marcado como disponible.' });
  } finally {
    lock.releaseLock();
  }
}

function subirImagen_(body) {
  requireAdmin_(body.clave);

  const mimeType = String(body.mimeType || '').trim();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mimeType)) {
    return json_({ ok: false, mensaje: 'Formato de imagen no permitido.' });
  }

  const base64 = String(body.base64 || '');
  if (!base64 || base64.length > 8 * 1024 * 1024) {
    return json_({ ok: false, mensaje: 'Imagen vacia o demasiado grande.' });
  }

  const safeName = String(body.nombreArchivo || 'producto').replace(/[^\w.-]+/g, '_').slice(0, 80);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, safeName);
  const file = DriveApp.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return json_({
    ok: true,
    url: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(file.getId()) + '&sz=w800'
  });
}

function listProducts_(includePrivate) {
  const sheet = getSheet_();
  const values = getDataRows_(sheet);
  return values.map((row, index) => productFromRow_(row, index + 2, includePrivate));
}

function productFromRow_(row, rowNumber, includePrivate) {
  const product = {
    id: String(row[0] || ''),
    imagenUrl: String(row[1] || ''),
    nombre: String(row[2] || ''),
    descripcion: String(row[3] || ''),
    precio: row[4],
    estado: getAvailableQty_(row) > 0 ? 'Disponible' : 'Vendido',
    cantidadDisponible: getAvailableQty_(row),
    cantidadInicial: getInitialQty_(row),
    rowIndex: rowNumber
  };

  if (includePrivate) {
    product.comprador = String(row[6] || '');
    product.cedula = String(row[7] || '');
    product.fecha = formatDate_(row[8]);
  }

  return product;
}

function findProduct_(sheet, id, rowIndex) {
  const values = getDataRows_(sheet);
  const normalizedId = String(id || '').trim();
  const numericRowIndex = Number(rowIndex);

  if (Number.isFinite(numericRowIndex) && numericRowIndex >= 2) {
    const localIndex = numericRowIndex - 2;
    const row = values[localIndex];
    if (row && (!normalizedId || String(row[0] || '').trim() === normalizedId)) {
      return { rowNumber: numericRowIndex, values: row };
    }
  }

  if (!normalizedId) return null;

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === normalizedId) {
      return { rowNumber: i + 2, values: values[i] };
    }
  }
  return null;
}

function getDataRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
}

function parseQuantity_(value) {
  const cantidad = Number(value);
  if (!Number.isFinite(cantidad)) return 0;
  const entero = Math.floor(cantidad);
  return entero > 0 ? entero : 0;
}

function getAvailableQty_(row) {
  const cantidad = Number(row[9]);
  if (Number.isFinite(cantidad)) return Math.max(0, Math.floor(cantidad));
  return String(row[5] || '') === 'Vendido' ? 0 : 1;
}

function getInitialQty_(row) {
  const cantidadInicial = Number(row[10]);
  if (Number.isFinite(cantidadInicial) && cantidadInicial > 0) return Math.floor(cantidadInicial);

  const disponible = getAvailableQty_(row);
  return disponible > 0 ? disponible : 1;
}

function registrarCompra_(productRow, cantidad, comprador, cedula, fecha) {
  const sheet = getPurchasesSheet_();
  const precio = Number(productRow[4]) || 0;
  sheet.appendRow([
    fecha,
    String(productRow[0] || ''),
    String(productRow[2] || ''),
    cantidad,
    precio,
    precio * cantidad,
    comprador,
    cedula
  ]);
}

function getPurchasesSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(PURCHASES_SHEET_NAME);
  if (!sheet) {
    inicializarHojaCompras_();
    sheet = ss.getSheetByName(PURCHASES_SHEET_NAME);
  }
  return sheet;
}

function getSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    inicializarHoja();
    sheet = ss.getSheetByName(SHEET_NAME);
  }
  return sheet;
}

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty(SPREADSHEET_ID_PROPERTY);
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('Configura SPREADSHEET_ID en las propiedades del script.');
  }
  return active;
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function requireAdmin_(clave) {
  if (!isAdmin_(clave)) throw new Error('Clave de administrador invalida.');
}

function isAdmin_(clave) {
  const configured = PropertiesService.getScriptProperties().getProperty(ADMIN_PASSWORD_PROPERTY);
  return Boolean(configured) && String(clave || '') === configured;
}

function invalidatePublicCache_() {
  try {
    CacheService.getScriptCache().remove(PUBLIC_CACHE_KEY);
  } catch (err) {
    console.warn(cleanError_(err));
  }
}

function getPublicCache_() {
  try {
    const cached = CacheService.getScriptCache().get(PUBLIC_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    console.warn(cleanError_(err));
    return null;
  }
}

function setPublicCache_(payload) {
  try {
    CacheService.getScriptCache().put(PUBLIC_CACHE_KEY, JSON.stringify(payload), PUBLIC_CACHE_SECONDS);
  } catch (err) {
    console.warn(cleanError_(err));
  }
}

function formatDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }
  return String(value);
}

function cleanError_(err) {
  return String(err && err.message ? err.message : err);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

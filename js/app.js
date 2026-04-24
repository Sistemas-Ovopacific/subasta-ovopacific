/**
 * app.js - Catalogo Rapido (Frontend)
 */

const CONFIG = window.GARAJE_CONFIG || {};
const API_URL = CONFIG.API_URL || "";
const REQUEST_TIMEOUT_MS = CONFIG.REQUEST_TIMEOUT_MS || 15000;
const COMPRA_MAX_REINTENTOS = 3;
const PRODUCTOS_CACHE_KEY = "garaje_productos_publicos_v2";
const PRODUCTOS_CACHE_TTL_MS = 15 * 1000;

let productosMap = {};
let cargandoProductos = false;
let catalogoTieneProductos = false;

window.addEventListener("DOMContentLoaded", () => {
  const hayCache = renderizarProductosDesdeCache();
  cargarProductos({ silencioso: hayCache });
});

async function cargarProductos(opciones = {}) {
  if (cargandoProductos) return;

  if (!API_URL) {
    mostrarCarga("Falta configurar la URL del API.");
    return;
  }

  const catalogo = document.getElementById("catalogo");
  cargandoProductos = true;
  actualizarBotonRefresh(true);

  if (!opciones.silencioso && !catalogoTieneProductos) {
    catalogo.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Cargando productos...</p>
      </div>`;
  }

  try {
    const data = await apiGet();
    if (!data.ok) throw new Error(data.mensaje || data.error || "Error desconocido");

    productosMap = {};
    const productos = (data.productos || []).map(normalizarProducto);
    productos.forEach(p => { productosMap[p.rowIndex] = p; });

    renderizarProductos(productos);
    actualizarEstadisticas(productos);
    guardarProductosEnCache(productos);
  } catch (err) {
    if (!catalogoTieneProductos) {
      mostrarCarga(`Error al cargar productos. ${err.message}`);
    }
  } finally {
    cargandoProductos = false;
    actualizarBotonRefresh(false);
  }
}

function renderizarProductos(productos) {
  const catalogo = document.getElementById("catalogo");

  if (!productos.length) {
    mostrarCarga("No hay productos publicados aun.");
    return;
  }

  catalogoTieneProductos = true;
  catalogo.innerHTML = productos.map(p => {
    const cantidadDisponible = getCantidadDisponible(p);
    const vendido = p.estado === "Vendido" || cantidadDisponible <= 0;
    const badgeCls = vendido ? "badge-vendido" : "badge-disponible";
    const badgeTxt = vendido ? "Agotado" : "Disponible";
    const rowIndex = Number.isFinite(p.rowIndex) ? p.rowIndex : 0;
    const imgHtml = p.imagenUrl
      ? `<img src="${escAttr(p.imagenUrl)}" alt="${escAttr(p.nombre)}" loading="lazy" decoding="async"
             onclick="abrirLightbox('${escAttr(p.imagenUrl)}')"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : "";
    const placeholder = `<span class="img-placeholder" style="display:${p.imagenUrl ? "none" : "flex"}">🛍️</span>`;

    return `
      <div class="card ${vendido ? "vendido" : ""}">
        <div class="card-img-wrap">
          ${imgHtml}${placeholder}
        </div>
        <span class="badge ${badgeCls}">${badgeTxt}</span>
        <div class="card-body">
          <h3>${escHtml(p.nombre)}</h3>
          <p class="card-desc">${escHtml(p.descripcion) || "—"}</p>
          <div class="stock-line">
            <span>${cantidadDisponible} disponibles</span>
            ${p.cantidadInicial > 1 ? `<small>de ${p.cantidadInicial}</small>` : ""}
          </div>
          <p class="card-precio">${formatearPrecio(p.precio)}</p>
        </div>
        <button
          class="btn-comprar"
          ${vendido ? "disabled" : ""}
          data-row="${rowIndex}"
          onclick="abrirModal(${rowIndex})">
          ${vendido ? "Agotado" : "Comprar"}
        </button>
      </div>`;
  }).join("");
}

function actualizarEstadisticas(productos) {
  const unidadesDisponibles = productos.reduce((total, p) => total + getCantidadDisponible(p), 0);
  const agotados = productos.filter(p => getCantidadDisponible(p) <= 0).length;
  document.getElementById("stat-disponibles").textContent = `${unidadesDisponibles} unidades disponibles`;
  document.getElementById("stat-vendidos").textContent = `${agotados} agotados`;
}

function renderizarProductosDesdeCache() {
  try {
    const raw = localStorage.getItem(PRODUCTOS_CACHE_KEY);
    if (!raw) return false;

    const cache = JSON.parse(raw);
    if (!cache || !Array.isArray(cache.productos)) return false;
    if (Date.now() - Number(cache.ts || 0) > PRODUCTOS_CACHE_TTL_MS) return false;

    const productos = cache.productos.map(normalizarProducto);
    productosMap = {};
    productos.forEach(p => { productosMap[p.rowIndex] = p; });
    renderizarProductos(productos);
    actualizarEstadisticas(productos);
    return true;
  } catch (err) {
    localStorage.removeItem(PRODUCTOS_CACHE_KEY);
    return false;
  }
}

function guardarProductosEnCache(productos) {
  try {
    localStorage.setItem(PRODUCTOS_CACHE_KEY, JSON.stringify({
      ts: Date.now(),
      productos
    }));
  } catch (err) {
    localStorage.removeItem(PRODUCTOS_CACHE_KEY);
  }
}

function actualizarBotonRefresh(cargando) {
  const btn = document.querySelector(".btn-refresh");
  if (!btn) return;

  btn.disabled = cargando;
  btn.textContent = cargando ? "Actualizando..." : "🔄 Actualizar";
}

function formatearPrecio(precio) {
  if (precio === null || precio === undefined || precio === "") return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(precio);
}

function escHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(str) {
  return escHtml(str).replace(/`/g, "&#96;");
}

function abrirModal(rowIndex) {
  const producto = productosMap[rowIndex];
  const cantidadDisponible = getCantidadDisponible(producto);
  if (!producto || producto.estado === "Vendido" || cantidadDisponible <= 0) return;

  window._productoSeleccionado = producto;

  document.getElementById("modal-producto-info").innerHTML = `
    <strong>${escHtml(producto.nombre)}</strong>
    <span>${formatearPrecio(producto.precio)} c/u</span>
    <small>${cantidadDisponible} unidades disponibles</small>
    ${producto.descripcion ? `<small>${escHtml(producto.descripcion)}</small>` : ""}`;

  document.getElementById("inp-nombre").value = "";
  document.getElementById("inp-cedula").value = "";
  const cantidadInput = document.getElementById("inp-cantidad");
  cantidadInput.value = "1";
  cantidadInput.max = String(cantidadDisponible);
  actualizarTotalModal();
  limpiarMensajeModal();
  document.getElementById("btn-confirmar").disabled = false;
  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("inp-nombre").focus();
}

function cerrarModal(event) {
  if (event && event.target.id !== "modal-overlay") return;
  _cerrarModal();
}

function _cerrarModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  window._productoSeleccionado = null;
}

function abrirLightbox(url) {
  if (!url) return;
  const overlay = document.getElementById("lightbox-overlay");
  const img = document.getElementById("lightbox-img");
  img.src = url;
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden"; // Evitar scroll al ver imagen
}

function cerrarLightbox(event) {
  if (event && event.target.id !== "lightbox-overlay") return;
  _cerrarLightbox();
}

function _cerrarLightbox() {
  document.getElementById("lightbox-overlay").classList.add("hidden");
  document.getElementById("lightbox-img").src = "";
  document.body.style.overflow = "";
}

async function confirmarCompra() {
  const producto = window._productoSeleccionado;
  if (!producto) {
    _cerrarModal();
    return;
  }

  const nombre = document.getElementById("inp-nombre").value.trim();
  const cedula = document.getElementById("inp-cedula").value.trim();
  const cantidad = Number(document.getElementById("inp-cantidad").value);
  const btn = document.getElementById("btn-confirmar");
  const cantidadDisponible = getCantidadDisponible(producto);

  if (!nombre) {
    setMensajeModal("El nombre es obligatorio.", "err");
    return;
  }
  if (!cedula) {
    setMensajeModal("La cedula es obligatoria.", "err");
    return;
  }
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    setMensajeModal("La cantidad no es valida.", "err");
    return;
  }
  if (cantidad > cantidadDisponible) {
    setMensajeModal(`Solo quedan ${cantidadDisponible} unidades.`, "err");
    return;
  }

  btn.disabled = true;
  setMensajeModal("Procesando...", "");

  try {
    const data = await apiPostConReintentos({
      accion: "compra",
      id: producto.id,
      rowIndex: producto.rowIndex,
      nombre,
      cedula,
      cantidad
    });

    if (data.ok) {
      setMensajeModal(data.mensaje || "Compra registrada.", "ok");
      localStorage.removeItem(PRODUCTOS_CACHE_KEY);
      setTimeout(() => {
        _cerrarModal();
        cargarProductos();
      }, 2000);
    } else {
      setMensajeModal(data.mensaje || "No fue posible registrar la compra.", "err");
      btn.disabled = false;
      cargarProductos();
    }
  } catch (err) {
    setMensajeModal(`Error de conexion: ${err.message}`, "err");
    btn.disabled = false;
  }
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    _cerrarModal();
    _cerrarLightbox();
  }
});

async function apiGet() {
  const separator = API_URL.includes("?") ? "&" : "?";
  return requestJson(`${API_URL}${separator}_=${Date.now()}`, {
    method: "GET",
    cache: "no-store"
  });
}

async function apiPost(payload) {
  return requestJson(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });
}

async function apiPostConReintentos(payload) {
  let ultimoError = null;

  for (let intento = 1; intento <= COMPRA_MAX_REINTENTOS; intento++) {
    try {
      if (intento > 1) {
        setMensajeModal(`El sistema esta ocupado. Reintentando ${intento}/${COMPRA_MAX_REINTENTOS}...`, "");
      }

      const data = await apiPost(payload);
      const mensaje = String(data.mensaje || data.error || "");

      if (!data.ok && esErrorTransitorio(mensaje) && intento < COMPRA_MAX_REINTENTOS) {
        ultimoError = new Error(mensaje);
        await esperar(backoffMs(intento));
        continue;
      }

      return data;
    } catch (err) {
      ultimoError = err;
      if (!esErrorTransitorio(err.message) || intento === COMPRA_MAX_REINTENTOS) {
        throw err;
      }
      await esperar(backoffMs(intento));
    }
  }

  throw ultimoError || new Error("No fue posible conectar con el servidor.");
}

async function requestJson(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Tiempo de espera agotado");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function esErrorTransitorio(mensaje) {
  return /tiempo|timeout|429|503|ocupado|simult|too many|exceeded|agotado/i.test(String(mensaje || ""));
}

function backoffMs(intento) {
  return 900 + Math.floor(Math.random() * 1600) + intento * 1200;
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizarProducto(p) {
  return {
    id: String(p.id || "").trim(),
    imagenUrl: String(p.imagenUrl || "").trim(),
    nombre: String(p.nombre || "Sin nombre").trim(),
    descripcion: String(p.descripcion || "").trim(),
    precio: p.precio,
    estado: String(p.estado || "Disponible").trim(),
    cantidadDisponible: normalizarCantidad(p.cantidadDisponible, p.estado),
    cantidadInicial: normalizarCantidadInicial(p.cantidadInicial, p.cantidadDisponible, p.estado),
    rowIndex: Number(p.rowIndex)
  };
}

function normalizarCantidad(cantidad, estado) {
  const value = Number(cantidad);
  if (Number.isFinite(value)) return Math.max(0, Math.floor(value));
  return String(estado || "") === "Vendido" ? 0 : 1;
}

function normalizarCantidadInicial(cantidadInicial, cantidadDisponible, estado) {
  const value = Number(cantidadInicial);
  if (Number.isFinite(value) && value > 0) return Math.floor(value);
  return Math.max(1, normalizarCantidad(cantidadDisponible, estado));
}

function getCantidadDisponible(producto) {
  if (!producto) return 0;
  return normalizarCantidad(producto.cantidadDisponible, producto.estado);
}

function actualizarTotalModal() {
  const producto = window._productoSeleccionado;
  const totalEl = document.getElementById("modal-total");
  if (!producto || !totalEl) return;

  const cantidad = Math.max(1, Math.floor(Number(document.getElementById("inp-cantidad").value) || 1));
  totalEl.textContent = `Total: ${formatearPrecio((Number(producto.precio) || 0) * cantidad)}`;
}

function mostrarCarga(texto) {
  const catalogo = document.getElementById("catalogo");
  catalogo.innerHTML = `<div class="loading"><p></p></div>`;
  catalogo.querySelector("p").textContent = texto;
}

function setMensajeModal(texto, tipo) {
  const msg = document.getElementById("modal-mensaje");
  msg.textContent = texto;
  msg.className = tipo === "ok" ? "msg-ok" : tipo === "err" ? "msg-err" : "";
}

function limpiarMensajeModal() {
  const msg = document.getElementById("modal-mensaje");
  msg.textContent = "";
  msg.className = "";
}

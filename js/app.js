/**
 * app.js — Catálogo Rápido (Frontend)
 * Configura API_URL con la URL de tu Web App de Google Apps Script
 */

// ── CONFIGURACIÓN ─────────────────────────────────────────
const API_URL = "https://script.google.com/macros/s/AKfycbznNuW0BXjgS5kpPohdCtzncAIi_uUZxeIDW3yxEuSz3DAwC56yp53DCJeHSlEMLyB1Gg/exec";

// ── Estado global ──────────────────────────────────────────
let productosMap = {}; // Mapa id → producto para evitar pasar JSON como atributo HTML

// ── Inicializar ────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", cargarProductos);

// ── Cargar productos ────────────────────────────────────────
async function cargarProductos() {
  const catalogo = document.getElementById("catalogo");
  catalogo.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Cargando productos...</p>
    </div>`;

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    if (!data.ok) throw new Error(data.mensaje || data.error || "Error desconocido");

    productosMap = {};
    data.productos.forEach(p => { productosMap[p.rowIndex] = p; });

    renderizarProductos(data.productos);
    actualizarEstadisticas(data.productos);

  } catch (err) {
    catalogo.innerHTML = `
      <div class="loading">
        <p>⚠️ Error al cargar productos.<br>
        <small style="color:#666">${err.message}</small></p>
      </div>`;
  }
}

// ── Renderizar tarjetas ────────────────────────────────────
function renderizarProductos(productos) {
  const catalogo = document.getElementById("catalogo");

  if (!productos.length) {
    catalogo.innerHTML = `<div class="loading"><p>No hay productos publicados aún.</p></div>`;
    return;
  }

  catalogo.innerHTML = productos.map(p => {
    const vendido = p.estado === "Vendido";
    const badgeCls = vendido ? "badge-vendido" : "badge-disponible";
    const badgeTxt = vendido ? "Vendido" : "Disponible";
    const imgHtml = p.imagenUrl
      ? `<img src="${p.imagenUrl}" alt="${escHtml(p.nombre)}" loading="lazy"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : "";
    const placeholder = `<span class="img-placeholder" style="display:${p.imagenUrl ? 'none' : 'flex'}">🛍️</span>`;

    return `
      <div class="card ${vendido ? "vendido" : ""}">
        <div class="card-img-wrap">
          ${imgHtml}${placeholder}
        </div>
        <span class="badge ${badgeCls}">${badgeTxt}</span>
        <div class="card-body">
          <h3>${escHtml(p.nombre)}</h3>
          <p class="card-desc">${escHtml(p.descripcion) || "—"}</p>
          <p class="card-precio">${formatearPrecio(p.precio)}</p>
        </div>
        <button
          class="btn-comprar"
          ${vendido ? "disabled" : ""}
          data-row="${p.rowIndex}"
          onclick="abrirModal(${p.rowIndex})">
          ${vendido ? "🚫 Vendido" : "⚡ ¡Comprar ya!"}
        </button>
      </div>`;
  }).join("");
}

// ── Estadísticas ───────────────────────────────────────────
function actualizarEstadisticas(productos) {
  const disponibles = productos.filter(p => p.estado !== "Vendido").length;
  const vendidos = productos.length - disponibles;
  document.getElementById("stat-disponibles").textContent = `${disponibles} disponibles`;
  document.getElementById("stat-vendidos").textContent = `${vendidos} vendidos`;
}

// ── Formato precio ─────────────────────────────────────────
function formatearPrecio(precio) {
  if (precio === null || precio === undefined || precio === "") return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0
  }).format(precio);
}

// ── Escapar HTML para prevenir XSS ────────────────────────
function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Modal ──────────────────────────────────────────────────
function abrirModal(rowIndex) {
  const producto = productosMap[rowIndex];
  if (!producto || producto.estado === "Vendido") return;

  window._productoSeleccionado = producto;

  document.getElementById("modal-producto-info").innerHTML = `
    <strong>${escHtml(producto.nombre)}</strong>
    <span>${formatearPrecio(producto.precio)}</span>
    ${producto.descripcion ? `<small>${escHtml(producto.descripcion)}</small>` : ""}`;

  document.getElementById("inp-nombre").value = "";
  document.getElementById("inp-cedula").value = "";
  document.getElementById("modal-mensaje").innerHTML = "";
  document.getElementById("btn-confirmar").disabled = false;
  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("inp-nombre").focus();
}

function cerrarModal(event) {
  // Solo cerrar si se hizo clic en el overlay (fondo), no dentro del modal
  if (event && event.target.id !== "modal-overlay") return;
  _cerrarModal();
}

function _cerrarModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  window._productoSeleccionado = null;
}

// ── Confirmar compra ───────────────────────────────────────
async function confirmarCompra() {
  const producto = window._productoSeleccionado;
  if (!producto) { _cerrarModal(); return; }

  const nombre = document.getElementById("inp-nombre").value.trim();
  const cedula = document.getElementById("inp-cedula").value.trim();
  const msg = document.getElementById("modal-mensaje");
  const btn = document.getElementById("btn-confirmar");

  if (!nombre) {
    msg.innerHTML = `<span class="msg-err">El nombre es obligatorio.</span>`; return;
  }
  if (!cedula) {
    msg.innerHTML = `<span class="msg-err">La cédula es obligatoria.</span>`; return;
  }

  btn.disabled = true;
  msg.innerHTML = `<span style="color:#8888aa">⏳ Procesando...</span>`;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        accion: "compra",
        rowIndex: producto.rowIndex,
        nombre,
        cedula
      })
    });

    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    if (data.ok) {
      msg.innerHTML = `<span class="msg-ok">${data.mensaje}</span>`;
      setTimeout(() => {
        _cerrarModal();
        cargarProductos();
      }, 2000);
    } else {
      msg.innerHTML = `<span class="msg-err">${data.mensaje}</span>`;
      btn.disabled = false;
    }

  } catch (err) {
    msg.innerHTML = `<span class="msg-err">Error de conexión: ${err.message}</span>`;
    btn.disabled = false;
  }
}

// ── Cerrar modal con ESC ───────────────────────────────────
document.addEventListener("keydown", e => {
  if (e.key === "Escape") _cerrarModal();
});

# 🏪 Catálogo de Compras Rápido

Sistema de catálogo "el más rápido gana" construido con Google Sheets como base de datos, Google Apps Script como API y una página web estática como frontend.

## Arquitectura

```
┌──────────────────┐     fetch/POST      ┌──────────────────────┐
│  Frontend (Git)  │ ─────────────────►  │  Google Apps Script  │
│  index.html      │                     │  (Web App / API)     │
│  style.css       │ ◄─────────────────  │  Lee/escribe en      │
│  app.js          │     JSON response   │  Google Sheets       │
└──────────────────┘                     └──────────────────────┘
```

## Estructura de carpetas

```
m,mmm/
├── backend/
│   └── Codigo.gs           ← Pegar en Google Apps Script
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── README.md
```

---

## ⚙️ Instalación paso a paso

### PASO 1 — Configurar el Backend (Google Apps Script)

1. Abre tu **Google Sheets** → `Extensiones` → `Apps Script`
2. Borra el código existente y pega el contenido de `backend/Codigo.gs`
3. Guarda con `Ctrl+S` y ponle un nombre al proyecto (ej. "Tienda Rápida API")
4. Recarga la hoja de cálculo
5. Ve al menú **🏪 Mi Tienda → Inicializar Hoja** (esto crea encabezados y formatos automáticamente)
6. Agrega tus productos directamente en la hoja (columnas: ID, Imagen URL, Nombre, Descripción, Precio, Estado)

### PASO 2 — Desplegar como Web App

1. En Apps Script, clic en **Implementar → Nueva implementación**
2. Tipo: **App web**
3. Configurar:
   - Ejecutar como: `Yo (mi cuenta)`
   - ¿Quién tiene acceso?: `Cualquier persona`
4. Clic en **Implementar** → **Autorizar acceso**
5. Copia la **URL del Web App** que aparece (la necesitas en el siguiente paso)
6. Vuelve a la hoja → **🏪 Mi Tienda → Ver URL del API** para verificarla

### PASO 3 — Conectar el Frontend

1. Abre `frontend/app.js`
2. Reemplaza en la primera línea de configuración:
   ```js
   // Antes:
   const API_URL = "PEGA_AQUI_LA_URL_DEL_WEB_APP";
   // Después:
   const API_URL = "https://script.google.com/macros/s/TU_ID_AQUI/exec";
   ```

### PASO 4 — Subir a GitHub Pages

1. Sube la carpeta `frontend/` a tu repositorio de GitHub
2. Ve a tu repo → `Settings` → `Pages`
3. Selecciona la rama `main` y la carpeta `/` (o `/frontend` si la subiste como subcarpeta)
4. GitHub Pages te dará una URL pública para compartir

---

## Columnas de la hoja "Productos"

| Columna | Campo | Ejemplo |
|---|---|---|
| A | ID | 001 |
| B | Imagen URL | https://... |
| C | Nombre | Tablet XYZ |
| D | Descripción | Pantalla 10" |
| E | Precio | 200000 |
| F | Estado | Disponible |
| G | Comprador | (auto) |
| H | Cédula | (auto) |
| I | Fecha/Hora | (auto) |

---

## Funciones del sistema

- ✅ LockService para prevenir compras duplicadas simultáneas
- ✅ Formato condicional verde/rojo automático  
- ✅ Estadísticas de disponibles/vendidos en tiempo real
- ✅ Imágenes con URL directas
- ✅ Modal de compra con validación
- ✅ Auto-refresco del catálogo tras cada compra

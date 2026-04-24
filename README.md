# Venta de garaje Ovopacific

Frontend estatico para GitHub Pages con backend en Google Apps Script y Google Sheets.

## Estructura

```text
.
├── backend/
│   └── Codigo.gs        # Codigo que se pega en Google Apps Script
├── css/
├── js/
│   ├── app.js
│   └── config.js        # URL del Web App de Apps Script
├── admin.html
├── index.html
└── AUDITORIA.md
```

## Instalacion del backend

1. Abre la hoja de calculo en Google Sheets.
2. Ve a `Extensiones > Apps Script`.
3. Pega el contenido de `backend/Codigo.gs`.
4. Ejecuta `inicializarHoja()`.
5. Configura la clave del admin con el menu `Venta de garaje > Configurar clave admin`, o crea una propiedad del script llamada `ADMIN_PASSWORD`.
6. Implementa como `App web`:
   - Ejecutar como: `Yo`.
   - Acceso: `Cualquier persona`.
7. Copia la URL del Web App y ponla en `js/config.js`.

Si el Apps Script no esta ligado directamente a la hoja, crea una propiedad del script `SPREADSHEET_ID` con el ID del Google Sheet.

## Flujo

- `index.html` muestra el catalogo publico.
- `admin.html` exige clave y permite publicar productos, subir imagenes a Drive y resetear ventas.
- Las compras usan `LockService` en Apps Script para que solo una solicitud pueda vender un producto a la vez.
- Cada producto puede tener varias unidades. Una compra descuenta solo la cantidad pedida y el producto sigue disponible hasta que su stock llegue a 0.
- La respuesta publica del backend no incluye comprador ni cedula; esos datos solo viajan por la accion admin `listarAdmin`.

## Revision de capacidad

Lee `AUDITORIA.md` para el diagnostico sobre 70 usuarios simultaneos, limites de GitHub Pages, Apps Script y recomendaciones operativas.

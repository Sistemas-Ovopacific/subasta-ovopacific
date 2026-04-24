# Auditoria de capacidad y riesgos

Fecha de revision: 2026-04-24.

## Veredicto para 70 usuarios simultaneos

- GitHub Pages puede servir una vista estatica a 70 visitantes sin problema tecnico esperado si los archivos son livianos. El riesgo no es de capacidad, sino de politica: GitHub indica que Pages no esta pensado ni permitido para sitios principalmente orientados a facilitar transacciones comerciales, y no debe usarse para transacciones sensibles.
- Google Apps Script + Google Sheets puede funcionar para una venta interna o de baja escala con 70 personas mirando el catalogo y algunos intentando comprar.
- No lo consideraria garantizado para un evento tipo "todos hacen clic al mismo segundo". Apps Script publica limites de 30 ejecuciones simultaneas por usuario y 1.000 por script. Como el Web App normalmente se despliega "ejecutar como yo", un pico fuerte puede topar el limite por usuario antes de llegar a 70 solicitudes activas.
- Google Sheets no es una base de datos transaccional. `LockService` evita doble venta, pero serializa la parte critica: muchos compradores concurrentes pueden esperar, fallar por timeout o recibir "ya vendido".

## Cambios aplicados

- Se centralizo la configuracion del API en `js/config.js`.
- Se agregaron timeouts y `cache: "no-store"` en llamadas del frontend.
- Se corrigio insercion de mensajes no confiables como HTML.
- Se escapan atributos como URLs de imagen y textos visibles.
- El frontend ahora envia tambien `id` del producto, no solo `rowIndex`.
- Se agrego `backend/Codigo.gs` versionable con:
  - `LockService` para compras, publicaciones y reset.
  - Cache publica corta de 5 segundos para reducir lecturas a Sheets.
  - Invalidacion de cache al vender, publicar o resetear.
  - Listado publico sin comprador ni cedula.
  - Listado privado para admin con clave.
  - Validacion basica de imagen y subida a Drive.

## Riesgos pendientes

- Hay que redeplegar Apps Script para que el backend nuevo entre en produccion.
- La clave admin viaja desde una pagina estatica hacia Apps Script; usa HTTPS y una clave fuerte, pero no es equivalente a un sistema con sesiones reales, MFA y roles.
- Google Drive como hosting de imagenes puede tener limites y latencias propias.
- Para una venta publica grande, con pagos o datos personales sensibles, conviene migrar a Firebase/Firestore, Supabase o un backend propio con base de datos transaccional.

## Fuentes oficiales consultadas

- Google Apps Script quotas: https://developers.google.com/apps-script/guides/services/quotas
- Google Apps Script LockService: https://developers.google.com/apps-script/reference/lock
- GitHub Pages limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

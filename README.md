# ByN Fragancias: tienda conectada a Google Sheets

Tienda web de perfumes. El stock, los precios y las fotos se cargan en un **Google Sheet**: cuando el cliente cambia una celda, la web se actualiza sola (la página vuelve a leer la hoja cada 60 segundos).

Los pedidos llegan por **WhatsApp** con el detalle armado. Si se conecta el Apps Script, además quedan registrados en la hoja `Pedidos`.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `styles.css`, `app.js` | La tienda (sitio estático, se puede subir a GitHub Pages, Netlify o Vercel) |
| `config.js` | Nombre, WhatsApp y URL de la hoja: **lo único que hay que editar** |
| `demo-data.js` | Productos de ejemplo que se muestran mientras la hoja no está conectada |
| `apps-script/Code.gs` | Backend en Google Apps Script: devuelve el catálogo y registra pedidos |
| `plantilla/Productos.csv` | Plantilla para importar en Google Sheets |
| `assets/logo.png` | Logo (poner acá la foto de perfil de Instagram). Mientras no exista se usa `assets/logo.svg` |

## Columnas de la hoja `Productos`

`SKU | Marca | Nombre | Genero | Precio | Decant | Stock | Foto | Descripcion | Visible`

- **Precio / Decant**: números sin signo `$` (si `Decant` está vacío o en 0, ese perfume no ofrece decant).
- **Stock**: si llega a 0 aparece "Sin stock". Con 3 o menos aparece "Últimas unidades".
- **Foto**: URL de la imagen. Sirve un link de Google Drive compartido como "Cualquier persona con el enlace".
- **Visible**: poner `NO` para ocultar un producto sin borrarlo.
- **Genero**: Hombre / Mujer / Unisex (genera los filtros automáticamente).

## Puesta en marcha

### Opción A: con Apps Script (recomendada)
1. Crear un Google Sheet e importar `plantilla/Productos.csv` en una hoja llamada `Productos`.
2. `Extensiones > Apps Script`, pegar `apps-script/Code.gs` y guardar.
3. Recargar la hoja y usar el menú `Tienda > Crear hojas iniciales` (crea `Pedidos`).
4. `Implementar > Nueva implementación > Aplicación web`, con "Ejecutar como: Yo" y "Acceso: Cualquier usuario". Copiar la URL `/exec`.
5. Pegar esa URL en `config.js` → `appsScriptUrl`, y cargar el número en `whatsapp`.

Así funciona el día a día:
- Los cambios de stock y precio se ven en la web de inmediato.
- Cada pedido entra en `Pedidos` como **PENDIENTE**. El precio se toma de la hoja, no del navegador.
- Para confirmar un pedido, se selecciona su fila y se usa `Tienda > Confirmar pedido`, que **descuenta el stock solo**.

### Opción B: solo lectura (más simple)
1. En el Sheet: `Archivo > Compartir > Publicar en la web`, elegir la hoja `Productos` y el formato **CSV**.
2. Pegar el link en `config.js` → `csvUrl`.

Con esta opción Google puede demorar unos minutos en reflejar los cambios y los pedidos llegan solo por WhatsApp.

## Probar en local

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto: GoalStore

Tienda de camisetas de fútbol. **Un único archivo** `index.html` de ~1.900 líneas con CSS + JS embebidos. Sin frameworks, sin build, sin dependencias npm.

## Servidor de desarrollo

```bash
npx serve -l 3000 KitZone
# Abre http://localhost:3000
```

Configurado en `C:\Users\tonim\.claude\launch.json` como configuración `goalstore`. Usar `preview_start` con nombre `goalstore` para arrancar desde Claude Code.

## Arquitectura del archivo index.html

El archivo sigue este orden estricto:

```
<style>          → Todo el CSS (~760 líneas)
</style>
<body>
  <!-- TOAST -->              notificaciones flotantes
  <!-- OVERLAY CARRITO -->    fondo oscuro
  <!-- PANEL CARRITO -->      sidebar deslizante derecha
  <!-- PASARELA DE PAGO -->   modal checkout 3 pasos
  <!-- MODAL PRODUCTO -->     modal galería + selector talla/versión
  <!-- HEADER -->             nav sticky
  <!-- HERO -->               sección principal
  <!-- STATS -->              banda +500/48h/100%/30d
  <!-- CATÁLOGO -->           grid de tarjetas (renderizado por JS)
  <!-- RESEÑAS -->            carrusel auto-scroll
  <!-- FOOTER -->
<script>         → Todo el JS (~720 líneas)
```

## Datos y constantes clave (JS)

```js
const PRECIO_JUGADOR = 29.99;
const PRECIO_FAN     = 24.99;
const PRECIO_RETRO   = 39.99;
const TALLAS = ['S','M','L','XL','XXL','2XL'];
const CDN = 'https://media.sellfy.store/images/lC8jT75D/';
```

### Estructura de producto
```js
{
  id: 1,
  nombre: 'FC Barcelona Edición Especial 25/26',
  liga: 'laliga',                        // laliga | premier | champions | selecciones | saudi | retro | otros
  categoria: ['laliga', 'champions'],    // array — permite aparecer en varios filtros
  imgs: [CDN+'folder/file.jpg', ...],    // 3-4 imágenes por producto
  tipo: 'regular',                       // 'regular' o 'retro'
  badge: 'nuevo',                        // 'nuevo' | 'retro' | null
  badgeTexto: 'Nuevo'
}
```

- **IDs 1–47**: Temporada 25/26 (La Liga, Premier, Champions, Selecciones, Saudi, Otros)
- **IDs 101–169**: Edición Retro

Los retros solo tienen versión única (sin selector Jugador/Fan) y `tipo: 'retro'`.

## Flujo de datos principal

```
CAMISETAS[]
  → renderCamisetas(filtro)   → #camisetasGrid  (tarjetas clicables)
  → abrirProductoConId(id)   → #prodModal       (galería + selector)
  → anadirAlCarrito(id, version, talla)
  → carrito[]                → renderCarritoItems() → #carritoPanel
  → abrirModal()             → #modalOverlay    (checkout 3 pasos)
```

## Carrito

Clave compuesta: `` `${id}||${version}||${talla}` `` — el mismo producto en distinta talla/versión genera ítems separados.

```js
// Objeto en carrito[]
{ key, id, nombre, img, tipo, version, talla, precio, cantidad }
// 'img' guarda prod.imgs[0] al añadir
```

## Galería de producto (modal)

Variables globales: `let galeria = []; let galeriaIdx = 0;`  
Funciones: `galeriaSetImg(idx)`, `galeriaNav(delta)`  
Al abrir modal: se asigna `galeria = prod.imgs`.

## Pasarela de pago (3 pasos)

- **Paso 1** (`#paso1`): Datos de envío — inputs `ck_nombre`, `ck_email`, `ck_telefono`, `ck_direccion`, `ck_ciudad`, `ck_cp`, `ck_pais`
- **Paso 2** (`#paso2`): Método de pago con 3 tabs:
  - `tarjeta` → tarjeta visual 3D animada (`#tarjetaFlip`), inputs `cardNum/cardName/cardExp/cardCvv`
  - `paypal` → SDK de PayPal (`client-id=sb` en el script tag al final del body — reemplazar por client-id real)
  - `bizum` → input `#bizumTel`
- **Paso 3**: Spinner (`#procesando`) 2,2s → pantalla confirmación (`#confirmacion`)

Navegación: `irPaso(n)`, `irPaso2()`, `selMetodo(m)`, `procesarPago()`, `finalizarPago()`, `cerrarTodo()`

## Reseñas

Array `RESEÑAS[]` con 16 objetos `{nombre, ciudad, avatar, estrellas, texto, producto, fecha}`.  
- `renderReseñas()` → duplica el array (×2) para bucle CSS infinito en `#reseñasScroll`  
- `reseñasParaModal(esRetro)` → devuelve 3 reseñas para inyectar en el modal de producto

## CSS — Variables y clases importantes

```css
--verde: #1a3a2a  --verde-medio: #2d5a3d  --verde-claro: #3d7a52
--dorado: #c9a84c  --dorado-claro: #e8c87a
--radio: 12px
--transicion: all 0.3s cubic-bezier(0.4,0,0.2,1)
```

Clases de estado: `.abierto` (modales/carrito), `.activo` (tabs, pasos, nav, miniaturas galería), `.visible` (procesando, confirmación, toast), `.girada` (flip tarjeta al enfocar CVV).

## Archivos auxiliares (no se sirven, solo desarrollo)

| Archivo | Uso |
|---|---|
| `sellfy_gallery.json` | 291 productos scrapeados de Sellfy con todas sus imágenes. Regenerar con `scrape_sellfy.py` |
| `imgs_mapping.json` | `{id: [ruta1, ruta2, ...]}` — mapeo producto GoalStore → imágenes CDN |
| `gen_camisetas.js` | Genera el bloque `const CAMISETAS = [...]` a partir de `imgs_mapping.json` → `new_camisetas.txt` |
| `scrape_sellfy.py` | Scraper de Sellfy: extrae imágenes de `window.GLOBALS` del HTML estático |

Para regenerar imágenes del catálogo: ejecutar `scrape_sellfy.py` → actualiza `sellfy_gallery.json` → ejecutar `gen_camisetas.js` → copiar contenido de `new_camisetas.txt` al bloque `const CAMISETAS` de `index.html`.

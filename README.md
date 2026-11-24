# Ventas de Feria · Lácteos Huella Pampa

Aplicación para anotar las ventas de **Lácteos Huella Pampa**, productor de quesos de Chivilcoy, en los puestos de los [Mercados Bonaerenses](https://mi.mda.gba.gob.ar/mercados/bonaerenses/v2/productor/1ecf3c9f-f629-661a-9f05-d15c5b752137), la feria de la Provincia de Buenos Aires.

Se usa desde el celular, en el puesto, muchas veces sin señal. Por eso es una **Progressive Web App (PWA) instalable que funciona sin conexión**: después de abrirla una vez con internet, se puede usar en modo avión.

> **Estado:** en desarrollo. Ya se pueden anotar ventas leyendo la foto del ticket de la balanza (o a mano), ver el resumen del día y exportar todo a CSV, sin conexión.

## Qué hace

- **Escanear ticket**: en el celular se abre la cámara con un recuadro para encuadrar la etiqueta de la balanza. También se puede elegir una foto de la galería (en la PC, solo esa opción).
- **Lectura sin conexión**: el OCR ([Tesseract.js](https://github.com/naptha/tesseract.js)) corre en el celular. Lee producto, peso, precio por kilo y total, y muestra todo para revisarlo antes de guardar.
- **Varias marcas**: en el puesto venden Huella Pampa, Oliverio, Mamá Mecha y Milkey, cada una con su balanza y su formato de ticket. Cada venta se anota con su marca.
- **Lista de ventas** agrupada por día, con el total del día y por marca. Se pueden editar, y borrar con opción de deshacer.
- **Exportar** las ventas a CSV (para Excel o Google Sheets), compartiéndolas o descargándolas.

## Tecnologías

- [Astro](https://astro.build) 7
- [`@vite-pwa/astro`](https://vite-pwa-org.netlify.app/frameworks/astro) (Workbox) para el service worker y el manifest
- [Bun](https://bun.sh) como gestor de paquetes
- Node.js 22.23.4 o superior

## Cómo levantar el proyecto

```sh
bun install
bun run dev
```

El servidor de desarrollo queda en `http://localhost:4321`.

### Comandos

| Comando           | Qué hace                                                    |
| :---------------- | :---------------------------------------------------------- |
| `bun install`     | Instala las dependencias                                    |
| `bun run dev`     | Levanta el servidor de desarrollo en `localhost:4321`       |
| `bun run build`   | Genera el sitio de producción en `./dist/`                  |
| `bun run preview` | Sirve el build localmente para probarlo antes de publicarlo |
| `bun run test`    | Corre los tests (`bun test`)                                |
| `bun run check`   | Chequea los tipos con `astro check`                         |
| `bun astro ...`   | Ejecuta comandos de la CLI de Astro                         |

> Usá `bun run build` y no `bun build`: este último es el bundler de Bun, no el script del proyecto.

## Probar el modo sin conexión

El service worker **no funciona en modo dev**, así que el soporte offline se prueba siempre sobre el build:

1. `bun run build && bun run preview`
2. Abrir la app en el navegador y esperar a que termine de cargar.
3. En las DevTools, pestaña *Network* (o *Application → Service workers*), activar **Offline**.
4. Recargar y navegar por la app: todo tiene que seguir funcionando. Las rutas que no estén en caché muestran la página de respaldo (`/404`).

## Lectura de tickets

Los tickets cambian según la balanza de cada marca: el orden, las palabras, los decimales; algunos traen código de barras y otros no. Por eso el lector **no depende del diseño del ticket ni del código de barras**, sino de lo que tiene cualquier ticket de venta por peso:

1. **Palabras clave**: PESO, NETO, PRECIO, $/KG, TOTAL, IMPORTE, A PAGAR, etc. Se buscan de forma aproximada, porque el OCR se equivoca en alguna letra. Se ignoran los renglones de TARA, fecha, hora, lote y los códigos largos.
2. **La cuenta**: peso × precio por kilo = total. Entre todos los números leídos se busca el trío que la cumple. Si cierra, la lectura queda *verificada*. Si solo se leyeron dos, se calcula el tercero y se avisa para revisarlo.
3. **Lo ya cargado**: los productos que se guardan quedan como conocidos (nombre, marca y precio). En el próximo ticket ayudan a reconocer el nombre aunque esté mal leído, o a deducirlo por el precio.

Antes del OCR, la foto se prepara (`src/lib/tickets/imagen.ts`). Se busca la etiqueta (la zona blanca y sin color), se recorta, se blanquea el fondo y se pasa a blanco y negro con un umbral adaptativo. Después se prueban las cuatro orientaciones y se hacen varias pasadas del OCR hasta que la cuenta cierre.

Tesseract.js, su núcleo en WebAssembly y el modelo de español (unos 15 MB en total) se copian a `public/ocr/` en cada build (`integraciones/ocr-offline.mjs`) y el service worker los precachea. No se baja nada de un CDN.

Las fotos de `fotos_prueba/` son tickets reales con los valores que se tienen que leer. Los tests (`tests/parser.test.ts`) usan las lecturas del OCR de esas fotos. Para sumar marcas o balanzas nuevas, conviene agregar fotos ahí.

## Estructura

```text
/
├── public/
│   ├── img/
│   │   ├── huella-pampa.jpg        # logo de Huella Pampa
│   │   ├── mama-mecha.jpg          # logo de Mamá Mecha
│   │   ├── mb-logo-blanco.webp     # logo de Mercados Bonaerenses (blanco)
│   │   ├── milkey.png              # logo de Milkey
│   │   └── oliverio.jpg            # logo de Oliverio Quesos Artesanales
│   ├── favicon.ico
│   ├── apple-touch-icon-180x180.png
│   ├── pwa-192x192.png
│   ├── pwa-512x512.png
│   └── maskable-icon-512x512.png
├── fotos_prueba/                   # fotos reales de tickets para probar la lectura
├── integraciones/
│   └── ocr-offline.mjs             # copia Tesseract.js a public/ocr/ para usarlo sin conexión
├── tests/                          # tests del lector de tickets (bun test)
├── src/
│   ├── components/
│   │   ├── Camara.astro            # cámara con recuadro para encuadrar el ticket
│   │   ├── Revision.astro          # hoja para revisar y guardar una venta
│   │   └── Splash.astro            # pantalla de carga con los logos
│   ├── layouts/
│   │   └── Layout.astro            # <head>, manifest, fuente y registro del SW
│   ├── pages/
│   │   ├── index.astro             # inicio
│   │   └── 404.astro               # página de respaldo offline
│   ├── lib/
│   │   ├── tickets/                # lectura de tickets: imagen, OCR y parser
│   │   ├── ventas/                 # IndexedDB y exportación a CSV
│   │   ├── ui/                     # cámara, hoja de revisión y lista
│   │   ├── formato.ts              # números y fechas en formato argentino
│   │   └── marcas.ts               # marcas que se venden en el puesto
│   ├── styles/
│   │   └── global.css              # variables de color y estilos base
│   └── pwa.ts                      # registra el service worker
├── astro.config.mjs                # fuentes y configuración de la PWA
└── AGENTS.md                       # reglas para agentes de IA
```

## PWA y modo offline

- El service worker se genera con Workbox y **precachea todo el build** (HTML, JS, CSS, imágenes, íconos y fuentes).
- Se actualiza solo (`registerType: 'autoUpdate'`): cuando hay una versión nueva, se activa y la página se recarga.
- Si se navega a una ruta que no está en caché, se muestra `/404` como respaldo.
- No se carga nada desde CDNs ni dominios de terceros: la fuente Encode Sans se descarga en el build con la API de fuentes de Astro y se sirve desde el propio sitio.
- Las ventas y los productos conocidos se guardan en el dispositivo con IndexedDB, y se pide almacenamiento persistente para que el navegador no los borre si le falta espacio.
- El OCR (`public/ocr/`, unos 15 MB) también se precachea: después de abrir la app una vez con internet, la lectura de tickets funciona en modo avión.

Cuando se agrega un recurso nuevo, hay que verificar que quede cubierto por la caché (ver `globPatterns` en `astro.config.mjs`).

## Identidad visual

- **Colores** de Mercados Bonaerenses: rosa `#e81f76` y celeste `#00AEC3`, normalmente en degradé. Están definidos como variables en `src/styles/global.css`.
- **Tipografía**: Encode Sans, la misma que usa Mercados Bonaerenses.
- **Logos**: el de Huella Pampa salió de su Instagram y solo está en 150×150 px, y el de Mamá Mecha se recortó de un cartel de su web (92×92 px); hay que reemplazarlos cuando haya versiones en alta resolución.
- **Íconos de la app**: la bolsa de Mercados Bonaerenses sobre el degradé.

## Cómo contribuir

Las reglas completas están en [`AGENTS.md`](AGENTS.md). En resumen:

- Los commits siguen [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) con la descripción en español y en modo imperativo, por ejemplo `feat(ventas): agrega el formulario de carga`.
- Todo cambio tiene que seguir funcionando sin conexión y se prueba con `build` + `preview` en modo offline antes de darlo por terminado.

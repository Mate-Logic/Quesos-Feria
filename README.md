# Ventas de Feria · Lácteos Huella Pampa

Aplicación para anotar las ventas de **Lácteos Huella Pampa**, productor de quesos de Chivilcoy, en los puestos de los [Mercados Bonaerenses](https://mi.mda.gba.gob.ar/mercados/bonaerenses/v2/productor/1ecf3c9f-f629-661a-9f05-d15c5b752137), la feria de la Provincia de Buenos Aires.

Se usa desde el celular, en el puesto, muchas veces sin señal. Por eso es una **Progressive Web App (PWA) instalable que funciona sin conexión**: después de abrirla una vez con internet, se puede usar en modo avión.

> **Estado:** en desarrollo. Ya están la base de la PWA, la pantalla de carga y la página de inicio. El registro de ventas todavía no está implementado.

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
| `bun astro ...`   | Ejecuta comandos de la CLI de Astro (`astro check`, etc.)   |

> Usá `bun run build` y no `bun build`: este último es el bundler de Bun, no el script del proyecto.

## Probar el modo sin conexión

El service worker **no funciona en modo dev**, así que el soporte offline se prueba siempre sobre el build:

1. `bun run build && bun run preview`
2. Abrir la app en el navegador y esperar a que termine de cargar.
3. En las DevTools, pestaña *Network* (o *Application → Service workers*), activar **Offline**.
4. Recargar y navegar por la app: todo tiene que seguir funcionando. Las rutas que no estén en caché muestran la página de respaldo (`/404`).

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
├── src/
│   ├── components/
│   │   └── Splash.astro            # pantalla de carga con los logos
│   ├── layouts/
│   │   └── Layout.astro            # <head>, manifest, fuente y registro del SW
│   ├── pages/
│   │   ├── index.astro             # inicio
│   │   └── 404.astro               # página de respaldo offline
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
- Los datos que se generen (ventas, etc.) se van a guardar en el dispositivo.

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

## Sobre el proyecto

Aplicación para anotar las ventas de **Lácteos Huella Pampa** (productor de quesos de Chivilcoy) en los puestos de los [Mercados Bonaerenses](https://mi.mda.gba.gob.ar/mercados/bonaerenses/v2/productor/1ecf3c9f-f629-661a-9f05-d15c5b752137), la feria de la Provincia de Buenos Aires. Se usa desde el celular, en el puesto, muchas veces sin señal (ver regla 3).

Identidad visual:

- Colores de Mercados Bonaerenses: rosa `#e81f76` y celeste `#00AEC3`, normalmente en degradé. Están definidos como variables en `src/styles/global.css`.
- Tipografía: Encode Sans, la misma de Mercados Bonaerenses. Se sirve desde el propio sitio con la API de fuentes de Astro.
- Logos en `public/img/`: `mb-logo-blanco.webp` (Mercados Bonaerenses, en blanco para usar sobre el degradé) y `huella-pampa.jpg` (logo del productor, sacado de su Instagram; solo está en 150×150 px, así que hay que reemplazarlo cuando haya una versión en alta resolución) `oliverio.jpg` (Oliverio Quesos Artesanales, 320×320 px, achicado del original de 1034×1034), `mama-mecha.jpg` (Mamá Mecha, recortado del cartel de su web: el original es de 92×92 px, así que conviene reemplazarlo si consiguen uno mejor) y `milkey.png` (Milkey, sacado de milkey.com.ar).
- La pantalla de carga e inicio (`src/components/Splash.astro`) muestra los logos de los cuatro productores (Huella Pampa, Oliverio, Mamá Mecha y Milkey) en una grilla de 2×2 y el de Mercados Bonaerenses abajo.
- Los íconos de la PWA (`public/pwa-*.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico`) usan la bolsa de Mercados Bonaerenses sobre el degradé.

## Reglas para agentes

Estas reglas son obligatorias para cualquier agente (Claude Code, Codex, Copilot, Cursor, etc.) que trabaje en este repositorio.

### 1. Commits: Conventional Commits en español

Todos los commits siguen [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/), con la descripción y el cuerpo escritos en español.

Formato:

```
<tipo>(<ámbito opcional>): <descripción>

[cuerpo opcional]

[pie(s) opcional(es)]
```

- **Tipos permitidos** (se escriben en inglés, como define el estándar): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **Descripción**: en español, en modo imperativo ("agrega", "corrige", no "agregado" ni "agregando"), en minúscula, sin punto final y de 72 caracteres como máximo.
- **Ámbito**: opcional, en minúscula, e indica la parte afectada (por ejemplo `home`, `catalogo`, `estilos`, `deps`).
- **Cuerpo**: opcional; explica el *qué* y el *por qué*, no el *cómo*.
- **Cambios incompatibles**: se marcan con `!` después del tipo o ámbito (`feat!: ...`) o con un pie `BREAKING CHANGE: <explicación>`.
- Un commit corresponde a un solo cambio lógico. No se mezclan tipos distintos en el mismo commit.

Ejemplos:

```
feat(catalogo): agrega listado de quesos con precios
fix(home): corrige el desborde del menú en móviles
docs: documenta los pasos para levantar el proyecto
build(deps): actualiza astro a la versión 5.2
refactor(estilos)!: reemplaza variables CSS por tokens de Tailwind

BREAKING CHANGE: los componentes que usaban --color-primario deben migrar a las clases de Tailwind.
```

### 2. Uso obligatorio de Context7

Antes de escribir, modificar o revisar código que dependa de una librería, framework, API o herramienta de línea de comandos (Astro, Tailwind, TypeScript, integraciones, bun, etc.), es **obligatorio** consultar su documentación actualizada en [Context7](https://context7.com/).

- No se debe depender de lo que el agente recuerde, porque las APIs cambian entre versiones.
- Si el agente tiene el servidor MCP de Context7, primero resuelve el ID de la librería (`resolve-library-id`) y después consulta la documentación (`query-docs`) con una pregunta concreta.
- Si no tiene el MCP, consulta la librería directamente en https://context7.com/.
- Se debe tener en cuenta la versión instalada del proyecto (ver `package.json` y `bun.lock`).
- Solo si Context7 no tiene la librería o la información necesaria se recurre a la documentación oficial (ver la sección *Documentation* más abajo), y se debe dejar indicado.

### 3. El proyecto es una PWA que funciona offline

Este proyecto es, sí o sí, una **Progressive Web App instalable que funciona sin conexión**. Está pensada para usarse en una feria, donde la señal puede ser mala o nula, así que no es un agregado opcional: todo cambio se diseña y se revisa con esto en mente.

- **Offline primero**: cualquier página o funcionalidad nueva debe funcionar sin conexión una vez que la app se cargó por primera vez. Si algo no puede funcionar offline (por ejemplo, enviar datos a un servidor), la interfaz debe indicarlo con claridad y no romperse ni quedar en blanco.
- **Service worker y caché**: todos los recursos necesarios (HTML, CSS, JS, fuentes, imágenes, íconos y datos) se precachean o se cachean con una estrategia explícita. Cuando se agrega un recurso nuevo, hay que verificar que quede cubierto por la caché.
- **Sin dependencias externas en tiempo de ejecución**: no se cargan fuentes, scripts, estilos ni imágenes desde CDNs o dominios de terceros. Todo se sirve desde el propio sitio (`public/` o el bundle) para que quede en caché.
- **Datos locales**: los datos que el usuario genera o necesita offline (pedidos, carrito, ventas, etc.) se guardan en el dispositivo (IndexedDB o `localStorage` según el tamaño) y, si existe un servidor, se sincronizan al recuperar la conexión sin perder información.
- **Manifest**: se mantiene un web app manifest completo (`name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color` e íconos de 192 y 512 px, incluido uno `maskable`).
- **Página de respaldo offline**: debe existir una página de respaldo para cuando se navega a una ruta que no está en caché.
- **Actualizaciones**: cuando se publica una versión nueva, el service worker se actualiza sin dejar a los usuarios con una versión vieja rota.
- **Verificación**: antes de dar un cambio por terminado se prueba con `astro build` + `astro preview` y la red en modo *Offline* en las DevTools, recargando y navegando por la app. El modo dev no sirve para probar el service worker.
- **Rutas con `base`**: la app se publica en GitHub Pages bajo `/Quesos-Feria/` (https://mate-logic.github.io/Quesos-Feria/). Ninguna ruta empieza con `/` a secas: las imágenes, los archivos de `public/` y los enlaces se arman con `ruta()` de `src/lib/rutas.ts`. Una ruta absoluta funciona en `localhost` pero se rompe publicada y sin conexión.
- **Herramientas**: la opción de referencia es la integración [`@vite-pwa/astro`](https://vite-pwa-org.netlify.app/frameworks/astro) (Workbox). Antes de usarla o cambiarla, se consulta Context7 (regla 2) y se confirma que sea compatible con la versión de Astro instalada.

### 4. Bun es el único gestor de paquetes

El proyecto usa [Bun](https://bun.sh) y el único lockfile es `bun.lock`. No se usan `npm`, `npx`, `yarn` ni `pnpm`, ni siquiera para consultas de solo lectura.

| En vez de                     | Se usa                              |
| :---------------------------- | :---------------------------------- |
| `npm install`                 | `bun install`                       |
| `npm install <paquete>`       | `bun add <paquete>` (`-d` para dev) |
| `npm uninstall <paquete>`     | `bun remove <paquete>`              |
| `npm run <script>`            | `bun run <script>`                  |
| `npx <comando>`               | `bunx <comando>`                    |
| `npm view <paquete>`          | `bun pm view <paquete>`             |

- Los scripts del proyecto se corren con `bun run <script>` (por ejemplo `bun run build`). `bun build` es el bundler de Bun, no el script del proyecto.
- No se agregan `package-lock.json`, `yarn.lock` ni `pnpm-lock.yaml`. Si aparece alguno, se borra.
- Bun bloquea los scripts `postinstall` de las dependencias. Solo se habilitan con `bun pm trust <paquete>` si hacen falta y después de revisar qué hacen.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

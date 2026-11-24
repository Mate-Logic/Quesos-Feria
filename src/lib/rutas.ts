// Rutas del sitio. La app se publica en una subcarpeta
// (https://mate-logic.github.io/Quesos-Feria/), así que nada puede apuntar a
// "/img/..." o "/ocr/...": todo pasa por acá para sumar el `base` de Astro.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** `ruta('img/logo.jpg')` → `/Quesos-Feria/img/logo.jpg`; `ruta('')` → `/Quesos-Feria/`. */
export function ruta(camino: string): string {
	return `${BASE}/${camino.replace(/^\//, '')}`;
}

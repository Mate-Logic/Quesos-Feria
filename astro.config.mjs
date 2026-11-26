// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import { AstroPWAIntegration } from '@vite-pwa/astro';
import ocrOffline from './integraciones/ocr-offline.mjs';

const COLOR_ROSA = '#e81f76';

// Se publica en GitHub Pages, en una subcarpeta con el nombre del repo:
// https://mate-logic.github.io/Quesos-Feria/
const BASE = '/Quesos-Feria';

// https://astro.build/config
export default defineConfig({
	site: 'https://mate-logic.github.io',
	// Con la barra final: @vite-pwa/astro usa este valor como URL del inicio en
	// el precache, y sin la barra "/Quesos-Feria/" no se encuentra sin conexión.
	base: `${BASE}/`,
	// Las fuentes se descargan en el build y se sirven desde el propio sitio,
	// así quedan en la caché del service worker y funcionan offline.
	fonts: [
		{
			name: 'Encode Sans',
			cssVariable: '--font-encode-sans',
			provider: fontProviders.fontsource(),
			weights: [400, 600, 700],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['system-ui', 'sans-serif'],
		},
	],
	integrations: [
		// Tiene que ir antes que la PWA: deja en public/ocr/ los archivos que después se precachean.
		ocrOffline(),
		AstroPWAIntegration({
			registerType: 'autoUpdate',
			includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
			manifest: {
				name: 'Huella Pampa · Ventas de Feria',
				short_name: 'Ventas Feria',
				description: 'Registro de ventas de Lácteos Huella Pampa en los Mercados Bonaerenses.',
				lang: 'es-AR',
				start_url: `${BASE}/`,
				scope: `${BASE}/`,
				display: 'standalone',
				orientation: 'portrait',
				theme_color: COLOR_ROSA,
				background_color: COLOR_ROSA,
				icons: [
					{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{ src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
				],
			},
			// El OCR de tickets (public/ocr/) tiene archivos de hasta ~4 MB: el núcleo
			// en WebAssembly y el modelo del idioma. El límite por defecto es 2 MiB.
			maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
			generateSW: {
				// Precachea todo lo que genera el build para que la app funcione sin conexión.
				globPatterns: ['**/*.{html,js,css,png,jpg,jpeg,webp,svg,ico,woff2,traineddata,wasm}'],
				// El manifest, sus íconos y los `includeAssets` los agrega el plugin solo.
				globIgnores: ['pwa-*.png', 'maskable-icon-*.png', 'apple-touch-icon-*.png', 'favicon.ico'],
				navigateFallback: `${BASE}/404`,
				// La app no usa parámetros en la URL: se ignoran todos al buscar en la
				// caché, así un enlace con "?algo" abre la app y no la página 404.
				// (Opción de generateSW en @vite-pwa/workbox-build; Context7 no la documenta.)
				ignoreURLParametersMatching: [/.*/],
				cleanupOutdatedCaches: true,
			},
		}),
	],
});

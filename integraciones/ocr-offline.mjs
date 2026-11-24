// @ts-check
// Copia a `public/ocr/` lo que Tesseract.js necesita para leer los tickets sin
// conexión: el worker, el núcleo en WebAssembly y el idioma español. Por defecto
// Tesseract.js baja todo eso de un CDN; servirlo desde el sitio permite que el
// service worker lo precachee (regla 3 de AGENTS.md).
//
// Los archivos salen de `node_modules`, así que no se versionan: `public/ocr/`
// está en el .gitignore y se regenera en cada `astro dev` y `astro build`.

import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);

/**
 * Solo se usan los núcleos LSTM (el motor moderno de Tesseract). Tesseract.js
 * elige uno según lo que soporte el celular: con SIMD relajado, con SIMD o sin SIMD.
 */
const NUCLEOS = [
	'tesseract-core-lstm.wasm.js',
	'tesseract-core-simd-lstm.wasm.js',
	'tesseract-core-relaxedsimd-lstm.wasm.js',
];

/** @returns {import('astro').AstroIntegration} */
export default function ocrOffline() {
	return {
		name: 'ocr-offline',
		hooks: {
			'astro:config:setup': async ({ config, logger }) => {
				const destino = join(fileURLToPath(config.publicDir), 'ocr');
				await mkdir(destino, { recursive: true });

				const tesseract = dirname(require.resolve('tesseract.js/package.json'));
				// El núcleo es dependencia de tesseract.js: se resuelve desde ahí.
				const nucleo = dirname(
					createRequire(join(tesseract, 'package.json')).resolve('tesseract.js-core/package.json'),
				);
				const idioma = dirname(require.resolve('@tesseract.js-data/spa/package.json'));

				await copiarSiCambio(join(tesseract, 'dist/worker.min.js'), join(destino, 'worker.min.js'));
				for (const archivo of NUCLEOS) {
					await copiarSiCambio(join(nucleo, archivo), join(destino, archivo));
				}

				// Modelo "best_int": el más preciso de los que entran en el celular.
				// Se guarda descomprimido para no depender de cómo el hosting sirve
				// los .gz (algunos agregan `Content-Encoding` y el navegador lo
				// descomprime antes de tiempo).
				const modelo = join(idioma, '4.0.0_best_int/spa.traineddata.gz');
				const salida = join(destino, 'spa.traineddata');
				if (await esMasNuevo(modelo, salida)) {
					await writeFile(salida, gunzipSync(await readFile(modelo)));
				}
				logger.info('Archivos del OCR listos en public/ocr/');
			},
		},
	};
}

/** @param {string} origen @param {string} destino */
async function copiarSiCambio(origen, destino) {
	if (await esMasNuevo(origen, destino)) await copyFile(origen, destino);
}

/** @param {string} origen @param {string} destino */
async function esMasNuevo(origen, destino) {
	try {
		const [a, b] = await Promise.all([stat(origen), stat(destino)]);
		return a.mtimeMs > b.mtimeMs;
	} catch {
		return true;
	}
}

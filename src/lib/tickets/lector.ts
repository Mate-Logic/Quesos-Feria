// Lee la foto de un ticket en el celular, sin conexión.
//
// Tesseract.js corre en un web worker con todos sus archivos servidos desde
// /ocr/ (los copia integraciones/ocr-offline.mjs y los precachea el service
// worker), así que no se toca la red.

import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import {
	aislarEtiqueta,
	binarizar,
	escalar,
	estirarContraste,
	rotar,
	type Giro,
	type ImagenGris,
} from './imagen';
import { leerTicket, type LecturaTicket, type ProductoConocido } from './parser';
import { ruta } from '../rutas';

export interface ResultadoLectura {
	lectura: LecturaTicket;
	/** La etiqueta recortada y derecha, para mostrarla y guardarla junto a la venta. */
	miniatura: Blob | null;
}

export interface OpcionesLectura {
	/** La foto viene del recuadro de la cámara: la etiqueta casi seguro está derecha. */
	desdeCamara?: boolean;
	conocidos?: ProductoConocido[];
	alAvanzar?: (mensaje: string, progreso: number) => void;
}

/** Lado más largo con que se decodifica la foto: más es más lento y no lee mejor. */
const LADO_FOTO = 2000;
/** Con este puntaje (ver parser) ya se sabe que la orientación es la correcta. */
const PUNTAJE_ORIENTACION = 8;

/**
 * Pasadas del OCR, en orden: tamaño de la etiqueta, modo de segmentación y
 * sensibilidad del blanco y negro. Cada una se equivoca en cosas distintas;
 * se sigue con la próxima solo mientras la cuenta no cierre, así que las
 * fotos buenas se leen con dos o tres y las difíciles prueban todas.
 */
const PASADAS: { lado: number; modo: PSM; sensibilidad: number }[] = [
	{ lado: 1200, modo: PSM.SPARSE_TEXT, sensibilidad: 0.15 },
	{ lado: 1800, modo: PSM.SINGLE_BLOCK, sensibilidad: 0.15 },
	{ lado: 1200, modo: PSM.SINGLE_BLOCK, sensibilidad: 0.15 },
	{ lado: 1800, modo: PSM.SPARSE_TEXT, sensibilidad: 0.15 },
	{ lado: 1500, modo: PSM.SINGLE_BLOCK, sensibilidad: 0.25 },
	{ lado: 1500, modo: PSM.SPARSE_TEXT, sensibilidad: 0.25 },
	{ lado: 2200, modo: PSM.SINGLE_BLOCK, sensibilidad: 0.1 },
];

let lector: Promise<Worker> | null = null;

/** Crea el worker del OCR (una sola vez). Conviene llamarla antes de sacar la foto. */
export function prepararLector(): Promise<Worker> {
	lector ??= createWorker('spa', OEM.LSTM_ONLY, {
		workerPath: new URL(ruta('ocr/worker.min.js'), location.href).href,
		corePath: new URL(ruta('ocr'), location.href).href,
		langPath: new URL(ruta('ocr'), location.href).href,
		gzip: false,
		// El worker se carga desde su URL y no como blob, así sus pedidos pasan
		// por el service worker y salen de la caché.
		workerBlobURL: false,
		// El modelo ya queda en la caché del service worker: no se duplica en IndexedDB.
		cacheMethod: 'none',
	}).catch((error: unknown) => {
		lector = null;
		throw error;
	});
	return lector;
}

export async function leerFoto(foto: Blob | HTMLCanvasElement, opciones: OpcionesLectura = {}): Promise<ResultadoLectura> {
	const { desdeCamara = false, conocidos = [], alAvanzar = () => {} } = opciones;

	alAvanzar('Preparando el lector…', 0.05);
	const worker = await prepararLector();

	alAvanzar('Buscando la etiqueta…', 0.15);
	const rgba = await decodificar(foto);
	const etiqueta = estirarContraste(aislarEtiqueta(rgba));

	// Con la cámara la etiqueta viene derecha casi siempre; de la galería, como haya salido.
	const giros: Giro[] = desdeCamara ? [0, 180, 90, 270] : [0, 90, 270, 180];
	const pasadasTotales = giros.length + PASADAS.length - 1;
	let hechas = 0;
	const avanzar = (mensaje: string) => alAvanzar(mensaje, 0.2 + (0.75 * ++hechas) / pasadasTotales);

	// 1. Orientación: una pasada rápida por giro hasta que el texto parezca un ticket.
	let mejor: { giro: Giro; texto: string; lectura: LecturaTicket } | null = null;
	for (const giro of giros) {
		const texto = await reconocer(worker, rotar(etiqueta, giro), PASADAS[0]);
		const lectura = leerTicket([texto], conocidos);
		avanzar('Leyendo el ticket…');
		if (!mejor || lectura.puntaje > mejor.lectura.puntaje) mejor = { giro, texto, lectura };
		if (lectura.puntaje >= PUNTAJE_ORIENTACION) break;
	}
	if (!mejor) throw new Error('No se pudo leer la foto');

	// 2. Más pasadas sobre la orientación elegida hasta que la cuenta cierre.
	const derecha = rotar(etiqueta, mejor.giro);
	const textos = [mejor.texto];
	let lectura = mejor.lectura;
	for (const pasada of PASADAS.slice(1)) {
		if (lectura.estado === 'verificado') break;
		textos.push(await reconocer(worker, derecha, pasada));
		lectura = leerTicket(textos, conocidos);
		avanzar('Revisando los números…');
	}

	alAvanzar('Listo', 1);
	return { lectura, miniatura: await aMiniatura(derecha) };
}

async function reconocer(worker: Worker, img: ImagenGris, pasada: (typeof PASADAS)[number]): Promise<string> {
	const preparada = binarizar(escalar(img, pasada.lado / Math.max(img.width, img.height)), 1 / 16, pasada.sensibilidad);
	await worker.setParameters({ tessedit_pageseg_mode: pasada.modo, user_defined_dpi: '300' });
	const { data } = await worker.recognize(aCanvas(preparada));
	return data.text;
}

async function decodificar(foto: Blob | HTMLCanvasElement) {
	let fuente: CanvasImageSource = foto as HTMLCanvasElement;
	let ancho: number;
	let alto: number;
	if (foto instanceof Blob) {
		// `from-image` respeta la rotación EXIF de las fotos del celular.
		const bitmap = await createImageBitmap(foto, { imageOrientation: 'from-image' });
		fuente = bitmap;
		ancho = bitmap.width;
		alto = bitmap.height;
	} else {
		ancho = foto.width;
		alto = foto.height;
	}
	const escala = Math.min(1, LADO_FOTO / Math.max(ancho, alto));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(ancho * escala);
	canvas.height = Math.round(alto * escala);
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);
	if ('close' in fuente) (fuente as ImageBitmap).close();
	return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function aCanvas(img: ImagenGris): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = img.width;
	canvas.height = img.height;
	const datos = new ImageData(img.width, img.height);
	for (let p = 0, i = 0; p < img.data.length; p++, i += 4) {
		const v = img.data[p];
		datos.data[i] = v;
		datos.data[i + 1] = v;
		datos.data[i + 2] = v;
		datos.data[i + 3] = 255;
	}
	canvas.getContext('2d')!.putImageData(datos, 0, 0);
	return canvas;
}

/** JPEG chico de la etiqueta: alcanza para revisar el ticket y ocupa poco en el celular. */
function aMiniatura(img: ImagenGris): Promise<Blob | null> {
	const canvas = aCanvas(escalar(img, Math.min(1, 640 / Math.max(img.width, img.height))));
	return new Promise((resolver) => canvas.toBlob(resolver, 'image/jpeg', 0.7));
}

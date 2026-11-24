// Preparación de la foto de un ticket de balanza antes del OCR.
//
// Son funciones puras sobre píxeles (sin canvas ni DOM) para poder probarlas
// fuera del navegador. Las fotos se sacan en el puesto, con el celular, así que
// vienen giradas, con el ticket pegado sobre una bolsa o un queso y con reflejos
// del film: por eso primero se busca la etiqueta (papel blanco y sin color),
// se recorta, se decide si las líneas de texto van horizontales o verticales
// y se estira el contraste.

/** Imagen RGBA, como la que devuelve `getImageData`. */
export interface ImagenRGBA {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

/** Imagen en escala de grises: un byte por píxel. */
export interface ImagenGris {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type Giro = 0 | 90 | 180 | 270;

export function aGrises(img: ImagenRGBA): ImagenGris {
	const { width, height, data } = img;
	const gris = new Uint8ClampedArray(width * height);
	for (let i = 0, p = 0; p < gris.length; i += 4, p++) {
		// Luminancia aproximada (Rec. 601) con enteros.
		gris[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
	}
	return { data: gris, width, height };
}

/** Resultado de ubicar la etiqueta en una versión chica de la foto. */
interface Mancha {
	/** Celdas de la versión chica que forman la etiqueta (papel y texto). */
	mascara: Uint8Array;
	w: number;
	h: number;
	/** Píxeles de la foto original por cada celda. */
	paso: number;
	/** Rectángulo de la etiqueta, en celdas. */
	rect: Rect;
}

/**
 * Busca la etiqueta en la foto: la mancha más grande y compacta de píxeles
 * claros y sin color. Devuelve `null` si no hay nada que se parezca a un
 * ticket (en ese caso conviene leer la foto entera).
 */
function ubicarEtiqueta(img: ImagenRGBA): Mancha | null {
	// Se trabaja sobre una versión chica: alcanza para ubicar el papel y es rápido.
	const LADO = 200;
	const escala = Math.min(1, LADO / Math.max(img.width, img.height));
	const w = Math.max(1, Math.round(img.width * escala));
	const h = Math.max(1, Math.round(img.height * escala));
	const paso = 1 / escala;

	// Brillo y saturación promedio de cada celda de la versión chica.
	const brillo = new Float32Array(w * h);
	const saturacion = new Float32Array(w * h);
	for (let cy = 0; cy < h; cy++) {
		const y0 = Math.floor(cy * paso);
		const y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((cy + 1) * paso)));
		for (let cx = 0; cx < w; cx++) {
			const x0 = Math.floor(cx * paso);
			const x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((cx + 1) * paso)));
			let sb = 0;
			let ss = 0;
			let n = 0;
			// Muestreo salteado: no hace falta mirar todos los píxeles de la celda.
			const salto = Math.max(1, Math.floor((x1 - x0) / 4));
			for (let y = y0; y < y1; y += salto) {
				for (let x = x0; x < x1; x += salto) {
					const i = (y * img.width + x) * 4;
					const r = img.data[i];
					const g = img.data[i + 1];
					const b = img.data[i + 2];
					sb += (r * 77 + g * 150 + b * 29) >> 8;
					ss += Math.max(r, g, b) - Math.min(r, g, b);
					n++;
				}
			}
			brillo[cy * w + cx] = sb / n;
			saturacion[cy * w + cx] = ss / n;
		}
	}

	// El umbral de brillo se adapta a la foto: el papel es de lo más claro que hay,
	// pero con poca luz puede quedar bastante gris.
	const ordenado = Float32Array.from(brillo).sort();
	const claro = ordenado[Math.floor(ordenado.length * 0.97)];
	const umbral = Math.max(110, claro * 0.72);

	// Una celda es "papel" si es clara y casi sin color. Las celdas con texto
	// quedan oscuras, pero el papel que las rodea mantiene la mancha conectada;
	// igual se cierran huecos chicos con una dilatación.
	const papel = new Uint8Array(w * h);
	for (let p = 0; p < papel.length; p++) {
		papel[p] = brillo[p] >= umbral && saturacion[p] < 48 ? 1 : 0;
	}
	const cerrado = dilatar(papel, w, h);

	// Componentes conexas: se elige la que más se parece a una etiqueta.
	const componente = new Int32Array(w * h).fill(-1);
	const pila: number[] = [];
	let mejor: { id: number; rect: Rect; puntaje: number } | null = null;
	let id = 0;
	for (let inicio = 0; inicio < cerrado.length; inicio++) {
		if (!cerrado[inicio] || componente[inicio] !== -1) continue;
		let area = 0;
		let minX = w;
		let minY = h;
		let maxX = 0;
		let maxY = 0;
		let tocaBorde = 0;
		pila.push(inicio);
		componente[inicio] = id;
		while (pila.length) {
			const p = pila.pop()!;
			const x = p % w;
			const y = (p - x) / w;
			area++;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
			if (x === 0 || y === 0 || x === w - 1 || y === h - 1) tocaBorde++;
			for (const q of vecinos(p, x, y, w, h)) {
				if (cerrado[q] && componente[q] === -1) {
					componente[q] = id;
					pila.push(q);
				}
			}
		}

		const bw = maxX - minX + 1;
		const bh = maxY - minY + 1;
		const relleno = area / (bw * bh);
		const proporcion = area / (w * h);
		// Muy chica (una letra blanca de la bolsa) o casi toda la foto (fondo claro): no sirve.
		if (proporcion >= 0.02 && proporcion <= 0.92 && relleno >= 0.45) {
			// Penaliza el fondo que se escapa por los bordes de la foto.
			const borde = tocaBorde / (2 * (bw + bh));
			const puntaje = area * relleno * (1 - Math.min(0.8, borde));
			if (!mejor || puntaje > mejor.puntaje) {
				mejor = { id, rect: { x: minX, y: minY, width: bw, height: bh }, puntaje };
			}
		}
		id++;
	}
	if (!mejor) return null;

	// La etiqueta es la mancha más todo lo que queda encerrado por ella (el texto
	// y las franjas negras). Lo que se alcanza desde el borde del rectángulo sin
	// pisar la mancha es fondo.
	const { rect } = mejor;
	const fondo = new Uint8Array(w * h);
	const dentro = (p: number) => {
		const x = p % w;
		const y = (p - x) / w;
		return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
	};
	for (let y = rect.y; y < rect.y + rect.height; y++) {
		for (let x = rect.x; x < rect.x + rect.width; x++) {
			const enBorde =
				x === rect.x || y === rect.y || x === rect.x + rect.width - 1 || y === rect.y + rect.height - 1;
			const p = y * w + x;
			if (enBorde && componente[p] !== mejor.id && !fondo[p]) {
				fondo[p] = 1;
				pila.push(p);
			}
		}
	}
	while (pila.length) {
		const p = pila.pop()!;
		const x = p % w;
		const y = (p - x) / w;
		for (const q of vecinos(p, x, y, w, h)) {
			if (dentro(q) && !fondo[q] && componente[q] !== mejor.id) {
				fondo[q] = 1;
				pila.push(q);
			}
		}
	}
	const mascara = new Uint8Array(w * h);
	for (let y = rect.y; y < rect.y + rect.height; y++) {
		for (let x = rect.x; x < rect.x + rect.width; x++) {
			const p = y * w + x;
			mascara[p] = fondo[p] ? 0 : 1;
		}
	}
	// Un margen de una celda para no comerse el texto pegado al borde del papel.
	return { mascara: dilatar(mascara, w, h), w, h, paso, rect };
}

function vecinos(p: number, x: number, y: number, w: number, h: number): number[] {
	const v: number[] = [];
	if (x > 0) v.push(p - 1);
	if (x < w - 1) v.push(p + 1);
	if (y > 0) v.push(p - w);
	if (y < h - 1) v.push(p + w);
	return v;
}

/**
 * Deja solo la etiqueta: recorta la foto a su rectángulo, la pasa a grises y
 * pinta de blanco todo lo que no es papel (bolsa, queso, mesa). Si no encuentra
 * una etiqueta devuelve la foto entera en grises.
 */
export function aislarEtiqueta(img: ImagenRGBA, blanquear = true): ImagenGris {
	const gris = aGrises(img);
	const mancha = ubicarEtiqueta(img);
	if (!mancha) return gris;
	const { mascara, w, paso, rect } = mancha;

	const x0 = Math.max(0, Math.floor((rect.x - 1) * paso));
	const y0 = Math.max(0, Math.floor((rect.y - 1) * paso));
	const x1 = Math.min(img.width, Math.ceil((rect.x + rect.width + 1) * paso));
	const y1 = Math.min(img.height, Math.ceil((rect.y + rect.height + 1) * paso));
	const recorte = recortar(gris, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
	if (!blanquear) return recorte;
	for (let y = 0; y < recorte.height; y++) {
		const cy = Math.min(mancha.h - 1, Math.floor((y + y0) / paso));
		for (let x = 0; x < recorte.width; x++) {
			const cx = Math.min(w - 1, Math.floor((x + x0) / paso));
			if (!mascara[cy * w + cx]) recorte.data[y * recorte.width + x] = 255;
		}
	}
	return recorte;
}

function dilatar(m: Uint8Array, w: number, h: number): Uint8Array {
	const out = new Uint8Array(m.length);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const p = y * w + x;
			out[p] =
				m[p] ||
				(x > 0 && m[p - 1]) ||
				(x < w - 1 && m[p + 1]) ||
				(y > 0 && m[p - w]) ||
				(y < h - 1 && m[p + w])
					? 1
					: 0;
		}
	}
	return out;
}

export function recortar(img: ImagenGris, r: Rect): ImagenGris {
	const data = new Uint8ClampedArray(r.width * r.height);
	for (let y = 0; y < r.height; y++) {
		const origen = (r.y + y) * img.width + r.x;
		data.set(img.data.subarray(origen, origen + r.width), y * r.width);
	}
	return { data, width: r.width, height: r.height };
}

/** Gira la imagen en sentido horario. */
export function rotar(img: ImagenGris, giro: Giro): ImagenGris {
	if (giro === 0) return img;
	const { width: w, height: h, data } = img;
	const nw = giro === 180 ? w : h;
	const nh = giro === 180 ? h : w;
	const out = new Uint8ClampedArray(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let nx: number;
			let ny: number;
			if (giro === 90) {
				nx = h - 1 - y;
				ny = x;
			} else if (giro === 180) {
				nx = w - 1 - x;
				ny = h - 1 - y;
			} else {
				nx = y;
				ny = w - 1 - x;
			}
			out[ny * nw + nx] = data[y * w + x];
		}
	}
	return { data: out, width: nw, height: nh };
}

/** Achica (nunca agranda) para que el lado más largo no pase de `lado`. */
export function achicar(img: ImagenGris, lado: number): ImagenGris {
	const escala = lado / Math.max(img.width, img.height);
	if (escala >= 1) return img;
	const nw = Math.max(1, Math.round(img.width * escala));
	const nh = Math.max(1, Math.round(img.height * escala));
	const out = new Uint8ClampedArray(nw * nh);
	const paso = 1 / escala;
	for (let y = 0; y < nh; y++) {
		const y0 = Math.floor(y * paso);
		const y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) * paso)));
		for (let x = 0; x < nw; x++) {
			const x0 = Math.floor(x * paso);
			const x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) * paso)));
			let s = 0;
			for (let yy = y0; yy < y1; yy++) {
				for (let xx = x0; xx < x1; xx++) s += img.data[yy * img.width + xx];
			}
			out[y * nw + x] = s / ((y1 - y0) * (x1 - x0));
		}
	}
	return { data: out, width: nw, height: nh };
}

/** Estira el contraste ignorando los extremos (reflejos del film y sombras). */
export function estirarContraste(img: ImagenGris): ImagenGris {
	const hist = new Uint32Array(256);
	for (const v of img.data) hist[v]++;
	const total = img.data.length;
	const percentil = (q: number) => {
		let acumulado = 0;
		for (let v = 0; v < 256; v++) {
			acumulado += hist[v];
			if (acumulado >= total * q) return v;
		}
		return 255;
	};
	const bajo = percentil(0.02);
	const alto = percentil(0.9);
	if (alto - bajo < 10) return img;
	const out = new Uint8ClampedArray(total);
	const k = 255 / (alto - bajo);
	for (let p = 0; p < total; p++) out[p] = (img.data[p] - bajo) * k;
	return { data: out, width: img.width, height: img.height };
}

/** Agranda o achica con interpolación bilineal. */
export function escalar(img: ImagenGris, factor: number): ImagenGris {
	if (factor === 1) return img;
	if (factor < 1) return achicar(img, Math.max(img.width, img.height) * factor);
	const nw = Math.round(img.width * factor);
	const nh = Math.round(img.height * factor);
	const out = new Uint8ClampedArray(nw * nh);
	const { width: w, height: h, data } = img;
	for (let y = 0; y < nh; y++) {
		const fy = Math.min(h - 1, Math.max(0, (y + 0.5) / factor - 0.5));
		const y0 = Math.floor(fy);
		const y1 = Math.min(h - 1, y0 + 1);
		const dy = fy - y0;
		for (let x = 0; x < nw; x++) {
			const fx = Math.min(w - 1, Math.max(0, (x + 0.5) / factor - 0.5));
			const x0 = Math.floor(fx);
			const x1 = Math.min(w - 1, x0 + 1);
			const dx = fx - x0;
			const arriba = data[y0 * w + x0] * (1 - dx) + data[y0 * w + x1] * dx;
			const abajo = data[y1 * w + x0] * (1 - dx) + data[y1 * w + x1] * dx;
			out[y * nw + x] = arriba * (1 - dy) + abajo * dy;
		}
	}
	return { data: out, width: nw, height: nh };
}

/**
 * Pasa a blanco y negro comparando cada píxel con el promedio de su zona
 * (método de Bradley). Un umbral único para toda la foto no sirve: el film
 * deja reflejos y sombras que cambian el brillo de una parte a otra.
 * `ventana` es el lado de la zona, como fracción del lado más largo.
 */
export function binarizar(img: ImagenGris, ventana = 1 / 16, sensibilidad = 0.15): ImagenGris {
	const { width: w, height: h, data } = img;
	// Imagen integral: suma de todos los píxeles de arriba a la izquierda.
	const integral = new Float64Array((w + 1) * (h + 1));
	for (let y = 0; y < h; y++) {
		let fila = 0;
		for (let x = 0; x < w; x++) {
			fila += data[y * w + x];
			integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + fila;
		}
	}
	const radio = Math.max(4, Math.round((Math.max(w, h) * ventana) / 2));
	const out = new Uint8ClampedArray(w * h);
	for (let y = 0; y < h; y++) {
		const ya = Math.max(0, y - radio);
		const yb = Math.min(h, y + radio + 1);
		for (let x = 0; x < w; x++) {
			const xa = Math.max(0, x - radio);
			const xb = Math.min(w, x + radio + 1);
			const suma =
				integral[yb * (w + 1) + xb] -
				integral[ya * (w + 1) + xb] -
				integral[yb * (w + 1) + xa] +
				integral[ya * (w + 1) + xa];
			const promedio = suma / ((yb - ya) * (xb - xa));
			out[y * w + x] = data[y * w + x] < promedio * (1 - sensibilidad) ? 0 : 255;
		}
	}
	return { data: out, width: w, height: h };
}

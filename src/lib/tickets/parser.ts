// Interpreta el texto que el OCR lee de un ticket de balanza.
//
// En el puesto trabajan varias marcas y cada una pesa con su balanza, así que
// los tickets no tienen un formato fijo: cambian el orden, las palabras, los
// decimales y a veces traen código de barras y a veces no. Por eso no se
// depende de un diseño ni del código de barras, sino de dos cosas que se
// repiten en cualquier ticket de venta por peso:
//
// 1. Palabras clave (PESO, NETO, PRECIO, $/KG, TOTAL, IMPORTE...), buscadas
//    de forma aproximada porque el OCR se equivoca en alguna letra.
// 2. La cuenta: peso × precio por kilo = total. Entre todos los números
//    leídos se busca el trío que cierra la cuenta; eso confirma la lectura
//    aunque el OCR haya leído basura alrededor.
//
// Se le pueden pasar varias lecturas de la misma foto (distintos tamaños o
// modos del OCR): los errores de una se compensan con las otras.

export type Campo = 'peso' | 'precio' | 'total';

export interface ProductoConocido {
	nombre: string;
	/** Último precio por kilo que se usó, si se sabe. */
	precioKg?: number;
}

export interface LecturaTicket {
	producto: string | null;
	pesoKg: number | null;
	precioKg: number | null;
	total: number | null;
	/**
	 * - `verificado`: los tres números se leyeron y cierran la cuenta.
	 * - `calculado`: se leyeron dos y el tercero (`calculado`) sale de la cuenta.
	 * - `incompleto`: faltan datos; hay que completarlos a mano.
	 */
	estado: 'verificado' | 'calculado' | 'incompleto';
	calculado: Campo | null;
	/** Qué tan "ticket" parece el texto. Sirve para elegir la orientación de la foto. */
	puntaje: number;
}

/** Productos habituales en un puesto de quesos, para reconocer el nombre aunque el OCR le erre a una letra. */
export const PRODUCTOS_COMUNES = [
	'PORSALU',
	'SARDO',
	'CREMOSO',
	'TYBO',
	'MOZZARELLA',
	'MUZZARELLA',
	'REGGIANITO',
	'REGGIANO',
	'PARMESANO',
	'PROVOLONE',
	'PROVOLETA',
	'GOUDA',
	'FONTINA',
	'PATEGRAS',
	'CHEDDAR',
	'HOLANDA',
	'CUARTIROLO',
	'DANBO',
	'EMMENTAL',
	'GRUYERE',
	'PECORINO',
	'ROQUEFORT',
	'AZUL',
	'BRIE',
	'CAMEMBERT',
	'RICOTA',
	'MAASDAM',
	'COLONIA',
	'SBRINZ',
	'BANQUETE',
	'TANDIL',
	'TRENZA',
	'BARRA',
	'SALAME',
	'MANTECA',
	'DULCE DE LECHE',
	'QUESO CREMA',
	'CON ORÉGANO',
	'CON PIMIENTA',
	'AHUMADO',
];

const CLAVES: Record<Campo | 'ignorar', string[]> = {
	peso: ['PESO', 'NETO', 'PNETO', 'CANT', 'CANTIDAD', 'KILOS'],
	precio: ['PRECIO', 'PRECIOKG', 'UNITARIO', 'PUNIT', 'PKG', 'XKG', 'VALOR'],
	total: ['TOTAL', 'IMPORTE', 'PAGAR', 'APAGAR', 'MONTO', 'SUBTOTAL'],
	// Renglones con números que no son de la venta.
	ignorar: [
		'TARA',
		'ENV',
		'ENVASADO',
		'HORA',
		'FECHA',
		'VENCE',
		'VTO',
		'VENC',
		'ELAB',
		'ELABORACION',
		'LOTE',
		'CODIGO',
		'PLU',
		'CUIT',
		'RNE',
		'RNPA',
		'TEL',
	],
};

const PALABRAS_CLAVE = new Set(Object.values(CLAVES).flat());

interface Candidato {
	valor: number;
	decimales: number;
	/** Pistas de qué campo es, con su peso. */
	pistas: Record<Campo, number>;
	/** En cuántas lecturas apareció. */
	apariciones: number;
}

interface Renglon {
	texto: string;
	/** Campo que nombra el renglón (por una palabra clave), si nombra alguno. */
	campo: Campo | 'ignorar' | null;
	tieneNumeros: boolean;
}

export function leerTicket(lecturas: string[], conocidos: ProductoConocido[] = []): LecturaTicket {
	const candidatos = new Map<string, Candidato>();
	const camposVistos = new Set<Campo>();
	let palabrasClave = 0;

	for (const lectura of lecturas) {
		const vistosEnEstaLectura = new Set<string>();
		const renglones = lectura
			.split('\n')
			.map((l) => normalizar(l))
			.filter((l) => l.trim())
			.map((texto): Renglon => {
				const campo = campoDelRenglon(texto);
				return { texto, campo, tieneNumeros: /\d[.,]?\d/.test(sinFechasNiHoras(texto)) };
			});

		renglones.forEach((renglon, i) => {
			if (renglon.campo && renglon.campo !== 'ignorar') camposVistos.add(renglon.campo);
			if (renglon.campo) palabrasClave++;

			// El modo de texto disperso del OCR suele separar "PESO:" y "2,535 kg"
			// en dos renglones: si el anterior es solo una palabra clave, vale para este.
			let campo = renglon.campo;
			const anterior = renglones[i - 1];
			if (!campo && anterior?.campo && !anterior.tieneNumeros) campo = anterior.campo;
			if (campo === 'ignorar') return;

			for (const numero of numerosDelRenglon(renglon.texto)) {
				const clave = numero.valor.toFixed(3);
				let c = candidatos.get(clave);
				if (!c) {
					c = { valor: numero.valor, decimales: numero.decimales, pistas: { peso: 0, precio: 0, total: 0 }, apariciones: 0 };
					candidatos.set(clave, c);
				}
				if (!vistosEnEstaLectura.has(clave)) {
					c.apariciones++;
					vistosEnEstaLectura.add(clave);
				}
				c.decimales = Math.max(c.decimales, numero.decimales);
				if (campo) c.pistas[campo] += 2;
				if (numero.unidad) c.pistas[numero.unidad] += 2;
			}
		});
	}

	const producto = buscarProducto(lecturas, conocidos);

	// Un precio ya conocido del producto también sirve para cerrar la cuenta.
	const conocido = producto ? conocidos.find((p) => igualesSinAcentos(p.nombre, producto)) : undefined;
	if (conocido?.precioKg) {
		const clave = conocido.precioKg.toFixed(3);
		const c = candidatos.get(clave);
		if (c) c.pistas.precio += 1;
		else
			candidatos.set(clave, {
				valor: conocido.precioKg,
				decimales: 2,
				pistas: { peso: 0, precio: 1, total: 0 },
				apariciones: 0,
			});
	}

	const lista = [...candidatos.values()];
	const trio = mejorTrio(lista);
	const puntajeBase = camposVistos.size * 3 + Math.min(palabrasClave, 8) + Math.min(lista.length, 6) * 0.5;

	if (trio) {
		return {
			producto: producto ?? productoPorPrecio(trio.precio.valor, conocidos),
			pesoKg: trio.peso.valor,
			precioKg: trio.precio.valor,
			total: trio.total.valor,
			estado: 'verificado',
			calculado: null,
			puntaje: puntajeBase + 20,
		};
	}

	// Sin trío que cierre: se toma el mejor candidato de cada campo y, si hay
	// dos, se calcula el tercero.
	const peso = mejorPara('peso', lista);
	const precio = mejorPara('precio', lista, [peso]);
	const total = mejorPara('total', lista, [peso, precio]);
	const lecturaParcial: LecturaTicket = {
		producto: producto ?? (precio ? productoPorPrecio(precio.valor, conocidos) : null),
		pesoKg: peso?.valor ?? null,
		precioKg: precio?.valor ?? null,
		total: total?.valor ?? null,
		estado: 'incompleto',
		calculado: null,
		puntaje: puntajeBase + [peso, precio, total].filter(Boolean).length * 2,
	};
	return completarConLaCuenta(lecturaParcial);
}

/**
 * Si no se leyó el nombre pero el precio por kilo es el de un solo producto ya
 * cargado, casi seguro es ese. Con dos productos al mismo precio no se adivina.
 */
function productoPorPrecio(precioKg: number, conocidos: ProductoConocido[]): string | null {
	const mismos = conocidos.filter((c) => c.precioKg != null && Math.abs(c.precioKg - precioKg) < 0.005);
	return mismos.length === 1 ? mismos[0].nombre : null;
}

/** Si hay exactamente dos de los tres números, calcula el que falta. */
export function completarConLaCuenta(l: LecturaTicket): LecturaTicket {
	const { pesoKg, precioKg, total } = l;
	if (pesoKg && precioKg && total == null) {
		return { ...l, total: redondear(pesoKg * precioKg, 2), estado: 'calculado', calculado: 'total' };
	}
	if (pesoKg && total && precioKg == null) {
		return { ...l, precioKg: redondear(total / pesoKg, 2), estado: 'calculado', calculado: 'precio' };
	}
	if (precioKg && total && pesoKg == null) {
		return { ...l, pesoKg: redondear(total / precioKg, 3), estado: 'calculado', calculado: 'peso' };
	}
	return l;
}

/**
 * Indica si peso × precio da el total. Las balanzas redondean el total al
 * centavo o, algunas, al peso entero: solo un total sin centavos admite la
 * diferencia de ese redondeo. Así un "21927,15" mal leído no pasa por "21927,75".
 */
export function cierraLaCuenta(pesoKg: number, precioKg: number, total: number): boolean {
	const diferencia = Math.abs(pesoKg * precioKg - total);
	const sinCentavos = Math.abs(total - Math.round(total)) < 0.001;
	return diferencia <= 0.011 || (sinCentavos && diferencia < 1);
}

// ---------------------------------------------------------------------------

const RANGOS: Record<Campo, [number, number]> = {
	peso: [0.005, 60],
	precio: [100, 1_000_000],
	total: [1, 10_000_000],
};

function enRango(campo: Campo, valor: number): boolean {
	const [min, max] = RANGOS[campo];
	return valor >= min && valor <= max;
}

function mejorTrio(lista: Candidato[]) {
	let mejor: { peso: Candidato; precio: Candidato; total: Candidato; puntaje: number } | null = null;
	for (const peso of lista) {
		if (!enRango('peso', peso.valor)) continue;
		// Un peso sin decimales ("1") suele ser ruido: solo vale si dice kg o PESO.
		if (peso.decimales === 0 && peso.pistas.peso <= 0) continue;
		for (const precio of lista) {
			if (precio === peso || !enRango('precio', precio.valor)) continue;
			for (const total of lista) {
				if (total === peso || total === precio || !enRango('total', total.valor)) continue;
				// Los importes llevan a lo sumo dos decimales: "16950,009" es un precio mal leído.
				if (total.decimales > 2 || precio.decimales > 2) continue;
				if (!cierraLaCuenta(peso.valor, precio.valor, total.valor)) continue;
				const puntaje =
					afinidad('peso', peso) +
					afinidad('precio', precio) +
					afinidad('total', total) +
					// Cuanto más exacta la cuenta, mejor.
					(Math.abs(peso.valor * precio.valor - total.valor) <= 0.01 ? 2 : 0);
				if (!mejor || puntaje > mejor.puntaje) mejor = { peso, precio, total, puntaje };
			}
		}
	}
	return mejor;
}

/** Cuánto se parece un candidato a un campo: pistas, decimales típicos y repetición entre lecturas. */
function afinidad(campo: Campo, c: Candidato): number {
	let a = c.pistas[campo] * 1.5 + Math.min(c.apariciones, 4) * 0.5;
	for (const otro of ['peso', 'precio', 'total'] as const) {
		if (otro !== campo) a -= c.pistas[otro];
	}
	if (campo === 'peso' && c.decimales === 3) a += 1.5;
	if (campo !== 'peso' && c.decimales === 2) a += 0.5;
	if (campo === 'peso' && c.decimales === 0) a -= 1;
	return a;
}

function mejorPara(campo: Campo, lista: Candidato[], usados: (Candidato | null)[] = []): Candidato | null {
	let mejor: Candidato | null = null;
	let puntaje = 0;
	for (const c of lista) {
		if (usados.includes(c) || !enRango(campo, c.valor)) continue;
		// Sin una pista directa no se adivina: mejor dejar el campo vacío.
		if (c.pistas[campo] <= 0) continue;
		const a = afinidad(campo, c);
		if (a > puntaje) {
			mejor = c;
			puntaje = a;
		}
	}
	return mejor;
}

// ---------------------------------------------------------------------------
// Texto

/** Mayúsculas, sin acentos y con los espacios normalizados. */
function normalizar(texto: string): string {
	return texto
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toUpperCase()
		.replace(/\s+/g, ' ');
}

function igualesSinAcentos(a: string, b: string): boolean {
	return normalizar(a).trim() === normalizar(b).trim();
}

function sinFechasNiHoras(texto: string): string {
	return texto
		.replace(/\d{1,2}\s?[/-]\s?\d{1,2}\s?[/-]\s?\d{2,4}/g, ' ')
		.replace(/\d{1,2}\s?:\s?\d{2}(\s?:\s?\d{2})?/g, ' ');
}

/** Palabras del renglón, solo letras (los dígitos que parecen letras se corrigen). */
function palabras(texto: string): string[] {
	return texto
		.replace(/[0]/g, 'O')
		.replace(/[1|]/g, 'I')
		.replace(/[$]/g, 'S')
		.split(/[^A-Z]+/)
		.filter((p) => p.length >= 3);
}

function campoDelRenglon(texto: string): Campo | 'ignorar' | null {
	// Se unen las palabras sueltas para reconocer "P. NETO", "A PAGAR" o "$/KG".
	const pals = palabras(texto);
	const unidas = texto.replace(/[^A-Z]/g, '');
	let mejor: { campo: Campo | 'ignorar'; similitud: number; posicion: number } | null = null;
	for (const [campo, claves] of Object.entries(CLAVES) as [Campo | 'ignorar', string[]][]) {
		for (const clave of claves) {
			pals.forEach((pal, posicion) => {
				const s = similitud(pal, clave);
				const umbral = clave.length <= 3 ? 1 : clave.length <= 5 ? 0.79 : 0.7;
				if (s >= umbral && (!mejor || posicion < mejor.posicion || (posicion === mejor.posicion && s > mejor.similitud))) {
					mejor = { campo, similitud: s, posicion };
				}
			});
			if (!mejor && clave.length >= 5 && unidas.startsWith(clave)) {
				mejor = { campo, similitud: 1, posicion: 0 };
			}
		}
	}
	// Con varias palabras clave en el renglón manda la primera: en
	// "PRECIO: 8650,00 $/KG" es precio aunque después diga "KG".
	return (mejor as { campo: Campo | 'ignorar' } | null)?.campo ?? null;
}

interface NumeroLeido {
	valor: number;
	decimales: number;
	unidad: Campo | null;
}

function numerosDelRenglon(original: string): NumeroLeido[] {
	// Letras que el OCR confunde con dígitos, solo cuando están pegadas a dígitos.
	let texto = sinFechasNiHoras(original);
	for (let i = 0; i < 2; i++) {
		texto = texto
			.replace(/(?<=\d)[O](?=[\d,.])|(?<=[\d,.])[O](?=\d)/g, '0')
			.replace(/(?<=\d)[IL|](?=[\d,.])|(?<=[\d,.])[IL|](?=\d)/g, '1');
	}
	// "2, 535" o "21927 ,75": espacios alrededor de la coma.
	texto = texto.replace(/(\d)\s*([,.])\s*(\d)/g, '$1$2$3');

	const resultado: NumeroLeido[] = [];
	const patron = /\d+(?:[.,]\d+)*/g;
	let m: RegExpExecArray | null;
	while ((m = patron.exec(texto))) {
		const crudo = m[0];
		const despues = texto.slice(m.index + crudo.length, m.index + crudo.length + 8);
		// Códigos de barras, lotes y otros números largos sin decimales.
		if (/^\d{7,}$/.test(crudo)) continue;
		const unidad = unidadQueSigue(despues);
		// En "8650,00$/kg" el OCR suele leer el "$" como un dígito más ("8650,003/kg").
		const numero = unidad === 'precio' && /[.,]\d{3}$/.test(crudo) && /^\//.test(despues.trim()) ? crudo.slice(0, -1) : crudo;
		const valor = interpretarNumero(numero, despues);
		if (valor == null) continue;
		resultado.push({ ...valor, unidad });
	}
	return resultado;
}

function interpretarNumero(crudo: string, despues: string): { valor: number; decimales: number } | null {
	const separadores = crudo.match(/[.,]/g) ?? [];
	if (separadores.length === 0) {
		return { valor: Number(crudo), decimales: 0 };
	}
	// El último separador es el decimal si le siguen 1 a 3 dígitos; los demás son de miles.
	const ultimo = Math.max(crudo.lastIndexOf(','), crudo.lastIndexOf('.'));
	const enteros = crudo.slice(0, ultimo).replace(/[.,]/g, '');
	const decimales = crudo.slice(ultimo + 1);
	if (decimales.length > 3) return null;
	// "2.535" sin unidad podría ser 2535: con punto y tres dígitos se lo toma
	// como miles, salvo que diga kg (los pesos sí llevan tres decimales).
	if (crudo[ultimo] === '.' && decimales.length === 3 && separadores.length === 1 && !esKg(despues)) {
		return { valor: Number(enteros + decimales), decimales: 0 };
	}
	return { valor: Number(`${enteros}.${decimales}`), decimales: decimales.length };
}

/** Lo que viene pegado al número: "kg(N)" es peso; "$/kg" es precio por kilo. */
function unidadQueSigue(despues: string): Campo | null {
	const d = despues.replace(/\s+/g, '');
	// "$/KG" y sus lecturas habituales con OCR: "%/7", "3/L9", "S/KG", "/RO".
	if (/^[$%S38]?\/[A-Z0-9]/.test(d)) return 'precio';
	if (esKg(d)) return 'peso';
	return null;
}

function esKg(texto: string): boolean {
	// "KG", y lecturas como "KQ", "K9", "RG", "TG". Tiene que estar al principio.
	return /^\s*[KRT][GQ9]/.test(texto);
}

// ---------------------------------------------------------------------------
// Producto

function buscarProducto(lecturas: string[], conocidos: ProductoConocido[]): string | null {
	// Primero, los productos que ya se cargaron (con el nombre tal como lo escribió
	// el usuario); después, la lista de productos habituales.
	const diccionario = [...conocidos.map((c) => c.nombre), ...PRODUCTOS_COMUNES];
	let mejor: { nombre: string; similitud: number; largo: number } | null = null;
	const votos = new Map<string, number>();

	for (const lectura of lecturas) {
		for (const linea of lectura.split('\n')) {
			const pals = palabras(normalizar(linea));
			if (!pals.length) continue;
			for (const nombre of diccionario) {
				const objetivo = normalizar(nombre)
					.replace(/^QUESO\s+/, '')
					.split(/[^A-Z]+/)
					// Igual que `palabras()`: sin "DE", "LA"...
					.filter((p) => p.length >= 3);
				if (!objetivo.length) continue;
				const n = objetivo.length;
				const meta = objetivo.join(' ');
				for (let i = 0; i + n <= pals.length; i++) {
					const s = similitud(pals.slice(i, i + n).join(' '), meta);
					const umbral = meta.length <= 4 ? 1 : 0.75;
					// A igual parecido gana el nombre más largo: "Cuartirolo de campo" antes que "Cuartirolo".
					const mejora = !mejor || s > mejor.similitud || (s === mejor.similitud && meta.length > mejor.largo);
					if (s >= umbral && mejora) mejor = { nombre, similitud: s, largo: meta.length };
				}
			}
			// Para el respaldo: renglones con una palabra larga que no es clave.
			const candidata = pals.filter((p) => p.length >= 4 && !esPalabraClave(p)).join(' ');
			if (candidata.length >= 4 && /^[A-Z ]+$/.test(candidata)) {
				votos.set(candidata, (votos.get(candidata) ?? 0) + 1);
			}
		}
	}
	if (mejor) return formatearNombre(mejor.nombre);

	// Sin coincidencia con nada conocido: el renglón de letras que más se repite
	// entre lecturas, si se repite (una sola aparición suele ser ruido).
	const repetida = [...votos.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0];
	return repetida ? formatearNombre(repetida[0]) : null;
}

function esPalabraClave(p: string): boolean {
	for (const clave of PALABRAS_CLAVE) if (similitud(p, clave) >= 0.75) return true;
	return ['KGN', 'KGT', 'QUESO', 'QUESOS'].includes(p);
}

/** "DULCE DE LECHE" → "Dulce de leche". */
export function formatearNombre(nombre: string): string {
	if (nombre !== nombre.toUpperCase()) return nombre.trim();
	const t = nombre.trim().toLowerCase();
	return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Similitud entre 0 y 1 según la distancia de edición. */
export function similitud(a: string, b: string): number {
	if (a === b) return 1;
	const largo = Math.max(a.length, b.length);
	if (!largo) return 1;
	return 1 - distancia(a, b) / largo;
}

function distancia(a: string, b: string): number {
	const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let diagonal = fila[0];
		fila[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const arriba = fila[j];
			fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
			diagonal = arriba;
		}
	}
	return fila[b.length];
}

function redondear(n: number, decimales: number): number {
	const f = 10 ** decimales;
	return Math.round(n * f) / f;
}

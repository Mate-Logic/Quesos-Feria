// Ventas guardadas en el celular con IndexedDB (regla 3: datos locales).
// No hay servidor: lo que se anota queda en el dispositivo y se puede exportar.

export interface Venta {
	id: string;
	/** Momento en que se anotó, en milisegundos. */
	creada: number;
	marca: string;
	producto: string;
	pesoKg: number | null;
	precioKg: number | null;
	total: number;
	origen: 'ticket' | 'manual';
	/** Foto recortada del ticket, si la venta salió de un ticket. */
	miniatura?: Blob | null;
}

/** Lo último que se sabe de cada producto, para reconocerlo y completar el próximo ticket. */
export interface Producto {
	/** Nombre normalizado (minúsculas, sin acentos): la clave. */
	clave: string;
	nombre: string;
	marca: string;
	precioKg: number | null;
	usado: number;
}

const NOMBRE_BASE = 'ventas-feria';
const VERSION = 1;

let base: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
	base ??= new Promise((resolver, rechazar) => {
		const pedido = indexedDB.open(NOMBRE_BASE, VERSION);
		pedido.onupgradeneeded = () => {
			const db = pedido.result;
			if (!db.objectStoreNames.contains('ventas')) {
				db.createObjectStore('ventas', { keyPath: 'id' }).createIndex('creada', 'creada');
			}
			if (!db.objectStoreNames.contains('productos')) {
				db.createObjectStore('productos', { keyPath: 'clave' });
			}
		};
		pedido.onsuccess = () => resolver(pedido.result);
		pedido.onerror = () => {
			base = null;
			rechazar(pedido.error);
		};
	});
	return base;
}

function esperar<T>(pedido: IDBRequest<T>): Promise<T> {
	return new Promise((resolver, rechazar) => {
		pedido.onsuccess = () => resolver(pedido.result);
		pedido.onerror = () => rechazar(pedido.error);
	});
}

function terminar(tx: IDBTransaction): Promise<void> {
	return new Promise((resolver, rechazar) => {
		tx.oncomplete = () => resolver();
		tx.onerror = () => rechazar(tx.error);
		tx.onabort = () => rechazar(tx.error);
	});
}

export function claveProducto(nombre: string): string {
	return nombre
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

/** Guarda (o reemplaza, si ya existe el id) una venta y actualiza lo que se sabe del producto. */
export async function guardarVenta(venta: Venta): Promise<void> {
	const db = await abrir();
	const tx = db.transaction(['ventas', 'productos'], 'readwrite');
	tx.objectStore('ventas').put(venta);
	const productos = tx.objectStore('productos');
	const clave = claveProducto(venta.producto);
	if (clave) {
		const anterior = (await esperar(productos.get(clave))) as Producto | undefined;
		productos.put({
			clave,
			nombre: venta.producto.trim(),
			marca: venta.marca,
			precioKg: venta.precioKg ?? anterior?.precioKg ?? null,
			usado: Math.max(anterior?.usado ?? 0, venta.creada),
		} satisfies Producto);
	}
	await terminar(tx);
}

export async function borrarVenta(id: string): Promise<void> {
	const db = await abrir();
	const tx = db.transaction('ventas', 'readwrite');
	tx.objectStore('ventas').delete(id);
	await terminar(tx);
}

/** Todas las ventas, de la más nueva a la más vieja. */
export async function listarVentas(): Promise<Venta[]> {
	const db = await abrir();
	const ventas = (await esperar(db.transaction('ventas').objectStore('ventas').index('creada').getAll())) as Venta[];
	return ventas.reverse();
}

/** Productos ya cargados, del más usado recientemente al más viejo. */
export async function listarProductos(): Promise<Producto[]> {
	const db = await abrir();
	const productos = (await esperar(db.transaction('productos').objectStore('productos').getAll())) as Producto[];
	return productos.sort((a, b) => b.usado - a.usado);
}

/**
 * Pide al navegador que no borre los datos si le falta espacio. Sin esto,
 * un celular con poco lugar puede vaciar IndexedDB y perder las ventas.
 */
export async function pedirAlmacenamientoPersistente(): Promise<void> {
	try {
		if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
			await navigator.storage.persist();
		}
	} catch {
		// No es grave: solo se pierde la garantía extra.
	}
}

export function nuevoId(): string {
	return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

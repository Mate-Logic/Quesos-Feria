// Ventas guardadas en el celular con IndexedDB (regla 3: datos locales).
// Las ventas abiertas se conservan hasta que se finalizan o cancelan.

import type { Pago } from '../pagos';

export interface ProductoVenta {
	id: string;
	marca: string;
	producto: string;
	pesoKg: number | null;
	precioKg: number | null;
	total: number;
	origen: 'ticket' | 'manual';
	/** Foto recortada del ticket, si el producto salió de un ticket. */
	miniatura?: Blob | null;
}

export interface Venta {
	id: string;
	/** Momento en que se inició la venta, en milisegundos. */
	creada: number;
	/** Momento de cobro; existe solo para las ventas finalizadas. */
	finalizada?: number;
	/** Momento en que se canceló; las canceladas viejas no lo tienen. */
	cancelada?: number;
	cliente: string;
	estado: 'abierta' | 'finalizada' | 'cancelada';
	productos: ProductoVenta[];
	/**
	 * Cómo se pagó. En una venta abierta son los pagos ya cargados de un cobro
	 * que quedó pendiente; las ventas viejas pueden no tenerlo.
	 */
	pagos?: Pago[];
	/** Nota del cobro, por ejemplo quién quedó debiendo y su teléfono. */
	nota?: string;
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
const VERSION = 2;

let base: Promise<IDBDatabase> | null = null;

function numeroONulo(valor: unknown): number | null {
	if (valor == null || valor === '') return null;
	const numero = Number(valor);
	return Number.isFinite(numero) ? numero : null;
}

function abrir(): Promise<IDBDatabase> {
	base ??= new Promise((resolver, rechazar) => {
		const pedido = indexedDB.open(NOMBRE_BASE, VERSION);
		let bloqueada = false;
		pedido.onblocked = () => {
			bloqueada = true;
			base = null;
			rechazar(new Error('La base de datos está abierta en otra pestaña. Cerrala e intentá de nuevo.'));
		};
		pedido.onupgradeneeded = (evento) => {
			const db = pedido.result;
			if (!db.objectStoreNames.contains('ventas')) {
				db.createObjectStore('ventas', { keyPath: 'id' }).createIndex('creada', 'creada');
			}
			if (!db.objectStoreNames.contains('productos')) {
				db.createObjectStore('productos', { keyPath: 'clave' });
			}

			// Convierte las ventas antiguas (un producto por registro) en ventas
			// finalizadas con un solo producto, sin perder datos locales.
			if (evento.oldVersion < 2) {
				const cursor = pedido.transaction?.objectStore('ventas').openCursor();
				if (cursor) {
					cursor.onsuccess = () => {
						const actual = cursor.result;
						if (!actual) return;
						const registro = actual.value as Record<string, unknown>;
						if (!Array.isArray(registro.productos)) {
							const creada = Number(registro.creada) || Date.now();
							const id = String(registro.id);
							actual.update({
								id,
								creada,
								finalizada: creada,
								cliente: '',
								estado: 'finalizada',
								productos: [{
									id,
									marca: String(registro.marca ?? ''),
									producto: String(registro.producto ?? 'Producto'),
									pesoKg: numeroONulo(registro.pesoKg),
									precioKg: numeroONulo(registro.precioKg),
									total: numeroONulo(registro.total) ?? 0,
									origen: registro.origen === 'ticket' ? 'ticket' : 'manual',
									miniatura: registro.miniatura instanceof Blob ? registro.miniatura : null,
								}],
							});
						}
						actual.continue();
					};
					cursor.onerror = () => pedido.transaction?.abort();
				}
			}
		};
		pedido.onsuccess = () => {
			if (bloqueada) {
				pedido.result.close();
				return;
			}
			pedido.result.onversionchange = () => {
				pedido.result.close();
				base = null;
			};
			resolver(pedido.result);
		};
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

/** Guarda una venta nueva y actualiza lo que se sabe de sus productos. */
export async function guardarVenta(venta: Venta): Promise<void> {
	if (venta.estado === 'finalizada' && venta.productos.length === 0) {
		throw new Error('No se puede finalizar una venta sin productos.');
	}
	const db = await abrir();
	const tx = db.transaction(['ventas', 'productos'], 'readwrite');
	tx.objectStore('ventas').put(venta);
	if (venta.estado === 'finalizada') await actualizarCatalogo(tx.objectStore('productos'), venta);
	await terminar(tx);
}

/** Modifica una venta a partir de su valor más reciente en una transacción atómica. */
export async function actualizarVenta(id: string, modificar: (venta: Venta) => Venta | null): Promise<Venta | undefined> {
	const db = await abrir();
	const tx = db.transaction(['ventas', 'productos'], 'readwrite');
	const store = tx.objectStore('ventas');
	const actual = (await esperar(store.get(id))) as Venta | undefined;
	if (!actual) {
		await terminar(tx);
		return undefined;
	}
	const actualizada = modificar(actual);
	if (actualizada && actualizada.estado === 'finalizada' && actualizada.productos.length === 0) {
		await terminar(tx);
		return actual;
	}
	if (actualizada) {
		store.put(actualizada);
		const productosCambiaron = actualizada.productos !== actual.productos;
		const seFinalizo = actualizada.estado === 'finalizada' && actual.estado !== 'finalizada';
		if (actualizada.estado === 'finalizada' && (productosCambiaron || seFinalizo)) {
			await actualizarCatalogo(tx.objectStore('productos'), actualizada);
		}
	}
	await terminar(tx);
	return actualizada ?? actual;
}

async function actualizarCatalogo(productos: IDBObjectStore, venta: Venta): Promise<void> {
	for (const item of venta.productos) {
		const clave = claveProducto(item.producto);
		if (!clave) continue;
		const anterior = (await esperar(productos.get(clave))) as Producto | undefined;
		productos.put({
			clave,
			nombre: item.producto.trim(),
			marca: item.marca,
			precioKg: item.precioKg ?? anterior?.precioKg ?? null,
			usado: Math.max(anterior?.usado ?? 0, venta.creada),
		} satisfies Producto);
	}
}

export async function obtenerVenta(id: string): Promise<Venta | undefined> {
	const db = await abrir();
	return (await esperar(db.transaction('ventas').objectStore('ventas').get(id))) as Venta | undefined;
}

export async function borrarVenta(id: string): Promise<void> {
	const db = await abrir();
	const tx = db.transaction('ventas', 'readwrite');
	tx.objectStore('ventas').delete(id);
	await terminar(tx);
}

/** Cierra de forma segura una venta vacía si todavía sigue abierta. */
export async function borrarVentaVacia(id: string): Promise<boolean> {
	const db = await abrir();
	const tx = db.transaction('ventas', 'readwrite');
	const store = tx.objectStore('ventas');
	const venta = (await esperar(store.get(id))) as Venta | undefined;
	const vacia = venta != null && venta.estado === 'abierta' && venta.productos.length === 0;
	if (vacia) store.delete(id);
	await terminar(tx);
	return vacia;
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

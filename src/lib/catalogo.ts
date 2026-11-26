// Catálogo de productos y promociones. Parte de src/data/productos.json y se
// ajusta desde la app. En el celular se guarda solo lo que se cambió o agregó:
// así una versión nueva de la app no pisa los precios puestos en el puesto.

import semilla from '../data/productos.json';
import type { ProductoVenta } from './ventas/db';

export interface ItemCatalogo {
	id: string;
	marca: string;
	nombre: string;
	/** Por kilo (se pesa) o por unidad (sachet, pote). */
	tipo: 'kg' | 'unidad';
	/** Por kilo o por unidad según el tipo; `null` si todavía no se sabe. */
	precio: number | null;
	/** Código de barras del envase (los quesos pesados no usan). */
	codigo?: string;
	/** El precio inicial no está confirmado. */
	revisar?: boolean;
	/** `false`: dado de baja, no se ofrece al cargar. */
	activo?: boolean;
	/** Borrado desde la app. Se recuerda para que la semilla no lo vuelva a traer. */
	borrado?: boolean;
}

export interface Promo {
	id: string;
	nombre: string;
	/** Lo que hay que llevar (solo productos por unidad). */
	items: { productoId: string; cantidad: number }[];
	/** Lo que se paga por todo junto. */
	precio: number | null;
	activa: boolean;
	borrado?: boolean;
}

export interface Catalogo {
	productos: ItemCatalogo[];
	promos: Promo[];
}

const CLAVE = 'catalogo';

/** Lo guardado en el celular reemplaza al de la semilla con el mismo `id`; lo demás se suma. */
export function combinar(base: Catalogo, local: Partial<Catalogo>): Catalogo {
	const unir = <T extends { id: string; borrado?: boolean }>(de: T[], cambios: T[] = []) => {
		const mapa = new Map(de.map((x) => [x.id, x]));
		for (const x of cambios) mapa.set(x.id, x);
		return [...mapa.values()].filter((x) => !x.borrado);
	};
	return { productos: unir(base.productos, local.productos), promos: unir(base.promos, local.promos) };
}

function leerLocal(): Partial<Catalogo> {
	try {
		return JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Partial<Catalogo>;
	} catch {
		return {};
	}
}

export const leerCatalogo = (): Catalogo => combinar(semilla as Catalogo, leerLocal());

function guardar<K extends keyof Catalogo>(lista: K, valor: Catalogo[K][number]) {
	const local = leerLocal();
	const otros = ((local[lista] ?? []) as { id: string }[]).filter((x) => x.id !== valor.id);
	localStorage.setItem(CLAVE, JSON.stringify({ ...local, [lista]: [...otros, valor] }));
}

export const guardarItem = (item: ItemCatalogo) => guardar('productos', item);
export const guardarPromo = (promo: Promo) => guardar('promos', promo);

const centavos = (n: number) => Math.round(n * 100);

/**
 * Descuenta las promociones de una venta. El descuento queda dentro del total de
 * cada producto, así todas las sumas de la app siguen valiendo. Se puede llamar
 * las veces que haga falta: parte siempre del precio de lista.
 * Un total corregido a mano se respeta y no entra en ninguna promo.
 */
export function aplicarPromos(productos: ProductoVenta[], promos: Promo[]): ProductoVenta[] {
	const filas = productos.map((original) => {
		const { descuento, promo, ...p } = original;
		const lista = p.cantidad && p.precioUnidad ? centavos(p.cantidad * p.precioUnidad) : null;
		// Si tenía descuento, se vuelve al precio de lista antes de recalcular.
		const entra = lista != null && p.productoId != null && (descuento != null || centavos(p.total) === lista);
		return {
			original,
			p: entra ? { ...p, total: lista / 100 } : original,
			libres: entra ? p.cantidad! : 0,
			rebaja: 0,
			nombres: new Set<string>(),
		};
	});

	for (const promo of promos) {
		if (!promo.activa || promo.precio == null || !promo.items.length) continue;
		for (;;) {
			const alcanza = promo.items.every(
				(i) => i.cantidad > 0 && filas.filter((f) => f.p.productoId === i.productoId).reduce((s, f) => s + f.libres, 0) >= i.cantidad,
			);
			if (!alcanza) break;
			const tomadas: { fila: (typeof filas)[number]; unidades: number }[] = [];
			for (const item of promo.items) {
				let faltan = item.cantidad;
				for (const fila of filas) {
					if (!faltan || fila.p.productoId !== item.productoId || !fila.libres) continue;
					const unidades = Math.min(faltan, fila.libres);
					fila.libres -= unidades;
					faltan -= unidades;
					tomadas.push({ fila, unidades });
				}
			}
			let ahorro = tomadas.reduce((s, t) => s + centavos(t.fila.p.precioUnidad! * t.unidades), 0) - centavos(promo.precio);
			// Una promo más cara que los precios sueltos no se aplica.
			if (ahorro <= 0) break;
			// El ahorro se anota empezando por lo último que entró en la promo.
			for (const { fila } of [...tomadas].reverse()) {
				const parte = Math.min(ahorro, centavos(fila.p.total) - fila.rebaja);
				if (parte <= 0) continue;
				fila.rebaja += parte;
				fila.nombres.add(promo.nombre);
				ahorro -= parte;
			}
		}
	}

	return filas.map((f) =>
		f.rebaja
			? { ...f.p, total: (centavos(f.p.total) - f.rebaja) / 100, descuento: f.rebaja / 100, promo: [...f.nombres].join(' + ') }
			: f.p,
	);
}

/** El producto dado de alta con ese código de barras. */
export const porCodigo = (catalogo: Catalogo, codigo: string) =>
	catalogo.productos.find((p) => p.activo !== false && p.codigo === codigo);

/** Suma un producto a la venta: lo que va por unidad y ya estaba al mismo precio, suma cantidad. */
export function sumarProducto(productos: ProductoVenta[], nuevo: ProductoVenta): ProductoVenta[] {
	const igual = productos.find(
		(p) =>
			nuevo.cantidad != null &&
			p.cantidad != null &&
			p.productoId != null &&
			p.productoId === nuevo.productoId &&
			p.precioUnidad === nuevo.precioUnidad &&
			// Un total corregido a mano queda en su propio renglón.
			(p.descuento != null || centavos(p.total) === centavos(p.cantidad * p.precioUnidad!)) &&
			centavos(nuevo.total) === centavos(nuevo.cantidad * nuevo.precioUnidad!),
	);
	if (!igual) return [...productos, nuevo];
	const cantidad = igual.cantidad! + nuevo.cantidad!;
	const { descuento, promo, ...resto } = igual;
	const sumado = { ...resto, cantidad, total: centavos(cantidad * igual.precioUnidad!) / 100 };
	return [...productos.filter((p) => p !== igual), sumado];
}

import { describe, expect, test } from 'bun:test';
import semilla from '../src/data/productos.json';
import { aplicarPromos, combinar, porCodigo, sumarProducto, type Catalogo, type Promo } from '../src/lib/catalogo';
import type { ProductoVenta } from '../src/lib/ventas/db';

const catalogo = semilla as Catalogo;
const leche = (id: string, cantidad: number, cambios: Partial<ProductoVenta> = {}): ProductoVenta => ({
	id, marca: 'mama-mecha', producto: 'Leche sachet 1 L', productoId: 'leche', cantidad, precioUnidad: 1400,
	pesoKg: null, precioKg: null, total: cantidad * 1400, origen: 'manual', ...cambios,
});
const total = (p: ProductoVenta[]) => p.reduce((s, x) => s + x.total, 0);

describe('promo de 3 sachets', () => {
	test('con menos de 3 no descuenta', () => {
		expect(total(aplicarPromos([leche('a', 2)], catalogo.promos))).toBe(2800);
	});

	test('se aplica sola aunque se carguen de a uno', () => {
		const venta = aplicarPromos([leche('a', 1), leche('b', 1), leche('c', 1)], catalogo.promos);
		expect(total(venta)).toBe(3600);
		expect(venta[2]).toMatchObject({ total: 800, descuento: 600, promo: '3 sachets de leche' });
	});

	test('se repite y el resto va a precio suelto; recalcular no descuenta dos veces', () => {
		const una = aplicarPromos([leche('a', 7)], catalogo.promos);
		expect(total(una)).toBe(8600);
		expect(total(aplicarPromos(una, catalogo.promos))).toBe(8600);
		expect(total(aplicarPromos(una, []))).toBe(9800);
	});

	test('la chocolatada no entra', () => {
		const choco = leche('c', 3, { productoId: 'chocolatada', precioUnidad: 2500, total: 7500 });
		expect(total(aplicarPromos([choco], catalogo.promos))).toBe(7500);
	});

	test('respeta un total corregido a mano', () => {
		expect(total(aplicarPromos([leche('a', 3, { total: 4000 })], catalogo.promos))).toBe(4000);
	});
});

test('al repetir un producto envasado suma cantidad y la promo se recalcula', () => {
	let venta: ProductoVenta[] = [];
	for (const id of ['a', 'b', 'c', 'd']) venta = aplicarPromos(sumarProducto(venta, leche(id, 1)), catalogo.promos);
	expect(venta).toHaveLength(1);
	expect(venta[0]).toMatchObject({ cantidad: 4, total: 5000, descuento: 600 });
});

test('busca por código de barras y no ofrece lo dado de baja', () => {
	const item = { ...catalogo.productos[0]!, codigo: '7790000000000' };
	expect(porCodigo(combinar(catalogo, { productos: [item] }), '7790000000000')?.id).toBe(item.id);
	expect(porCodigo(combinar(catalogo, { productos: [{ ...item, activo: false }] }), '7790000000000')).toBeUndefined();
});

test('una promo de dos productos pide los dos', () => {
	const promo: Promo = { id: 'x', nombre: 'Leche + yogur', precio: 2000, activa: true, items: [{ productoId: 'leche', cantidad: 1 }, { productoId: 'yogur', cantidad: 1 }] };
	const yogur = leche('y', 1, { productoId: 'yogur', precioUnidad: 1000, total: 1000 });
	expect(total(aplicarPromos([leche('a', 1)], [promo]))).toBe(1400);
	expect(total(aplicarPromos([leche('a', 1), yogur], [promo]))).toBe(2000);
});

test('lo cambiado en el celular no lo pisa la semilla y lo nuevo de la semilla aparece', () => {
	const mio = { ...catalogo.productos[0]!, precio: 9999 };
	const nuevo = { id: 'propio', marca: 'milkey', nombre: 'Manteca', tipo: 'unidad' as const, precio: 100 };
	const r = combinar(catalogo, { productos: [mio, nuevo] });
	expect(r.productos.find((p) => p.id === mio.id)?.precio).toBe(9999);
	expect(r.productos).toHaveLength(catalogo.productos.length + 1);
	expect(r.promos).toEqual(catalogo.promos);
	// Lo borrado desde la app no vuelve con la semilla.
	expect(combinar(catalogo, { productos: [{ ...mio, borrado: true }] }).productos.some((p) => p.id === mio.id)).toBe(false);
});

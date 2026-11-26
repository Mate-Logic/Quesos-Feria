import { describe, expect, test } from 'bun:test';
import type { Venta } from '../src/lib/ventas/db';

// Las rutas de los logos usan el `base` de Astro, que acá no existe.
process.env.BASE_URL ??= '/';
const { armarReporte } = await import('../src/lib/ventas/reporte');
const { reporteAPdf } = await import('../src/lib/ventas/pdf');

const DIA = new Date(2026, 10, 21, 12).getTime();

const venta = (id: string, cambios: Partial<Venta> = {}): Venta => ({
	id,
	creada: DIA,
	finalizada: DIA,
	cliente: '',
	estado: 'finalizada',
	productos: [
		{ id: `${id}-1`, marca: 'huella-pampa', producto: 'Sardo', pesoKg: 0.5, precioKg: 20000, total: 10000, origen: 'manual' },
	],
	pagos: [{ id: `${id}-p`, metodo: 'efectivo', monto: 10000 }],
	...cambios,
});

describe('armarReporte', () => {
	test('solo cuenta las ventas finalizadas de ese día', () => {
		const reporte = armarReporte(
			[
				venta('a'),
				venta('abierta', { estado: 'abierta' }),
				venta('cancelada', { estado: 'cancelada' }),
				venta('ayer', { finalizada: DIA - 86_400_000 }),
			],
			DIA,
		);
		expect(reporte.ventas.map((v) => v.id)).toEqual(['a']);
		expect(reporte.total).toBe(10000);
		expect(reporte.sinPago).toBe(0);
	});

	test('junta el mismo producto y separa lo que quedó debiendo', () => {
		const reporte = armarReporte(
			[venta('a'), venta('b', { pagos: [{ id: 'd', metodo: 'debe', monto: 10000 }] })],
			DIA,
		);
		expect(reporte.porProducto).toEqual([{ nombre: 'Sardo', marca: 'Huella Pampa', productos: 2, kg: 1, total: 20000 }]);
		expect(reporte.deudas.map((d) => d.monto)).toEqual([10000]);
		expect(reporte.pagos).toEqual([
			{ nombre: 'Efectivo', total: 10000 },
			{ nombre: 'Queda debiendo', total: 10000 },
		]);
	});

	test('avisa la diferencia cuando una venta no tiene pagos anotados', () => {
		expect(armarReporte([venta('a', { pagos: undefined })], DIA).sinPago).toBe(10000);
	});
});

test('arma un PDF, con varias hojas si el día fue largo', () => {
	const ventas = Array.from({ length: 80 }, (_, i) => venta(`v${i}`));
	const doc = reporteAPdf(armarReporte(ventas, DIA));
	expect(doc.getNumberOfPages()).toBeGreaterThan(1);
	expect(doc.output().startsWith('%PDF-')).toBe(true);
});

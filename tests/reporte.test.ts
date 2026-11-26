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

	test('arma las velas por hora con la primera, la mayor, la menor y la última venta', () => {
		const con = (id: string, minutos: number, total: number) =>
			venta(id, { finalizada: DIA + minutos * 60_000, productos: [{ ...venta(id).productos[0]!, total }] });
		const [vela] = armarReporte([con('c', 30, 8000), con('a', 0, 5000), con('b', 10, 9000), con('d', 40, 2000)], DIA).porHora;
		expect(vela).toMatchObject({ ventas: 4, primera: 5000, mayor: 9000, menor: 2000, ultima: 2000, total: 24000 });
	});

	test('compara con el último día anterior que tuvo ventas', () => {
		const semana = 7 * 86_400_000;
		const reporte = armarReporte(
			[venta('hoy'), venta('pasada', { finalizada: DIA - semana }), venta('vieja', { finalizada: DIA - 2 * semana })],
			DIA,
		);
		expect(reporte.anterior).toMatchObject({ total: 10000, cantidadVentas: 1 });
		expect(DIA - reporte.anterior!.dia).toBeLessThan(2 * semana - 86_400_000);
		expect(armarReporte([venta('hoy')], DIA).anterior).toBeNull();
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

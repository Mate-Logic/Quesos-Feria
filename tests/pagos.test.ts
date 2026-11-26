import { describe, expect, test } from 'bun:test';
import { deuda, estadoCobro, pagosFinales, resumenPagos, telefonoValido, totalesPorMetodo, type Pago } from '../src/lib/pagos';

const pago = (metodo: Pago['metodo'], monto: number, id = `${metodo}-${monto}`): Pago => ({ id, metodo, monto });

test('el teléfono de quien debe tiene que tener al menos 8 dígitos', () => {
	for (const bueno of ['2346 123456', '11 2345-6789', '+54 9 (2346) 12-3456']) expect(telefonoValido(bueno)).toBe(true);
	for (const malo of ['', '1234567', 'Marta', 'Marta 2346123456', '1234567890123456']) expect(telefonoValido(malo)).toBe(false);
});

describe('estadoCobro', () => {
	test('sin pagos falta todo', () => {
		expect(estadoCobro(1000, [])).toEqual({ pagado: 0, falta: 1000, vuelto: 0, sobra: 0, completo: false });
	});

	test('varias Cuenta DNI completan el total', () => {
		const estado = estadoCobro(30000, [pago('cuenta-dni', 10000, 'a'), pago('cuenta-dni', 10000, 'b'), pago('cuenta-dni', 10000, 'c')]);
		expect(estado.completo).toBe(true);
		expect(estado.falta).toBe(0);
	});

	test('el efectivo de más da vuelto', () => {
		const estado = estadoCobro(8500, [pago('efectivo', 10000)]);
		expect(estado).toMatchObject({ vuelto: 1500, sobra: 0, completo: true });
	});

	test('una tarjeta de más no se puede confirmar', () => {
		const estado = estadoCobro(8500, [pago('debito', 9000)]);
		expect(estado).toMatchObject({ vuelto: 0, sobra: 500, completo: false });
	});

	test('no arrastra errores de redondeo con centavos', () => {
		expect(estadoCobro(0.3, [pago('efectivo', 0.1), pago('debito', 0.2)]).completo).toBe(true);
	});
});

describe('pagosFinales', () => {
	test('descuenta el vuelto del efectivo y saca montos en cero', () => {
		const finales = pagosFinales(12000, [pago('cuenta-dni', 5000), pago('efectivo', 10000), pago('qr', 0)]);
		expect(finales.map((p) => [p.metodo, p.monto])).toEqual([
			['cuenta-dni', 5000],
			['efectivo', 7000],
		]);
	});
});

describe('deuda', () => {
	test('lo adeudado completa el cobro y se suma aparte', () => {
		const pagos = [pago('efectivo', 6000), pago('debe', 4000)];
		expect(estadoCobro(10000, pagos).completo).toBe(true);
		expect(deuda(pagos)).toBe(4000);
		expect(totalesPorMetodo(pagos).at(-1)).toEqual({ id: 'debe', nombre: 'Queda debiendo', total: 4000 });
	});
});

describe('resúmenes', () => {
	test('agrupa los medios repetidos', () => {
		expect(resumenPagos([pago('efectivo', 1), pago('cuenta-dni', 2, 'a'), pago('cuenta-dni', 3, 'b')])).toBe('Efectivo + Cuenta DNI ×2');
		expect(resumenPagos(undefined)).toBe('');
	});

	test('suma por medio de pago', () => {
		expect(totalesPorMetodo([pago('debito', 100), pago('efectivo', 50), pago('debito', 25, 'x')])).toEqual([
			{ id: 'efectivo', nombre: 'Efectivo', total: 50 },
			{ id: 'debito', nombre: 'Débito', total: 125 },
		]);
	});
});

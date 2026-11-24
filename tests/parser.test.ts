/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { cierraLaCuenta, completarConLaCuenta, leerTicket } from '../src/lib/tickets/parser';
import { leerNumero } from '../src/lib/formato';
import lecturas from './fixtures/lecturas-ocr.json';

// Lecturas reales del OCR (con sus errores) de las fotos de fotos_prueba/.
describe('tickets reales de fotos_prueba', () => {
	test('Porsalu: junta varias lecturas con errores y verifica con la cuenta', () => {
		const l = leerTicket(lecturas['porsalu-bolsa']);
		expect(l).toMatchObject({ producto: 'Porsalu', pesoKg: 2.535, precioKg: 8650, total: 21927.75, estado: 'verificado' });
	});

	test('Sardo con código de barras: no depende del código', () => {
		const l = leerTicket(lecturas['sardo-con-codigo-de-barras']);
		expect(l).toMatchObject({ producto: 'Sardo', pesoKg: 0.475, precioKg: 16950, total: 8051.25, estado: 'verificado' });
	});

	test('foto curvada: no inventa una lectura verificada', () => {
		expect(leerTicket(lecturas['porsalu-bolsa-curvada']).estado).not.toBe('verificado');
	});

	test('una lectura sola con "21927,15" no pasa por buena', () => {
		const l = leerTicket([lecturas['porsalu-bolsa'][1]]);
		expect(l.estado).not.toBe('verificado');
	});
});

// Formatos de otras balanzas: cambian las palabras y el orden, no la cuenta.
describe('otras marcas y balanzas', () => {
	test('NETO, $/KG e IMPORTE', () => {
		const l = leerTicket(['QUESO CREMOSO\nNETO 1,250 KG\n$/KG 9800,00\nIMPORTE $ 12250,00']);
		expect(l).toMatchObject({ producto: 'Cremoso', pesoKg: 1.25, precioKg: 9800, total: 12250, estado: 'verificado' });
	});

	test('P. NETO, PRECIO X KG y A PAGAR, con punto de miles', () => {
		const l = leerTicket(['TYBO\nP. NETO: 0.850kg\nPRECIO X KG: $ 11.500,00\nA PAGAR: $ 9.775,00']);
		expect(l).toMatchObject({ producto: 'Tybo', pesoKg: 0.85, precioKg: 11500, total: 9775, estado: 'verificado' });
	});

	test('el total primero y las etiquetas en otro renglón', () => {
		const l = leerTicket(['TOTAL\n$ 5.433,60\nMOZZARELLA\nPESO\n0,520 kg\nPRECIO\n10449,23 $/kg']);
		expect(l).toMatchObject({ producto: 'Mozzarella', pesoKg: 0.52, total: 5433.6, estado: 'verificado' });
	});

	test('sin palabras clave: alcanza con la cuenta', () => {
		const l = leerTicket(['REGGIANITO\n0,312\n21500,00\n6708,00']);
		expect(l).toMatchObject({ pesoKg: 0.312, precioKg: 21500, total: 6708, estado: 'verificado' });
	});

	test('ignora fechas, horas, tara y códigos de barras', () => {
		const l = leerTicket(['SARDO\nENV.:24/11/26\nHORA:01:56:14\nPESO: 0,475 kg(N)\nTARA: 0,000 kg(T)\nPRECIO: 16950,00$/kg\nTOTAL: $ 8051,25\n2000088051251']);
		expect(l).toMatchObject({ pesoKg: 0.475, precioKg: 16950, total: 8051.25, estado: 'verificado' });
	});

	test('no arma un trío falso con un "1" suelto y un precio mal leído', () => {
		const l = leerTicket(['1\nPRECIO 16950,009\nTOTAL 8051,2']);
		expect(l.estado).not.toBe('verificado');
	});
});

describe('datos que faltan', () => {
	test('con peso y precio calcula el total', () => {
		const l = leerTicket(['PESO 2,535 kg\nPRECIO 8650,00 $/kg\nTOTAL ###']);
		expect(l).toMatchObject({ total: 21927.75, estado: 'calculado', calculado: 'total' });
	});

	test('con peso y total calcula el precio', () => {
		expect(
			completarConLaCuenta({ producto: null, pesoKg: 0.475, precioKg: null, total: 8051.25, estado: 'incompleto', calculado: null, puntaje: 0 }),
		).toMatchObject({ precioKg: 16950, calculado: 'precio' });
	});

	test('reconoce un producto ya cargado aunque el OCR le erre a una letra', () => {
		const l = leerTicket(['CUARTIROL0 DE CAMP0\nPESO 1,000 kg'], [{ nombre: 'Cuartirolo de campo' }]);
		expect(l.producto).toBe('Cuartirolo de campo');
	});

	test('sin nombre legible, propone el producto por su precio si es único', () => {
		const conocidos = [
			{ nombre: 'Porsalu', precioKg: 8650 },
			{ nombre: 'Sardo', precioKg: 16950 },
		];
		const l = leerTicket(['@@@@\nPESO 2,535 kg\nPRECIO 8650,00\nTOTAL 21927,75'], conocidos);
		expect(l.producto).toBe('Porsalu');
	});
});

describe('cuentas y números', () => {
	test('la cuenta tolera el redondeo al peso entero solo si el total no tiene centavos', () => {
		expect(cierraLaCuenta(2.535, 8650, 21927.75)).toBe(true);
		expect(cierraLaCuenta(2.535, 8650, 21928)).toBe(true);
		expect(cierraLaCuenta(2.535, 8650, 21927.15)).toBe(false);
	});

	test('leerNumero entiende el formato argentino', () => {
		expect(leerNumero('2,535', true)).toBe(2.535);
		expect(leerNumero('2.535', true)).toBe(2.535);
		expect(leerNumero('8.650')).toBe(8650);
		expect(leerNumero('$ 21.927,75')).toBe(21927.75);
		expect(leerNumero('abc')).toBeNull();
	});
});

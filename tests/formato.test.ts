import { describe, expect, test } from 'bun:test';
import { diaYHora, fechaIso, hora, inicioDelDia, nombreDelDia } from '../src/lib/formato';

// 22/11 a las 02:30 UTC: en Argentina todavía es el 21 a las 23:30.
const NOCHE = Date.UTC(2026, 10, 22, 2, 30);

describe('hora argentina (UTC-3)', () => {
	test('muestra la hora de Argentina, en 24 horas', () => {
		expect(hora(NOCHE)).toBe('23:30');
		expect(diaYHora(NOCHE)).toBe('21/11 23:30');
		expect(fechaIso(NOCHE)).toBe('2026-11-21');
	});

	test('el día cambia a la medianoche de Argentina', () => {
		expect(inicioDelDia(NOCHE)).toBe(Date.UTC(2026, 10, 21, 3));
		expect(inicioDelDia(Date.UTC(2026, 10, 22, 3))).toBe(Date.UTC(2026, 10, 22, 3));
		expect(nombreDelDia(NOCHE, Date.UTC(2026, 10, 22, 3))).toBe('Ayer');
	});
});

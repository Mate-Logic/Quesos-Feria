// Números con el formato de Argentina: coma decimal y punto de miles.

const PESOS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
const KILOS = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const NUMERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3, useGrouping: false });

export const pesos = (n: number) => PESOS.format(n);
export const kilos = (n: number) => `${KILOS.format(n)} kg`;

/** Para mostrar un número dentro de un campo editable: sin separador de miles. */
export const numeroEditable = (n: number | null | undefined) => (n == null ? '' : NUMERO.format(n));

/**
 * Lee lo que se escribe en un campo numérico: acepta "2,535", "21.927,75" y
 * "21927.75". Un punto solo seguido de tres dígitos ("8.650") es de miles en
 * los importes y decimal en los kilos (`esPeso`). Devuelve `null` si no es un número.
 */
export function leerNumero(texto: string, esPeso = false): number | null {
	let t = texto.trim().replace(/\s|\$/g, '');
	if (!t) return null;
	const coma = t.lastIndexOf(',');
	const punto = t.lastIndexOf('.');
	if (coma >= 0 && punto >= 0) {
		// El que va último es el decimal.
		t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
	} else if (coma >= 0) {
		t = t.replace(/\./g, '').replace(',', '.');
	} else if (!esPeso && /^\d{1,3}(\.\d{3})+$/.test(t)) {
		t = t.replace(/\./g, '');
	}
	const n = Number(t);
	return Number.isFinite(n) ? n : null;
}

// Fechas y horas: siempre las de Argentina (UTC-3, sin horario de verano), aunque
// el celular tenga otra zona configurada. En la base se guardan milisegundos.
export const ZONA = 'America/Argentina/Buenos_Aires';
const DESFASE = 3 * 3_600_000;
const UN_DIA = 86_400_000;

const DIA = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' });
const HORA = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DIA_CORTO = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit' });

/** "14:05" */
export const hora = (ms: number) => HORA.format(ms);

/** "21/11 14:05" */
export const diaYHora = (ms: number) => `${DIA_CORTO.format(ms)} ${HORA.format(ms)}`;

/** Medianoche argentina del día en que cae `ms`. */
export function inicioDelDia(ms: number): number {
	return Math.floor((ms - DESFASE) / UN_DIA) * UN_DIA + DESFASE;
}

/** "2026-11-21", para los nombres de archivo. */
export const fechaIso = (ms: number) => new Date(ms - DESFASE).toISOString().slice(0, 10);

/** "Hoy", "Ayer" o "Lunes, 23 de noviembre". */
export function nombreDelDia(ms: number, ahora = Date.now()): string {
	const dias = Math.round((inicioDelDia(ahora) - inicioDelDia(ms)) / UN_DIA);
	if (dias === 0) return 'Hoy';
	if (dias === 1) return 'Ayer';
	const texto = DIA.format(ms);
	return texto.charAt(0).toUpperCase() + texto.slice(1);
}

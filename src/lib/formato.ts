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

const DIA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });

export const hora = (ms: number) => HORA.format(ms);

export function inicioDelDia(ms: number): number {
	const d = new Date(ms);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/** "Hoy", "Ayer" o "lunes 23 de noviembre". */
export function nombreDelDia(ms: number, ahora = Date.now()): string {
	const dias = Math.round((inicioDelDia(ahora) - inicioDelDia(ms)) / 86_400_000);
	if (dias === 0) return 'Hoy';
	if (dias === 1) return 'Ayer';
	const texto = DIA.format(ms);
	return texto.charAt(0).toUpperCase() + texto.slice(1);
}

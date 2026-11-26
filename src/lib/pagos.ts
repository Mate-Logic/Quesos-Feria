// Medios de pago con los que se cobra en el puesto. Una venta se puede pagar
// con varios (por ejemplo, varias Cuenta DNI por el tope del reintegro).

/** `debe`: lo que el cliente quedó debiendo; se salda después desde "Ventas del día". */
export type MetodoPago = 'efectivo' | 'debito' | 'credito' | 'cuenta-dni' | 'qr' | 'transferencia' | 'debe';

export interface Pago {
	id: string;
	metodo: MetodoPago;
	monto: number;
	/** Cuándo se cobró, solo si fue después de finalizar la venta (saldar una deuda). */
	momento?: number;
}

/** Medios con los que se paga en el momento (los botones de la hoja de cobro). */
export const METODOS: { id: MetodoPago; nombre: string }[] = [
	{ id: 'efectivo', nombre: 'Efectivo' },
	{ id: 'debito', nombre: 'Débito' },
	{ id: 'credito', nombre: 'Crédito' },
	{ id: 'cuenta-dni', nombre: 'Cuenta DNI' },
	{ id: 'qr', nombre: 'QR / Mercado Pago' },
	{ id: 'transferencia', nombre: 'Transferencia' },
];

const centavos = (n: number) => Math.round(n * 100);

const TODOS = [...METODOS, { id: 'debe' as const, nombre: 'Queda debiendo' }];

export const nombreMetodo = (id: string) => TODOS.find((m) => m.id === id)?.nombre ?? id;

/** Chivilcoy: es de donde son casi todos los clientes. */
const CARACTERISTICA_LOCAL = '2346';

/**
 * El celular en formato internacional (solo dígitos), como lo pide WhatsApp, o
 * `null` si no alcanza para ubicarlo. Se aceptan "2346 123456", "02346 15 123456"
 * o "+54 9 2346 123456" y quedan en "5492346123456". Sin característica (6
 * dígitos) se asume Chivilcoy. Un número de otro país se escribe con "+".
 */
export function celularInternacional(texto: string): string | null {
	const limpio = texto.trim();
	if (!/^\+?[\d\s().-]+$/.test(limpio)) return null;
	let n = limpio.replace(/\D/g, '');
	if (limpio.startsWith('+') && !n.startsWith('54')) return n.length >= 8 && n.length <= 15 ? n : null;
	// Ninguna característica argentina empieza con 54: es el código del país.
	if (n.startsWith('54')) n = n.slice(2).replace(/^9/, '');
	n = n.replace(/^0/, '');
	if (/^(15)?\d{6}$/.test(n)) n = CARACTERISTICA_LOCAL + n.slice(-6);
	// "Característica 15 número": el 15 no va. La característica tiene 2, 3 o 4 dígitos.
	if (n.length === 12) n = n.replace(/^(11|[23]\d{2,3}?)15/, '$1');
	return /^(11|[23]\d)\d{8}$/.test(n) ? `549${n}` : null;
}

export const telefonoValido = (texto: string) => celularInternacional(texto) !== null;

/** Abre el chat con el mensaje ya escrito; lo envía la persona. */
export function enlaceWhatsApp(telefono: string, mensaje: string): string | null {
	const numero = celularInternacional(telefono);
	return numero && `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/** Lo que todavía se debe de una venta. */
export const deuda = (pagos: Pago[] | undefined) =>
	(pagos ?? []).filter((p) => p.metodo === 'debe').reduce((s, p) => s + centavos(p.monto), 0) / 100;

export interface EstadoCobro {
	pagado: number;
	/** Lo que todavía no se pagó (0 si ya está cubierto). */
	falta: number;
	/** Lo que se devuelve en efectivo cuando dieron de más. */
	vuelto: number;
	/** Lo que sobra sin efectivo para devolver: no se puede confirmar así. */
	sobra: number;
	completo: boolean;
}

/** Cuánto se pagó, cuánto falta y si hay vuelto. Trabaja en centavos para no arrastrar errores de redondeo. */
export function estadoCobro(total: number, pagos: Pago[]): EstadoCobro {
	const t = centavos(total);
	const pagado = pagos.reduce((s, p) => s + centavos(p.monto), 0);
	const efectivo = pagos.filter((p) => p.metodo === 'efectivo').reduce((s, p) => s + centavos(p.monto), 0);
	const exceso = Math.max(0, pagado - t);
	const vuelto = Math.min(exceso, efectivo);
	return {
		pagado: pagado / 100,
		falta: Math.max(0, t - pagado) / 100,
		vuelto: vuelto / 100,
		sobra: (exceso - vuelto) / 100,
		completo: pagado >= t && exceso === vuelto,
	};
}

/**
 * Pagos a guardar al confirmar: sin montos en cero y con el vuelto descontado
 * del efectivo, para que la caja refleje lo que realmente quedó.
 */
export function pagosFinales(total: number, pagos: Pago[]): Pago[] {
	let vuelto = centavos(estadoCobro(total, pagos).vuelto);
	const finales = pagos.filter((p) => p.monto > 0).map((p) => ({ ...p }));
	for (const pago of [...finales].reverse()) {
		if (!vuelto) break;
		if (pago.metodo !== 'efectivo') continue;
		const descuento = Math.min(vuelto, centavos(pago.monto));
		pago.monto = (centavos(pago.monto) - descuento) / 100;
		vuelto -= descuento;
	}
	return finales.filter((p) => p.monto > 0);
}

/** "Efectivo + Cuenta DNI ×2": para mostrar cómo se pagó una venta. */
export function resumenPagos(pagos: Pago[] | undefined): string {
	if (!pagos?.length) return '';
	const cuenta = new Map<string, number>();
	for (const p of pagos) cuenta.set(p.metodo, (cuenta.get(p.metodo) ?? 0) + 1);
	return [...cuenta].map(([m, n]) => `${nombreMetodo(m)}${n > 1 ? ` ×${n}` : ''}`).join(' + ');
}

/** Total por medio de pago (lo adeudado va al final), en el orden de los botones. */
export function totalesPorMetodo(pagos: Pago[]): { id: MetodoPago; nombre: string; total: number }[] {
	return TODOS.map((m) => ({
		...m,
		total: pagos.filter((p) => p.metodo === m.id).reduce((s, p) => s + centavos(p.monto), 0) / 100,
	})).filter((m) => m.total > 0);
}

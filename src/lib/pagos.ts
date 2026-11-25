// Medios de pago con los que se cobra en el puesto. Una venta se puede pagar
// con varios (por ejemplo, varias Cuenta DNI por el tope del reintegro).

/** `debe`: lo que el cliente quedó debiendo; se salda después desde "Ventas del día". */
export type MetodoPago = 'efectivo' | 'debito' | 'credito' | 'cuenta-dni' | 'qr' | 'transferencia' | 'debe';

export interface Pago {
	id: string;
	metodo: MetodoPago;
	monto: number;
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

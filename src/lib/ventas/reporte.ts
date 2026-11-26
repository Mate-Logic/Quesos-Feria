// Los números del reporte de un día. Está separado del dibujo del PDF para
// poder testearlo.

import { hora, inicioDelDia } from '../formato';
import { marcaPorId } from '../marcas';
import { deuda, totalesPorMetodo } from '../pagos';
import { claveProducto, type Venta } from './db';

export interface FilaMarca {
	nombre: string;
	productos: number;
	kg: number;
	total: number;
}

export interface FilaProducto extends FilaMarca {
	marca: string;
}

/**
 * Una vela: los importes de las ventas cobradas en una hora. `primera` y
 * `ultima` hacen el cuerpo; `menor` y `mayor`, la mecha.
 */
export interface Vela {
	/** Hora argentina, de 0 a 23. */
	hora: number;
	ventas: number;
	primera: number;
	mayor: number;
	menor: number;
	ultima: number;
	total: number;
}

/** Los números de un día que se comparan entre ferias. */
export interface Totales {
	dia: number;
	total: number;
	cantidadVentas: number;
	productos: number;
	kg: number;
	marcas: FilaMarca[];
}

export interface Reporte {
	/** Comienzo del día del reporte, en milisegundos. */
	dia: number;
	/** Las ventas finalizadas del día, en el orden en que se cobraron. */
	ventas: Venta[];
	total: number;
	productos: number;
	kg: number;
	marcas: FilaMarca[];
	porProducto: FilaProducto[];
	pagos: { nombre: string; total: number }[];
	/**
	 * Lo vendido menos lo anotado en los pagos. No es cero si hay ventas viejas
	 * sin pagos o si se corrigió un precio después de cobrar.
	 */
	sinPago: number;
	deudas: { venta: Venta; monto: number }[];
	/** Solo las horas en las que hubo ventas, en orden. */
	porHora: Vela[];
	/** El último día con ventas antes de este, si lo hay. */
	anterior: Totales | null;
}

const sumar = (valores: number[]) => valores.reduce((s, v) => s + Math.round(v * 100), 0) / 100;
const sumarKg = (valores: number[]) => valores.reduce((s, v) => s + Math.round(v * 1000), 0) / 1000;

const importe = (venta: Venta) => sumar(venta.productos.map((p) => p.total));

/** Las ventas ya ordenadas por hora de cobro. */
function velas(ventas: Venta[]): Vela[] {
	const horas = new Map<number, number[]>();
	for (const venta of ventas) {
		const h = Number(hora(venta.finalizada ?? venta.creada).slice(0, 2));
		horas.set(h, [...(horas.get(h) ?? []), importe(venta)]);
	}
	return [...horas]
		.sort(([a], [b]) => a - b)
		.map(([h, importes]) => ({
			hora: h,
			ventas: importes.length,
			primera: importes[0]!,
			mayor: Math.max(...importes),
			menor: Math.min(...importes),
			ultima: importes.at(-1)!,
			total: sumar(importes),
		}));
}

export function armarReporte(todas: Venta[], dia: number): Reporte {
	const inicio = inicioDelDia(dia);
	const previos = todas
		.filter((v) => v.estado === 'finalizada')
		.map((v) => inicioDelDia(v.finalizada ?? v.creada))
		.filter((d) => d < inicio);
	let anterior: Totales | null = null;
	if (previos.length) {
		const r = resumirDia(todas, Math.max(...previos));
		anterior = { dia: r.dia, total: r.total, cantidadVentas: r.ventas.length, productos: r.productos, kg: r.kg, marcas: r.marcas };
	}
	return { ...resumirDia(todas, inicio), anterior };
}

function resumirDia(todas: Venta[], inicio: number): Omit<Reporte, 'anterior'> {
	const ventas = todas
		.filter((v) => v.estado === 'finalizada' && inicioDelDia(v.finalizada ?? v.creada) === inicio)
		.sort((a, b) => (a.finalizada ?? a.creada) - (b.finalizada ?? b.creada));
	const items = ventas.flatMap((v) => v.productos);
	const pagos = ventas.flatMap((v) => v.pagos ?? []);
	const total = sumar(items.map((p) => p.total));

	const marcas = new Map<string, FilaMarca>();
	const porProducto = new Map<string, FilaProducto>();
	const acumular = (fila: FilaMarca, item: (typeof items)[number]) => {
		fila.productos += 1;
		fila.kg = sumarKg([fila.kg, item.pesoKg ?? 0]);
		fila.total = sumar([fila.total, item.total]);
	};
	for (const item of items) {
		const marca = marcaPorId(item.marca)?.nombre ?? item.marca;
		let deMarca = marcas.get(marca);
		if (!deMarca) marcas.set(marca, (deMarca = { nombre: marca, productos: 0, kg: 0, total: 0 }));
		acumular(deMarca, item);

		const clave = `${marca}|${claveProducto(item.producto)}`;
		let deProducto = porProducto.get(clave);
		if (!deProducto) porProducto.set(clave, (deProducto = { nombre: item.producto.trim(), marca, productos: 0, kg: 0, total: 0 }));
		acumular(deProducto, item);
	}

	return {
		dia: inicio,
		ventas,
		total,
		productos: items.length,
		kg: sumarKg(items.map((p) => p.pesoKg ?? 0)),
		marcas: [...marcas.values()].sort((a, b) => b.total - a.total),
		porProducto: [...porProducto.values()].sort((a, b) => b.total - a.total),
		pagos: totalesPorMetodo(pagos).map(({ nombre, total }) => ({ nombre, total })),
		sinPago: sumar([total, -sumar(pagos.map((p) => p.monto))]),
		deudas: ventas.map((venta) => ({ venta, monto: deuda(venta.pagos) })).filter((d) => d.monto > 0),
		porHora: velas(ventas),
	};
}

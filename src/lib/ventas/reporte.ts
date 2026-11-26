// Los números del reporte de un día. Está separado del dibujo del PDF para
// poder testearlo.

import { inicioDelDia } from '../formato';
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
}

const sumar = (valores: number[]) => valores.reduce((s, v) => s + Math.round(v * 100), 0) / 100;
const sumarKg = (valores: number[]) => valores.reduce((s, v) => s + Math.round(v * 1000), 0) / 1000;

export function armarReporte(todas: Venta[], dia: number): Reporte {
	const inicio = inicioDelDia(dia);
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
	};
}

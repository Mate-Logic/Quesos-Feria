// Exporta las ventas finalizadas a CSV para abrirlas en Excel o Google Sheets.
// Funciona sin conexión: el archivo se arma en el celular y se descarga o se comparte.

import { marcaPorId } from '../marcas';
import { nombreMetodo } from '../pagos';
import type { Venta } from './db';

const FECHA = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });
const DECIMAL = new Intl.NumberFormat('es-AR', { useGrouping: false, maximumFractionDigits: 3 });

export function ventasACsv(ventas: Venta[]): string {
	const finalizadas = ventas.filter((venta) => venta.estado === 'finalizada');
	const filas = [
		['Venta', 'Fecha', 'Hora', 'Cliente', 'Marca', 'Producto', 'Peso (kg)', 'Precio por kg', 'Total', 'Origen', 'Pago de la venta', 'Nota'],
		...[...finalizadas]
			.sort((a, b) => a.creada - b.creada)
			.flatMap((venta) =>
				venta.productos.map((producto) => [
					venta.id,
					FECHA.format(venta.finalizada ?? venta.creada),
					HORA.format(venta.finalizada ?? venta.creada),
					venta.cliente,
					marcaPorId(producto.marca)?.nombre ?? producto.marca,
					producto.producto,
					producto.pesoKg == null ? '' : DECIMAL.format(producto.pesoKg),
					producto.precioKg == null ? '' : DECIMAL.format(producto.precioKg),
					DECIMAL.format(producto.total),
					producto.origen === 'ticket' ? 'Ticket' : 'A mano',
					(venta.pagos ?? []).map((p) => `${nombreMetodo(p.metodo)} ${DECIMAL.format(p.monto)}`).join(' + '),
					venta.nota ?? '',
				]),
			),
	];
	// Punto y coma y coma decimal: es lo que espera Excel configurado en español.
	// El BOM hace que Excel reconozca los acentos (UTF-8).
	return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
}

function celda(valor: string): string {
	return /[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/** Comparte el CSV (WhatsApp, mail, Drive...) si el celular lo permite; si no, lo descarga. */
export async function exportarVentas(ventas: Venta[]): Promise<void> {
	const fecha = new Date().toISOString().slice(0, 10);
	const archivo = new File([ventasACsv(ventas)], `ventas-feria-${fecha}.csv`, { type: 'text/csv' });
	if (navigator.canShare?.({ files: [archivo] })) {
		try {
			await navigator.share({ files: [archivo], title: 'Ventas de feria' });
			return;
		} catch (error) {
			if ((error as DOMException).name === 'AbortError') return;
		}
	}
	const url = URL.createObjectURL(archivo);
	const enlace = document.createElement('a');
	enlace.href = url;
	enlace.download = archivo.name;
	document.body.append(enlace);
	enlace.click();
	enlace.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

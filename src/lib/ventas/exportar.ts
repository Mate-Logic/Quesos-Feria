// Exporta las ventas a CSV para abrirlas en Excel o Google Sheets.
// Funciona sin conexión: el archivo se arma en el celular y se descarga o se comparte.

import { marcaPorId } from '../marcas';
import type { Venta } from './db';

const FECHA = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });
const DECIMAL = new Intl.NumberFormat('es-AR', { useGrouping: false, maximumFractionDigits: 3 });

export function ventasACsv(ventas: Venta[]): string {
	const filas = [
		['Fecha', 'Hora', 'Marca', 'Producto', 'Peso (kg)', 'Precio por kg', 'Total', 'Origen'],
		...[...ventas]
			.sort((a, b) => a.creada - b.creada)
			.map((v) => [
				FECHA.format(v.creada),
				HORA.format(v.creada),
				marcaPorId(v.marca)?.nombre ?? v.marca,
				v.producto,
				v.pesoKg == null ? '' : DECIMAL.format(v.pesoKg),
				v.precioKg == null ? '' : DECIMAL.format(v.precioKg),
				DECIMAL.format(v.total),
				v.origen === 'ticket' ? 'Ticket' : 'A mano',
			]),
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
			// Si se canceló a propósito no se descarga.
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

// El reporte del día en PDF (hoja A4, para imprimir). Se arma en el celular,
// sin conexión. Se carga recién al pedirlo, para no demorar el inicio.

import { jsPDF } from 'jspdf';
import { autoTable, type RowInput, type UserOptions } from 'jspdf-autotable';
import { diaYHora, hora, kilos, pesos, ZONA } from '../formato';
import { marcaPorId } from '../marcas';
import { nombreMetodo } from '../pagos';
import type { Reporte } from './reporte';

const ROSA: [number, number, number] = [232, 31, 118];
const CELESTE: [number, number, number] = [0, 174, 195];
const MARGEN = 14;

const FECHA = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const MOMENTO = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Las fuentes del PDF solo tienen el alfabeto latino: lo demás (emojis, etc.) saldría como basura. */
const limpiar = (texto: string) => texto.replace(/\s/g, ' ').replace(/[^\x20-\x7e\xa0-\xff–—‘’“”…•€]/gu, '').trim();

export function reporteAPdf(reporte: Reporte, emitido = Date.now()): jsPDF {
	const doc = new jsPDF({ unit: 'mm', format: 'a4' });
	const ancho = doc.internal.pageSize.getWidth();
	const alto = doc.internal.pageSize.getHeight();
	const fecha = FECHA.format(reporte.dia);
	doc.setProperties({ title: limpiar(`Reporte de ventas - ${fecha}`) });

	// Encabezado: dos franjas finas con los colores de la feria (gastan poca tinta).
	doc.setFillColor(...ROSA).rect(MARGEN, 10, (ancho - 2 * MARGEN) / 2, 2, 'F');
	doc.setFillColor(...CELESTE).rect(ancho / 2, 10, (ancho - 2 * MARGEN) / 2, 2, 'F');
	doc.setFont('helvetica', 'bold').setFontSize(18).text('Lácteos Huella Pampa', MARGEN, 21);
	doc.setFont('helvetica', 'normal').setFontSize(11).text('Reporte de ventas · Mercados Bonaerenses', MARGEN, 27);
	doc.text(limpiar(fecha.charAt(0).toUpperCase() + fecha.slice(1)), MARGEN, 33);

	doc.setFont('helvetica', 'bold').setFontSize(24).text(limpiar(pesos(reporte.total)), ancho - MARGEN, 24, { align: 'right' });
	const resumen = `${reporte.ventas.length} ${reporte.ventas.length === 1 ? 'venta' : 'ventas'} · ${reporte.productos} ${reporte.productos === 1 ? 'producto' : 'productos'} · ${kilos(reporte.kg)}`;
	doc.setFont('helvetica', 'normal').setFontSize(10).text(limpiar(resumen), ancho - MARGEN, 31, { align: 'right' });

	let y = 42;
	/** Título y tabla. `numeros` son las columnas alineadas a la derecha. */
	const seccion = (titulo: string, encabezado: string[], filas: RowInput[], numeros: number[], extra: UserOptions = {}) => {
		// Que el título no quede solo al pie de una hoja.
		if (y > alto - 45) {
			doc.addPage();
			y = 18;
		}
		doc.setFont('helvetica', 'bold').setFontSize(12).text(titulo, MARGEN, y);
		autoTable(doc, {
			startY: y + 2.5,
			margin: { left: MARGEN, right: MARGEN, bottom: 18 },
			head: [encabezado],
			body: filas,
			theme: 'grid',
			styles: { fontSize: 9, cellPadding: 1.6, textColor: 20, lineColor: 200, valign: 'top' },
			headStyles: { fillColor: 235, textColor: 20, fontStyle: 'bold' },
			footStyles: { fillColor: 245, textColor: 20, fontStyle: 'bold' },
			showFoot: 'lastPage',
			rowPageBreak: 'avoid',
			...extra,
			didParseCell: (celda) => {
				if (numeros.includes(celda.column.index)) celda.cell.styles.halign = 'right';
			},
		});
		y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
	};

	const pagos = reporte.pagos.map((p) => [p.nombre, pesos(p.total)]);
	if (reporte.sinPago !== 0) pagos.push(['Diferencia sin pago anotado', pesos(reporte.sinPago)]);
	seccion('Cómo se cobró', ['Medio de pago', 'Importe'], pagos.map((f) => f.map(limpiar)), [1], {
		foot: [['Total', limpiar(pesos(reporte.total))]],
	});

	if (reporte.deudas.length) {
		seccion(
			'Quedaron debiendo',
			['Cliente', 'Nota', 'Hora', 'Debe'],
			reporte.deudas.map(({ venta, monto }) =>
				[venta.cliente || 'Sin nombre', venta.nota ?? '', hora(venta.finalizada ?? venta.creada), pesos(monto)].map(limpiar),
			),
			[3],
		);
	}

	seccion(
		'Por marca',
		['Marca', 'Productos', 'Kilos', 'Importe'],
		reporte.marcas.map((m) => [m.nombre, String(m.productos), m.kg ? kilos(m.kg) : '-', pesos(m.total)].map(limpiar)),
		[1, 2, 3],
	);

	seccion(
		'Por producto',
		['Producto', 'Marca', 'Cantidad', 'Kilos', 'Importe'],
		reporte.porProducto.map((p) => [p.nombre, p.marca, String(p.productos), p.kg ? kilos(p.kg) : '-', pesos(p.total)].map(limpiar)),
		[2, 3, 4],
	);

	seccion(
		'Detalle de cada venta',
		['Hora', 'Cliente', 'Productos', 'Pago', 'Total'],
		reporte.ventas.map((venta) =>
			[
				hora(venta.finalizada ?? venta.creada),
				venta.cliente || '-',
				venta.productos
					.map((p) => {
						const peso = p.pesoKg == null ? '' : ` ${kilos(p.pesoKg)}`;
						return limpiar(`${p.producto} (${marcaPorId(p.marca)?.nombre ?? p.marca})${peso}: ${pesos(p.total)}`);
					})
					.join('\n'),
				(venta.pagos ?? [])
					.map((p) => limpiar(`${nombreMetodo(p.metodo)} ${pesos(p.monto)}${p.momento ? ` (cobrado ${diaYHora(p.momento)})` : ''}`))
					.join('\n'),
				pesos(venta.productos.reduce((s, p) => s + p.total, 0)),
			].map((celda) => celda.split('\n').map(limpiar).join('\n')),
		),
		[4],
		{ columnStyles: { 0: { cellWidth: 13 }, 1: { cellWidth: 26 }, 3: { cellWidth: 52 }, 4: { cellWidth: 25 } } },
	);

	const paginas = doc.getNumberOfPages();
	for (let pagina = 1; pagina <= paginas; pagina++) {
		doc.setPage(pagina);
		doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90);
		doc.text(limpiar(`Emitido el ${MOMENTO.format(emitido)}`), MARGEN, alto - 8);
		doc.text(`Página ${pagina} de ${paginas}`, ancho - MARGEN, alto - 8, { align: 'right' });
	}
	return doc;
}

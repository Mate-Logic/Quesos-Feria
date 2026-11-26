// El reporte del día en PDF (hoja A4, para imprimir). Se arma en el celular,
// sin conexión. Se carga recién al pedirlo, para no demorar el inicio.

import { jsPDF } from 'jspdf';
import { autoTable, type RowInput, type UserOptions } from 'jspdf-autotable';
import { diaYHora, hora, kilos, pesos, ZONA } from '../formato';
import { marcaPorId } from '../marcas';
import { nombreMetodo } from '../pagos';
import type { FilaProducto, Reporte } from './reporte';

// Se imprime en blanco y negro, en A4: nada se distingue por color, solo por
// negro, grises y relleno. Las líneas no son muy claras para que no se pierdan.
const NEGRO = '#141414';
const GRIS_BARRA = '#464646';
const GRIS_LINEA = '#969696';
const GRIS_ENCABEZADO = '#dedede';
const MARGEN = 15;

const FECHA = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const CORTA = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, weekday: 'short', day: '2-digit', month: '2-digit' });
const MOMENTO = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Las fuentes del PDF solo tienen el alfabeto latino: lo demás (emojis, etc.) saldría como basura. */
const limpiar = (texto: string) => texto.replace(/\s/g, ' ').replace(/[^\x20-\x7e\xa0-\xff–—‘’“”…•€]/gu, '').trim();

export function reporteAPdf(reporte: Reporte, emitido = Date.now()): jsPDF {
	const doc = new jsPDF({ unit: 'mm', format: 'a4' });
	const ancho = doc.internal.pageSize.getWidth();
	const alto = doc.internal.pageSize.getHeight();
	const fecha = FECHA.format(reporte.dia);
	doc.setProperties({ title: limpiar(`Reporte de ventas - ${fecha}`) });

	// Encabezado: una línea gruesa (gasta poca tinta).
	doc.setFillColor(NEGRO).rect(MARGEN, 10, ancho - 2 * MARGEN, 1.2, 'F');
	doc.setFont('helvetica', 'bold').setFontSize(18).text('Lácteos Huella Pampa', MARGEN, 21);
	doc.setFont('helvetica', 'normal').setFontSize(11).text('Reporte de ventas · Mercados Bonaerenses', MARGEN, 27);
	doc.text(limpiar(fecha.charAt(0).toUpperCase() + fecha.slice(1)), MARGEN, 33);

	doc.setFont('helvetica', 'bold').setFontSize(24).text(limpiar(pesos(reporte.total)), ancho - MARGEN, 24, { align: 'right' });
	const resumen = `${reporte.ventas.length} ${reporte.ventas.length === 1 ? 'venta' : 'ventas'} · ${reporte.productos} ${reporte.productos === 1 ? 'producto' : 'productos'} · ${kilos(reporte.kg)}`;
	doc.setFont('helvetica', 'normal').setFontSize(10).text(limpiar(resumen), ancho - MARGEN, 31, { align: 'right' });

	let y = 42;
	/** Título y tabla. `numeros` son las columnas alineadas a la derecha. */
	const seccion = (titulo: string, encabezado: string[], filas: RowInput[], numeros: number[], extra: UserOptions = {}) => {
		// Una tabla que entra en una hoja no se corta: pasa entera a la siguiente.
		// Si es más larga que una hoja, al menos el título no queda solo al pie.
		const estimado = 14 + (filas.length + 2) * 7.2;
		if (y + (estimado < alto - 40 ? estimado : 45) > alto - 18) {
			doc.addPage();
			y = 18;
		}
		doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(NEGRO).text(titulo, MARGEN, y);
		autoTable(doc, {
			startY: y + 2.5,
			margin: { left: MARGEN, right: MARGEN, bottom: 18 },
			head: [encabezado],
			body: filas,
			theme: 'grid',
			styles: { fontSize: 10, cellPadding: 1.5, textColor: NEGRO, lineColor: GRIS_LINEA, valign: 'top' },
			headStyles: { fillColor: GRIS_ENCABEZADO, textColor: NEGRO, fontStyle: 'bold' },
			footStyles: { fillColor: 240, textColor: NEGRO, fontStyle: 'bold' },
			showFoot: 'lastPage',
			rowPageBreak: 'avoid',
			...extra,
			didParseCell: (celda) => {
				if (numeros.includes(celda.column.index)) celda.cell.styles.halign = 'right';
			},
		});
		y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
	};

	const { anterior } = reporte;
	if (anterior) {
		const fila = (nombre: string, antes: number, ahora: number, formato: (n: number) => string) => {
			const dif = Math.round((ahora - antes) * 1000) / 1000;
			const signo = dif > 0 ? '+ ' : dif < 0 ? '- ' : '';
			const porciento = antes ? ` (${signo}${Math.round((Math.abs(dif) / antes) * 100)} %)` : ' (nuevo)';
			return [nombre, formato(antes), formato(ahora), `${signo}${formato(Math.abs(dif))}${porciento}`].map(limpiar);
		};
		const promedio = (total: number, n: number) => (n ? Math.round((total / n) * 100) / 100 : 0);
		const marcas = [...new Set([...reporte.marcas, ...anterior.marcas].map((m) => m.nombre))];
		const totalDe = (lista: typeof reporte.marcas, nombre: string) => lista.find((m) => m.nombre === nombre)?.total ?? 0;
		seccion(
			'Comparación con la feria anterior',
			['', limpiar(CORTA.format(anterior.dia)), limpiar(CORTA.format(reporte.dia)), 'Diferencia'],
			[
				fila('Total vendido', anterior.total, reporte.total, pesos),
				fila('Ventas', anterior.cantidadVentas, reporte.ventas.length, String),
				fila('Promedio por venta', promedio(anterior.total, anterior.cantidadVentas), promedio(reporte.total, reporte.ventas.length), pesos),
				fila('Productos', anterior.productos, reporte.productos, String),
				fila('Kilos', anterior.kg, reporte.kg, kilos),
				...marcas.map((m) => fila(m, totalDe(anterior.marcas, m), totalDe(reporte.marcas, m), pesos)),
			],
			[1, 2, 3],
		);
	}

	const pagos = reporte.pagos.map((p) => [p.nombre, pesos(p.total)]);
	if (reporte.sinPago !== 0) pagos.push(['Diferencia sin pago anotado', pesos(reporte.sinPago)]);
	seccion('Cómo se cobró', ['Medio de pago', 'Importe'], pagos.map((f) => f.map(limpiar)), [1], {
		foot: [['Total', limpiar(pesos(reporte.total))]],
	});

	if (reporte.deudas.length) {
		seccion(
			'Quedaron debiendo',
			['Cliente', 'Celular', 'Nombre / nota', 'Hora', 'Debe'],
			reporte.deudas.map(({ venta, monto }) =>
				[venta.cliente || 'Sin nombre', venta.telefono ?? 'Sin anotar', venta.nota ?? '', hora(venta.finalizada ?? venta.creada), pesos(monto)].map(limpiar),
			),
			[4],
		);
	}

	/** Deja lugar en la hoja para un bloque de `altura` mm. */
	const lugar = (altura: number) => {
		if (y + altura > alto - 18) {
			doc.addPage();
			y = 18;
		}
	};

	/** Barras horizontales de los 8 primeros, con el valor al final de cada una. */
	const barras = (titulo: string, filas: FilaProducto[], valor: (f: FilaProducto) => number, texto: (f: FilaProducto) => string) => {
		const primeras = [...filas].sort((a, b) => valor(b) - valor(a)).slice(0, 8);
		if (!primeras.length) return;
		lugar(primeras.length * 7 + 8);
		doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(NEGRO).text(titulo, MARGEN, y);
		y += 3;
		const izquierda = MARGEN + 62;
		const largo = ancho - MARGEN - izquierda - 34;
		const maximo = Math.max(...primeras.map(valor)) || 1;
		doc.setFont('helvetica', 'normal').setFontSize(9);
		for (const f of primeras) {
			const nombre = doc.splitTextToSize(limpiar(`${f.nombre} (${f.marca})`), 59) as string[];
			doc.setTextColor(NEGRO).text(nombre.length > 1 ? `${nombre[0]}…` : nombre[0]!, izquierda - 2, y + 3.8, { align: 'right' });
			const w = Math.max(0.8, (valor(f) / maximo) * largo);
			doc.setFillColor(GRIS_BARRA).rect(izquierda, y + 0.8, w, 4.4, 'F');
			doc.text(limpiar(texto(f)), izquierda + w + 2, y + 3.8);
			y += 7;
		}
		doc.setDrawColor(GRIS_LINEA).setLineWidth(0.2).line(izquierda, y - primeras.length * 7, izquierda, y);
		y += 9;
	};

	barras('Productos más vendidos (veces vendido)', reporte.porProducto, (f) => f.productos, (f) => `${f.productos}${f.kg ? ` · ${kilos(f.kg)}` : ''}`);
	barras('Productos que más plata dejaron', reporte.porProducto, (f) => f.total, (f) => pesos(f.total));

	/** Velas por hora: hueca = la última fue igual o mayor; negra = fue menor. */
	const graficoVelas = () => {
		const velas = reporte.porHora;
		if (!velas.length) return;
		lugar(88);
		doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(NEGRO).text('Velas por hora (importe de cada venta)', MARGEN, y);
		doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor('#3c3c3c');
		doc.text('Mecha: de la venta más chica a la más grande de la hora. Cuerpo: entre la primera y la última venta.', MARGEN, y + 4.5);
		doc.setDrawColor(NEGRO).setLineWidth(0.5).rect(MARGEN, y + 7, 3, 3, 'S');
		doc.text('La última fue igual o mayor que la primera', MARGEN + 5, y + 9.5);
		doc.setFillColor(NEGRO).rect(MARGEN + 80, y + 7, 3, 3, 'F');
		doc.text('La última fue menor', MARGEN + 85, y + 9.5);

		const arriba = y + 15;
		const base = arriba + 55;
		const izquierda = MARGEN + 24;
		// Tope "redondo" para que las líneas de referencia tengan números limpios.
		const mayor = Math.max(...velas.map((v) => v.mayor)) || 1;
		const escala = 10 ** Math.floor(Math.log10(mayor));
		const tope = [1, 2, 2.5, 5, 10].map((n) => n * escala).find((n) => n >= mayor)!;
		const altura = (n: number) => base - (n / tope) * (base - arriba);
		for (let i = 0; i <= 4; i++) {
			const n = (tope / 4) * i;
			doc.setDrawColor('#b9b9b9').setLineWidth(0.2).line(izquierda, altura(n), ancho - MARGEN, altura(n));
			doc.text(limpiar(pesos(n).replace(/,00$/, '')), izquierda - 2, altura(n) + 1, { align: 'right' });
		}
		// Las horas sin ventas dejan su lugar vacío.
		const desde = velas[0]!.hora;
		const columnas = velas.at(-1)!.hora - desde + 1;
		const paso = (ancho - MARGEN - izquierda) / columnas;
		const grosor = Math.min(6, paso * 0.6);
		for (let i = 0; i < columnas; i++) {
			doc.text(`${desde + i} h`, izquierda + paso * (i + 0.5), base + 4, { align: 'center' });
		}
		for (const v of velas) {
			const x = izquierda + paso * (v.hora - desde + 0.5);
			const sube = v.ultima >= v.primera;
			const cima = altura(Math.max(v.primera, v.ultima));
			const cuerpo = Math.max(0.6, altura(Math.min(v.primera, v.ultima)) - cima);
			doc.setDrawColor(NEGRO).setLineWidth(0.5).line(x, altura(v.mayor), x, altura(v.menor));
			doc.setFillColor(sube ? '#ffffff' : NEGRO).rect(x - grosor / 2, cima, grosor, cuerpo, 'FD');
		}
		y = base + 14;
	};
	graficoVelas();

	seccion(
		'Ventas por hora',
		['Hora', 'Ventas', 'Primera', 'Mayor', 'Menor', 'Última', 'Total'],
		reporte.porHora.map((v) =>
			[`${v.hora} h`, String(v.ventas), pesos(v.primera), pesos(v.mayor), pesos(v.menor), pesos(v.ultima), pesos(v.total)].map(limpiar),
		),
		[1, 2, 3, 4, 5, 6],
	);

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

	// Una tabla por venta: qué se llevó y, debajo, cómo la pagó.
	lugar(40);
	doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(NEGRO).text('Detalle de cada venta', MARGEN, y);
	y += 3;
	reporte.ventas.forEach((venta, i) => {
		const total = venta.productos.reduce((s, p) => s + Math.round(p.total * 100), 0) / 100;
		const titulo = `Venta ${i + 1} · ${hora(venta.finalizada ?? venta.creada)}${venta.cliente ? ` · ${venta.cliente}` : ''}`;
		const pagado = (venta.pagos ?? []).map((p) => {
			if (p.metodo === 'debe') return `Quedó debiendo ${pesos(p.monto)}`;
			return `${nombreMetodo(p.metodo)} ${pesos(p.monto)}${p.momento ? ` (cobrado ${diaYHora(p.momento)})` : ''}`;
		});
		const nota = `${venta.nota ? `\nNota: ${limpiar(venta.nota)}` : ''}${venta.telefono ? `\nCelular: ${limpiar(venta.telefono)}` : ''}`;
		autoTable(doc, {
			startY: y,
			margin: { left: MARGEN, right: MARGEN, bottom: 18, top: 18 },
			pageBreak: 'avoid',
			rowPageBreak: 'avoid',
			theme: 'grid',
			styles: { fontSize: 10, cellPadding: 1.3, textColor: NEGRO, lineColor: GRIS_LINEA },
			headStyles: { fillColor: GRIS_ENCABEZADO, textColor: NEGRO, fontStyle: 'bold' },
			footStyles: { fillColor: 255, textColor: NEGRO, fontStyle: 'bold' },
			// Los encabezados de las columnas con números, alineados como los números.
			didParseCell: (celda) => {
				if (celda.section === 'head' && celda.row.index === 1 && celda.column.index >= 2) celda.cell.styles.halign = 'right';
			},
			showFoot: 'lastPage',
			columnStyles: { 1: { cellWidth: 32 }, 2: { cellWidth: 24, halign: 'right' }, 3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 30, halign: 'right' } },
			head: [
				[
					{ content: limpiar(titulo), colSpan: 4 },
					{ content: limpiar(pesos(total)), styles: { halign: 'right' } },
				],
				['Producto', 'Marca', 'Peso', 'Precio por kg', 'Importe'],
			],
			body: venta.productos.map((p) =>
				[
					p.producto,
					marcaPorId(p.marca)?.nombre ?? p.marca,
					p.pesoKg == null ? '-' : kilos(p.pesoKg),
					p.precioKg == null ? '-' : pesos(p.precioKg),
					pesos(p.total),
				].map(limpiar),
			),
			foot: [[{ content: `Cómo pagó: ${pagado.length ? pagado.map(limpiar).join(' + ') : 'sin pago anotado'}${nota}`, colSpan: 5 }]],
		});
		y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
	});

	const paginas = doc.getNumberOfPages();
	for (let pagina = 1; pagina <= paginas; pagina++) {
		doc.setPage(pagina);
		doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor('#3c3c3c');
		doc.text(limpiar(`Emitido el ${MOMENTO.format(emitido)}`), MARGEN, alto - 8);
		doc.text(`Página ${pagina} de ${paginas}`, ancho - MARGEN, alto - 8, { align: 'right' });
	}
	return doc;
}

// Arma el reporte del día en PDF y lo manda por WhatsApp (o lo que se elija en
// el menú de compartir). Funciona sin conexión: el archivo se arma en el celular.

import type { Venta } from './db';
import { armarReporte } from './reporte';

/** `descargado`: el navegador no puede compartir archivos y hay que adjuntarlo a mano. */
export async function compartirReporte(ventas: Venta[], dia: number): Promise<'compartido' | 'descargado'> {
	const { reporteAPdf } = await import('./pdf');
	const reporte = armarReporte(ventas, dia);
	// La fecha del nombre es la local: con toISOString una feria de noche quedaría con la del día siguiente.
	const d = new Date(reporte.dia);
	const fecha = [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
	const archivo = new File([reporteAPdf(reporte).output('blob')], `reporte-ventas-${fecha}.pdf`, { type: 'application/pdf' });

	if (navigator.canShare?.({ files: [archivo] })) {
		try {
			await navigator.share({ files: [archivo], title: 'Reporte de ventas' });
			return 'compartido';
		} catch (error) {
			// Cerró el menú sin elegir nada: no hay que descargar.
			if ((error as DOMException).name === 'AbortError') return 'compartido';
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
	return 'descargado';
}

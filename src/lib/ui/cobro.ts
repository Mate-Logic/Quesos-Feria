// Controla la hoja de cobro de src/components/Cobro.astro.

import { leerNumero, numeroEditable, pesos } from '../formato';
import { estadoCobro, nombreMetodo, pagosFinales, type MetodoPago, type Pago } from '../pagos';
import { nuevoId, type Venta } from '../ventas/db';

export interface ResultadoCobro {
	/** `confirmar`: se cobró. `volver`: queda pendiente con lo que se cargó. */
	accion: 'confirmar' | 'volver';
	pagos: Pago[];
	nota: string;
}

export interface OpcionesCobro {
	/** Texto debajo del título, por ejemplo "Venta 2 · Juan". */
	detalle: string;
	/** Para saldar una deuda: se cobra solo lo adeudado, sin pagos previos. */
	deuda?: number;
}

export function abrirCobro(venta: Venta, opciones: OpcionesCobro): Promise<ResultadoCobro> {
	const dialogo = document.getElementById('cobro') as HTMLDialogElement;
	const form = document.getElementById('cobro-form') as HTMLFormElement;
	const titulo = document.getElementById('cobro-titulo')!;
	const detalle = document.getElementById('cobro-venta')!;
	const totalTexto = document.getElementById('cobro-total')!;
	const estado = document.getElementById('cobro-estado')!;
	const lista = document.getElementById('cobro-pagos')!;
	const volver = document.getElementById('cobro-volver') as HTMLButtonElement;
	const confirmar = document.getElementById('cobro-confirmar') as HTMLButtonElement;
	const botonNota = document.getElementById('cobro-nota-boton') as HTMLButtonElement;
	const botonDebe = document.getElementById('cobro-debe') as HTMLButtonElement;
	const campoNota = document.getElementById('cobro-nota-campo')!;
	const etiquetaNota = document.getElementById('cobro-nota-etiqueta')!;
	const nota = document.getElementById('cobro-nota') as HTMLInputElement;
	const metodos = form.querySelectorAll<HTMLButtonElement>('[data-metodo]');

	const saldando = opciones.deuda != null;
	const total = opciones.deuda ?? venta.productos.reduce((s, p) => s + p.total, 0);
	const pagos: Pago[] = saldando ? [] : (venta.pagos ?? []).map((p) => ({ ...p }));
	let lleno = false;

	titulo.textContent = saldando ? 'Cobrar deuda' : 'Cobrar';
	detalle.textContent = opciones.detalle;
	totalTexto.textContent = pesos(total);
	nota.value = venta.nota ?? '';
	confirmar.textContent = saldando ? 'Confirmar pago' : 'Confirmar cobro';

	const hayDeuda = () => pagos.some((p) => p.metodo === 'debe');
	// Si alguien queda debiendo, hay que anotar quién es para poder cobrarle después.
	const faltaNota = () => hayDeuda() && !nota.value.trim();

	function mostrarNota(visible: boolean) {
		campoNota.hidden = !visible;
		botonNota.setAttribute('aria-pressed', String(visible));
		etiquetaNota.textContent = hayDeuda() ? '¿Quién debe? Nombre y teléfono' : 'Nota';
		nota.placeholder = hayDeuda() ? 'Ej.: Marta, 11 2345-6789' : 'Algo para recordar de este cobro';
	}

	function actualizarEstado() {
		const e = estadoCobro(total, pagos);
		if (e.sobra > 0) {
			delete estado.dataset.tipo;
			estado.textContent = `Sobran ${pesos(e.sobra)}: revisá los montos`;
		} else if (e.falta > 0) {
			delete estado.dataset.tipo;
			estado.textContent = `Falta cobrar ${pesos(e.falta)}`;
		} else if (faltaNota()) {
			delete estado.dataset.tipo;
			estado.textContent = 'Anotá quién queda debiendo';
		} else {
			estado.dataset.tipo = 'ok';
			estado.textContent = e.vuelto > 0 ? `Vuelto: ${pesos(e.vuelto)}` : '✓ Está todo cobrado';
		}
		botonDebe.setAttribute('aria-pressed', String(hayDeuda()));
		if (faltaNota()) nota.setAttribute('aria-invalid', 'true');
		else nota.removeAttribute('aria-invalid');
		confirmar.disabled = !e.completo || faltaNota();
	}

	function fila(pago: Pago): HTMLLIElement {
		const li = document.createElement('li');
		li.className = 'pago';
		const nombre = document.createElement('span');
		nombre.className = 'pago-nombre';
		nombre.textContent = nombreMetodo(pago.metodo);
		const monto = document.createElement('label');
		monto.className = 'pago-monto';
		const signo = document.createElement('span');
		signo.textContent = '$';
		const input = document.createElement('input');
		input.type = 'text';
		input.inputMode = 'decimal';
		input.autocomplete = 'off';
		input.value = numeroEditable(pago.monto);
		input.setAttribute('aria-label', `Monto en ${nombreMetodo(pago.metodo)}`);
		input.addEventListener('input', () => {
			pago.monto = Math.max(0, leerNumero(input.value) ?? 0);
			actualizarEstado();
		});
		monto.append(signo, input);
		const quitar = document.createElement('button');
		quitar.type = 'button';
		quitar.className = 'pago-quitar';
		quitar.textContent = '✕';
		quitar.setAttribute('aria-label', `Quitar ${nombreMetodo(pago.metodo)}`);
		quitar.addEventListener('click', () => {
			pagos.splice(pagos.indexOf(pago), 1);
			lleno = false;
			mostrarNota(campoNota.hidden !== true && (hayDeuda() || nota.value.trim() !== ''));
			dibujar();
		});
		li.append(nombre, monto, quitar);
		return li;
	}

	function dibujar() {
		if (!pagos.length) {
			const vacio = document.createElement('li');
			vacio.className = 'pagos-vacio';
			vacio.textContent = 'Todavía no cargaste pagos.';
			lista.replaceChildren(vacio);
		} else {
			lista.replaceChildren(...pagos.map(fila));
		}
		if (lleno) {
			const aviso = document.createElement('li');
			aviso.className = 'pagos-lleno';
			aviso.textContent = 'No entran más pagos. Juntá montos o quitá alguno.';
			lista.append(aviso);
		}
		actualizarEstado();
	}

	function agregar(metodo: MetodoPago) {
		pagos.push({ id: nuevoId(), metodo, monto: estadoCobro(total, pagos).falta });
		if (metodo === 'debe') mostrarNota(true);
		dibujar();
		// Sin desplazamiento: si el pago nuevo no entra en la pantalla, no se agrega.
		if (lista.scrollHeight > lista.clientHeight) {
			pagos.pop();
			lleno = true;
			if (!hayDeuda()) mostrarNota(nota.value.trim() !== '');
			dibujar();
		}
		if (metodo === 'debe' && !nota.value.trim()) nota.focus();
	}

	const alTocarMetodo = (e: Event) => agregar((e.currentTarget as HTMLButtonElement).dataset.metodo as MetodoPago);
	const alTocarDebe = () => {
		if (!hayDeuda()) agregar('debe');
		else if (!nota.value.trim()) nota.focus();
	};
	const alTocarNota = () => {
		mostrarNota(campoNota.hidden === true);
		if (!campoNota.hidden) nota.focus();
	};
	metodos.forEach((b) => b.addEventListener('click', alTocarMetodo));
	botonDebe.addEventListener('click', alTocarDebe);
	botonNota.addEventListener('click', alTocarNota);
	nota.addEventListener('input', actualizarEstado);

	mostrarNota(nota.value.trim() !== '' || hayDeuda());
	dibujar();
	dialogo.showModal();

	return new Promise((resolver) => {
		let cerrado = false;
		const cerrarCon = (resultado: ResultadoCobro) => {
			if (cerrado) return;
			cerrado = true;
			metodos.forEach((b) => b.removeEventListener('click', alTocarMetodo));
			botonDebe.removeEventListener('click', alTocarDebe);
			botonNota.removeEventListener('click', alTocarNota);
			nota.removeEventListener('input', actualizarEstado);
			form.removeEventListener('submit', alEnviar);
			volver.removeEventListener('click', alVolver);
			dialogo.removeEventListener('close', alVolver);
			if (dialogo.open) dialogo.close();
			resolver(resultado);
		};
		const alEnviar = (e: Event) => {
			e.preventDefault();
			if (!estadoCobro(total, pagos).completo || faltaNota()) return;
			cerrarCon({ accion: 'confirmar', pagos: pagosFinales(total, pagos), nota: nota.value.trim() });
		};
		// "Volver", la tecla atrás o Escape: queda pendiente con lo que se cargó.
		const alVolver = () =>
			cerrarCon({ accion: 'volver', pagos: pagos.filter((p) => p.monto > 0), nota: nota.value.trim() });
		form.addEventListener('submit', alEnviar);
		volver.addEventListener('click', alVolver);
		dialogo.addEventListener('close', alVolver);
	});
}

// Controla la hoja de cobro de src/components/Cobro.astro.

import { leerNumero, numeroEditable, pesos } from '../formato';
import { estadoCobro, nombreMetodo, pagosFinales, type MetodoPago, type Pago } from '../pagos';
import { nuevoId, type Venta } from '../ventas/db';

export type ResultadoCobro =
	/** Se cobró: la venta se finaliza con estos pagos. */
	| { accion: 'confirmar'; pagos: Pago[] }
	/** Se volvió sin cobrar: la venta sigue abierta y guarda los pagos cargados. */
	| { accion: 'volver'; pagos: Pago[] };

export function abrirCobro(venta: Venta, numero: number): Promise<ResultadoCobro> {
	const dialogo = document.getElementById('cobro') as HTMLDialogElement;
	const form = document.getElementById('cobro-form') as HTMLFormElement;
	const titulo = document.getElementById('cobro-venta')!;
	const totalTexto = document.getElementById('cobro-total')!;
	const estado = document.getElementById('cobro-estado')!;
	const lista = document.getElementById('cobro-pagos')!;
	const volver = document.getElementById('cobro-volver') as HTMLButtonElement;
	const confirmar = document.getElementById('cobro-confirmar') as HTMLButtonElement;
	const metodos = form.querySelectorAll<HTMLButtonElement>('[data-metodo]');

	const total = venta.productos.reduce((s, p) => s + p.total, 0);
	const pagos: Pago[] = (venta.pagos ?? []).map((p) => ({ ...p }));
	let lleno = false;

	titulo.textContent = venta.cliente ? `Venta ${numero} · ${venta.cliente}` : `Venta ${numero}`;
	totalTexto.textContent = pesos(total);

	function actualizarEstado() {
		const e = estadoCobro(total, pagos);
		if (e.sobra > 0) {
			delete estado.dataset.tipo;
			estado.textContent = `Sobran ${pesos(e.sobra)}: revisá los montos`;
		} else if (e.falta > 0) {
			delete estado.dataset.tipo;
			estado.textContent = `Falta cobrar ${pesos(e.falta)}`;
		} else {
			estado.dataset.tipo = 'ok';
			estado.textContent = e.vuelto > 0 ? `Vuelto: ${pesos(e.vuelto)}` : '✓ Está todo cobrado';
		}
		confirmar.disabled = !e.completo;
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
		quitar.setAttribute('aria-label', `Quitar el pago en ${nombreMetodo(pago.metodo)}`);
		quitar.addEventListener('click', () => {
			pagos.splice(pagos.indexOf(pago), 1);
			lleno = false;
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
		const pago: Pago = { id: nuevoId(), metodo, monto: estadoCobro(total, pagos).falta };
		pagos.push(pago);
		dibujar();
		// Sin desplazamiento: si el pago nuevo no entra en la pantalla, no se agrega.
		if (lista.scrollHeight > lista.clientHeight) {
			pagos.pop();
			lleno = true;
			dibujar();
		}
	}

	const alTocarMetodo = (e: Event) => agregar((e.currentTarget as HTMLButtonElement).dataset.metodo as MetodoPago);
	metodos.forEach((b) => b.addEventListener('click', alTocarMetodo));

	dibujar();
	dialogo.showModal();

	return new Promise((resolver) => {
		let cerrado = false;
		const cerrarCon = (resultado: ResultadoCobro) => {
			if (cerrado) return;
			cerrado = true;
			metodos.forEach((b) => b.removeEventListener('click', alTocarMetodo));
			form.removeEventListener('submit', alEnviar);
			volver.removeEventListener('click', alVolver);
			dialogo.removeEventListener('close', alVolver);
			if (dialogo.open) dialogo.close();
			resolver(resultado);
		};
		const alEnviar = (e: Event) => {
			e.preventDefault();
			if (!estadoCobro(total, pagos).completo) return;
			cerrarCon({ accion: 'confirmar', pagos: pagosFinales(total, pagos) });
		};
		// "Volver", la tecla atrás o Escape: la venta queda pendiente con lo que se cargó.
		const alVolver = () => cerrarCon({ accion: 'volver', pagos: pagos.filter((p) => p.monto > 0) });
		form.addEventListener('submit', alEnviar);
		volver.addEventListener('click', alVolver);
		dialogo.addEventListener('close', alVolver);
	});
}

// Dibuja el resumen del día y la lista de ventas agrupada por día.

import { hora, inicioDelDia, kilos, nombreDelDia, pesos } from '../formato';
import { MARCAS, marcaPorId } from '../marcas';
import { ruta } from '../rutas';
import type { Venta } from '../ventas/db';

export interface AccionesLista {
	alEditar(venta: Venta): void;
	alBorrar(venta: Venta): void;
}

export function dibujarResumen(ventas: Venta[]): void {
	const hoy = inicioDelDia(Date.now());
	const deHoy = ventas.filter((v) => v.creada >= hoy);
	const total = deHoy.reduce((s, v) => s + v.total, 0);
	const kg = deHoy.reduce((s, v) => s + (v.pesoKg ?? 0), 0);

	document.getElementById('resumen-total')!.textContent = pesos(total);
	document.getElementById('resumen-detalle')!.textContent = deHoy.length
		? `${deHoy.length} ${deHoy.length === 1 ? 'venta' : 'ventas'} · ${kilos(kg)}`
		: 'Todavía no hay ventas hoy';

	const porMarca = document.getElementById('resumen-marcas')!;
	porMarca.replaceChildren(
		...MARCAS.map((m) => ({ m, suma: deHoy.filter((v) => v.marca === m.id).reduce((s, v) => s + v.total, 0) }))
			.filter(({ suma }) => suma > 0)
			.map(({ m, suma }) => {
				const li = document.createElement('li');
				const logo = new Image(24, 24);
				logo.src = m.logo;
				logo.alt = '';
				const nombre = document.createElement('span');
				nombre.textContent = m.nombre;
				const valor = document.createElement('strong');
				valor.textContent = pesos(suma);
				li.append(logo, nombre, valor);
				return li;
			}),
	);
}

export function dibujarLista(contenedor: HTMLElement, ventas: Venta[], acciones: AccionesLista): void {
	if (!ventas.length) {
		const vacio = document.createElement('p');
		vacio.className = 'lista-vacia';
		vacio.textContent = 'Las ventas que anotes van a aparecer acá. Se guardan en el celular, aunque no haya señal.';
		contenedor.replaceChildren(vacio);
		return;
	}

	const dias = new Map<number, Venta[]>();
	for (const v of ventas) {
		const dia = inicioDelDia(v.creada);
		if (!dias.has(dia)) dias.set(dia, []);
		dias.get(dia)!.push(v);
	}

	contenedor.replaceChildren(
		...[...dias.entries()].map(([dia, delDia]) => {
			const grupo = document.createElement('section');
			grupo.className = 'dia';

			const cabecera = document.createElement('h3');
			const nombre = document.createElement('span');
			nombre.textContent = nombreDelDia(dia);
			const suma = document.createElement('span');
			suma.className = 'dia-total';
			suma.textContent = pesos(delDia.reduce((s, v) => s + v.total, 0));
			cabecera.append(nombre, suma);

			const lista = document.createElement('ul');
			lista.append(...delDia.map((v) => itemVenta(v, acciones)));
			grupo.append(cabecera, lista);
			return grupo;
		}),
	);
}

function itemVenta(v: Venta, acciones: AccionesLista): HTMLLIElement {
	const li = document.createElement('li');
	li.className = 'venta';

	const editar = document.createElement('button');
	editar.type = 'button';
	editar.className = 'venta-principal';
	editar.setAttribute('aria-label', `Editar ${v.producto}, ${pesos(v.total)}`);

	const marca = marcaPorId(v.marca);
	const logo = new Image(40, 40);
	logo.className = 'venta-logo';
	logo.src = marca?.logo ?? ruta('pwa-192x192.png');
	logo.alt = '';

	const info = document.createElement('span');
	info.className = 'venta-info';
	const titulo = document.createElement('span');
	titulo.className = 'venta-producto';
	titulo.textContent = v.producto;
	const detalle = document.createElement('span');
	detalle.className = 'venta-detalle';
	const partes = [hora(v.creada), marca?.nombre ?? v.marca];
	if (v.pesoKg != null) partes.push(v.precioKg != null ? `${kilos(v.pesoKg)} × ${pesos(v.precioKg)}` : kilos(v.pesoKg));
	detalle.textContent = partes.join(' · ');
	info.append(titulo, detalle);

	const total = document.createElement('span');
	total.className = 'venta-total';
	total.textContent = pesos(v.total);

	editar.append(logo, info, total);
	editar.addEventListener('click', () => acciones.alEditar(v));

	const borrar = document.createElement('button');
	borrar.type = 'button';
	borrar.className = 'venta-borrar';
	borrar.setAttribute('aria-label', `Borrar ${v.producto}`);
	borrar.innerHTML =
		'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
	borrar.addEventListener('click', () => acciones.alBorrar(v));

	li.append(editar, borrar);
	return li;
}

let temporizadorAviso: ReturnType<typeof setTimeout> | undefined;

/** Mensaje corto abajo de la pantalla, con una acción opcional (por ejemplo, "Deshacer"). */
export function avisar(texto: string, accion?: { texto: string; alTocar: () => void }): void {
	const aviso = document.getElementById('aviso')!;
	clearTimeout(temporizadorAviso);
	const mensaje = document.createElement('span');
	mensaje.textContent = texto;
	aviso.replaceChildren(mensaje);
	if (accion) {
		const boton = document.createElement('button');
		boton.type = 'button';
		boton.textContent = accion.texto;
		boton.addEventListener('click', () => {
			aviso.hidden = true;
			accion.alTocar();
		});
		aviso.append(boton);
	}
	aviso.hidden = false;
	temporizadorAviso = setTimeout(() => (aviso.hidden = true), accion ? 7000 : 3500);
}

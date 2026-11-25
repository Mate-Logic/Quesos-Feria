// Dibuja el resumen, las ventas abiertas y el historial.

import { hora, inicioDelDia, kilos, nombreDelDia, pesos } from '../formato';
import { MARCAS, marcaPorId } from '../marcas';
import { ruta } from '../rutas';
import type { ProductoVenta, Venta } from '../ventas/db';

export interface AccionesLista {
	alEditar(venta: Venta, producto: ProductoVenta): void;
	alBorrar(venta: Venta): void;
}

export interface AccionesVentasAbiertas {
	alSeleccionar(id: string): void;
	alCambiarCliente(venta: Venta, cliente: string): void;
	alFinalizar(venta: Venta): void;
	alCancelar(venta: Venta): void;
}

const totalVenta = (venta: Venta) => venta.productos.reduce((suma, producto) => suma + producto.total, 0);
const kilosVenta = (venta: Venta) => venta.productos.reduce((suma, producto) => suma + (producto.pesoKg ?? 0), 0);

export function dibujarResumen(ventas: Venta[]): void {
	const hoy = inicioDelDia(Date.now());
	const deHoy = ventas.filter((v) => v.estado === 'finalizada' && (v.finalizada ?? v.creada) >= hoy);
	const total = deHoy.reduce((s, v) => s + totalVenta(v), 0);
	const kg = deHoy.reduce((s, v) => s + kilosVenta(v), 0);
	const cantidadProductos = deHoy.reduce((s, v) => s + v.productos.length, 0);

	document.getElementById('resumen-total')!.textContent = pesos(total);
	document.getElementById('resumen-detalle')!.textContent = deHoy.length
		? `${deHoy.length} ${deHoy.length === 1 ? 'venta finalizada' : 'ventas finalizadas'} · ${cantidadProductos} ${cantidadProductos === 1 ? 'producto' : 'productos'} · ${kilos(kg)}`
		: 'Todavía no hay ventas finalizadas hoy';

	const porMarca = document.getElementById('resumen-marcas')!;
	const productosDeHoy = deHoy.flatMap((v) => v.productos);
	porMarca.replaceChildren(
		...MARCAS.map((m) => ({
			m,
			suma: productosDeHoy.filter((p) => p.marca === m.id).reduce((s, p) => s + p.total, 0),
		}))
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

export function dibujarVentasAbiertas(
	contenedor: HTMLElement,
	ventas: Venta[],
	activaId: string | null,
	acciones: AccionesVentasAbiertas,
): void {
	if (!ventas.length) {
		const vacio = document.createElement('p');
		vacio.className = 'lista-vacia';
		vacio.textContent = 'No hay ventas abiertas. Iniciá una cuando empieces a atender a un cliente.';
		contenedor.replaceChildren(vacio);
		return;
	}

	let indice = Math.max(0, ventas.findIndex((v) => v.id === activaId));
	const estado = document.createElement('p');
	estado.className = 'carrusel-estado';
	estado.setAttribute('aria-live', 'polite');
	const anterior = document.createElement('button');
	anterior.type = 'button';
	anterior.className = 'carrusel-control';
	anterior.setAttribute('aria-label', 'Ver venta anterior');
	anterior.textContent = '‹';
	const siguiente = document.createElement('button');
	siguiente.type = 'button';
	siguiente.className = 'carrusel-control';
	siguiente.setAttribute('aria-label', 'Ver venta siguiente');
	siguiente.textContent = '›';
	const pista = document.createElement('div');
	pista.className = 'carrusel-pista';
	const ventana = document.createElement('div');
	ventana.className = 'carrusel-ventana';

	for (const venta of ventas) pista.append(tarjetaVentaAbierta(venta, acciones));
	ventana.append(pista);

	const actualizar = () => {
		const activa = ventas[indice];
		if (!activa) return;
		pista.style.transform = `translateX(-${indice * 100}%)`;
		estado.textContent = `Venta ${indice + 1} de ${ventas.length}${ventas.length > 1 ? ' · Deslizá para cambiar' : ''}`;
		anterior.disabled = indice === 0;
		siguiente.disabled = indice === ventas.length - 1;
		acciones.alSeleccionar(activa.id);
	};
	const mover = (delta: number) => {
		const nuevoIndice = Math.max(0, Math.min(ventas.length - 1, indice + delta));
		if (nuevoIndice === indice) return;
		indice = nuevoIndice;
		actualizar();
	};
	anterior.addEventListener('click', () => mover(-1));
	siguiente.addEventListener('click', () => mover(1));

	let inicio: { x: number; y: number } | null = null;
	ventana.addEventListener('pointerdown', (evento) => {
		if ((evento.target as HTMLElement).closest('button, input')) return;
		inicio = { x: evento.clientX, y: evento.clientY };
	});
	ventana.addEventListener('pointerup', (evento) => {
		if (!inicio) return;
		const dx = evento.clientX - inicio.x;
		const dy = evento.clientY - inicio.y;
		inicio = null;
		if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) mover(dx < 0 ? 1 : -1);
	});
	ventana.addEventListener('pointercancel', () => (inicio = null));
	actualizar();
	const cabecera = document.createElement('div');
	cabecera.className = 'carrusel-cabecera';
	contenedor.replaceChildren(cabecera);
	cabecera.append(anterior, estado, siguiente);
	contenedor.append(ventana);
}

function tarjetaVentaAbierta(venta: Venta, acciones: AccionesVentasAbiertas): HTMLElement {
	const tarjeta = document.createElement('article');
	tarjeta.className = 'venta-abierta';
	const cliente = document.createElement('label');
	cliente.className = 'cliente-campo';
	const textoCliente = document.createElement('span');
	textoCliente.textContent = 'Cliente (opcional)';
	const inputCliente = document.createElement('input');
	inputCliente.type = 'text';
	inputCliente.autocomplete = 'off';
	inputCliente.placeholder = 'Nombre del cliente';
	inputCliente.value = venta.cliente;
	inputCliente.setAttribute('aria-label', 'Cliente de esta venta');
	inputCliente.addEventListener('change', () => acciones.alCambiarCliente(venta, inputCliente.value.trim()));
	cliente.append(textoCliente, inputCliente);

	const horaInicio = document.createElement('p');
	horaInicio.className = 'venta-hora';
	horaInicio.textContent = `Iniciada a las ${hora(venta.creada)}`;
	const productos = document.createElement('ul');
	productos.className = 'productos-abiertos';
	if (!venta.productos.length) {
		const vacio = document.createElement('li');
		vacio.className = 'producto-pendiente';
		vacio.textContent = 'Todavía no agregaste productos. Usá los botones de carga para sumarlos a esta venta.';
		productos.append(vacio);
	} else {
		productos.append(
			...venta.productos.map((item) => {
				const li = document.createElement('li');
				const detalle = document.createElement('span');
				detalle.textContent = `${item.producto}${item.pesoKg != null ? ` · ${kilos(item.pesoKg)}` : ''}`;
				const total = document.createElement('strong');
				total.textContent = pesos(item.total);
				li.append(detalle, total);
				return li;
			}),
		);
	}

	const pie = document.createElement('div');
	pie.className = 'venta-abierta-pie';
	const cantidad = document.createElement('span');
	cantidad.textContent = `${venta.productos.length} ${venta.productos.length === 1 ? 'producto' : 'productos'}`;
	const total = document.createElement('strong');
	total.textContent = pesos(totalVenta(venta));
	pie.append(cantidad, total);

	const accionesVenta = document.createElement('div');
	accionesVenta.className = 'venta-abierta-acciones';
	const finalizar = document.createElement('button');
	finalizar.type = 'button';
	finalizar.className = 'boton-finalizar';
	finalizar.textContent = 'Finalizar venta';
	finalizar.disabled = venta.productos.length === 0;
	finalizar.addEventListener('click', () => acciones.alFinalizar(venta));
	const cancelar = document.createElement('button');
	cancelar.type = 'button';
	cancelar.className = 'boton-cancelar-venta';
	cancelar.textContent = 'Cancelar';
	cancelar.addEventListener('click', () => acciones.alCancelar(venta));
	accionesVenta.append(finalizar, cancelar);
	tarjeta.append(cliente, horaInicio, productos, pie, accionesVenta);
	return tarjeta;
}

export function dibujarLista(contenedor: HTMLElement, ventas: Venta[], acciones: AccionesLista): void {
	if (!ventas.length) {
		const vacio = document.createElement('p');
		vacio.className = 'lista-vacia';
		vacio.textContent = 'Las ventas aparecen acá cuando se finalizan. Las que están abiertas quedan arriba para retomarlas.';
		contenedor.replaceChildren(vacio);
		return;
	}

	const dias = new Map<number, Venta[]>();
	for (const v of [...ventas].sort((a, b) => (b.finalizada ?? b.creada) - (a.finalizada ?? a.creada))) {
		const dia = inicioDelDia(v.finalizada ?? v.creada);
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
			suma.textContent = pesos(delDia.reduce((s, v) => s + totalVenta(v), 0));
			cabecera.append(nombre, suma);
			const lista = document.createElement('ul');
			lista.className = 'historial-ventas';
			lista.append(...delDia.map((v) => itemVenta(v, acciones)));
			grupo.append(cabecera, lista);
			return grupo;
		}),
	);
}

function itemVenta(venta: Venta, acciones: AccionesLista): HTMLLIElement {
	const li = document.createElement('li');
	li.className = 'venta-historial';
	const cabecera = document.createElement('div');
	cabecera.className = 'venta-historial-cabecera';
	const nombre = document.createElement('strong');
	nombre.textContent = venta.cliente || `Venta de las ${hora(venta.finalizada ?? venta.creada)}`;
	const total = document.createElement('strong');
	total.textContent = pesos(totalVenta(venta));
	cabecera.append(nombre, total);

	const productos = document.createElement('ul');
	productos.className = 'historial-productos';
	productos.append(
		...venta.productos.map((producto) => {
			const fila = document.createElement('li');
			const editar = document.createElement('button');
			editar.type = 'button';
			editar.className = 'historial-producto';
			editar.setAttribute('aria-label', `Editar ${producto.producto}, ${pesos(producto.total)}`);
			const marca = marcaPorId(producto.marca);
			const logo = new Image(30, 30);
			logo.className = 'venta-logo';
			logo.src = marca?.logo ?? ruta('pwa-192x192.png');
			logo.alt = '';
			const detalle = document.createElement('span');
			detalle.className = 'historial-producto-info';
			const titulo = document.createElement('strong');
			titulo.textContent = producto.producto;
			const subtitulo = document.createElement('small');
			const partes = [marca?.nombre ?? producto.marca];
			if (producto.pesoKg != null) {
				partes.push(producto.precioKg != null ? `${kilos(producto.pesoKg)} × ${pesos(producto.precioKg)}` : kilos(producto.pesoKg));
			}
			subtitulo.textContent = partes.join(' · ');
			const precio = document.createElement('strong');
			precio.textContent = pesos(producto.total);
			detalle.append(titulo, subtitulo);
			editar.append(logo, detalle, precio);
			editar.addEventListener('click', () => acciones.alEditar(venta, producto));
			fila.append(editar);
			return fila;
		}),
	);

	const borrar = document.createElement('button');
	borrar.type = 'button';
	borrar.className = 'borrar-venta';
	borrar.textContent = 'Borrar venta';
	borrar.addEventListener('click', () => acciones.alBorrar(venta));
	li.append(cabecera, productos, borrar);
	return li;
}

export function dibujarCanceladas(contenedor: HTMLElement, ventas: Venta[]): void {
	if (!ventas.length) {
		contenedor.replaceChildren();
		return;
	}
	const lista = document.createElement('ul');
	lista.className = 'canceladas-lista';
	lista.append(
		...ventas.map((venta) => {
			const li = document.createElement('li');
			const cliente = document.createElement('span');
			cliente.textContent = venta.cliente || `Venta de las ${hora(venta.creada)}`;
			const detalle = document.createElement('small');
			detalle.textContent = `${venta.productos.length} ${venta.productos.length === 1 ? 'producto' : 'productos'} · ${pesos(totalVenta(venta))} · Cancelada`;
			li.append(cliente, detalle);
			return li;
		}),
	);
	contenedor.replaceChildren(lista);
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

// Dibuja el resumen, las ventas abiertas y el historial.

import { hora, inicioDelDia, kilos, nombreDelDia, pesos } from '../formato';
import { MARCAS, marcaPorId } from '../marcas';
import { deuda, estadoCobro, nombreMetodo, totalesPorMetodo } from '../pagos';
import { ruta } from '../rutas';
import type { ProductoVenta, Venta } from '../ventas/db';

export interface AccionesLista {
	alEditar(venta: Venta, producto: ProductoVenta): void;
	alBorrar(venta: Venta): void;
	alSaldar(venta: Venta): void;
}

export interface AccionesVentasAbiertas {
	alSeleccionar(id: string): void;
	alCambiarCliente(venta: Venta, cliente: string): void;
	alFinalizar(venta: Venta): void;
	alCancelar(venta: Venta): void;
	alNueva(): void;
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

	const porPago = document.getElementById('resumen-pagos')!;
	porPago.replaceChildren(
		...totalesPorMetodo(deHoy.flatMap((v) => v.pagos ?? [])).map(({ nombre, total: suma }) => {
			const li = document.createElement('li');
			const texto = document.createElement('span');
			texto.textContent = nombre;
			const valor = document.createElement('strong');
			valor.textContent = pesos(suma);
			li.append(texto, valor);
			return li;
		}),
	);
}

/** Hoja que se veía en el último dibujo, para no perder la posición al refrescar. */
let hojaAnterior: string | null = null;
let centrarHojaActiva: (() => void) | null = null;

/** Vuelve a ubicar la hoja activa (por ejemplo, al volver a mostrar la pestaña). */
export function centrarVentaActiva(): void {
	centrarHojaActiva?.();
}

/**
 * Las ventas abiertas son hojas que se pasan deslizando con el dedo. Usa el
 * scroll horizontal nativo con `scroll-snap`: la hoja sigue al dedo y se
 * acomoda sola, sin librerías y sin perder la posición al volver a dibujar.
 */
export function dibujarVentasAbiertas(
	contenedor: HTMLElement,
	ventas: Venta[],
	activaId: string | null,
	acciones: AccionesVentasAbiertas,
): void {
	if (!ventas.length) {
		hojaAnterior = null;
		centrarHojaActiva = null;
		const vacio = document.createElement('div');
		vacio.className = 'sin-ventas';
		const texto = document.createElement('p');
		texto.textContent = 'No hay ventas abiertas';
		const ayuda = document.createElement('p');
		ayuda.className = 'sin-ventas-ayuda';
		ayuda.textContent = 'Empezá una venta o cargá un producto con los botones de abajo.';
		const empezar = boton('boton-empezar', '+ Empezar venta', 'Empezar una venta nueva');
		empezar.addEventListener('click', () => acciones.alNueva());
		vacio.append(texto, ayuda, empezar);
		contenedor.replaceChildren(vacio);
		return;
	}

	const sinAnimacion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const ventana = document.createElement('div');
	ventana.className = 'carrusel-ventana';
	ventana.tabIndex = -1;
	const hojas = ventas.map((venta, i) => {
		const hoja = tarjetaVentaAbierta(venta, acciones);
		hoja.setAttribute('aria-roledescription', 'hoja');
		hoja.setAttribute('aria-label', `Venta ${i + 1} de ${ventas.length}${venta.cliente ? `, ${venta.cliente}` : ''}`);
		return hoja;
	});
	ventana.append(...hojas);

	const nueva = boton('boton-nueva-venta', '+ Nueva', 'Empezar una venta nueva');
	nueva.addEventListener('click', () => acciones.alNueva());
	const centro = document.createElement('div');
	centro.className = 'carrusel-centro';
	const estado = document.createElement('p');
	estado.className = 'carrusel-estado';
	estado.setAttribute('aria-live', 'polite');
	// Los puntos solo indican cuántas hojas hay; para moverse están las flechas y el dedo.
	const puntos = document.createElement('div');
	puntos.className = 'carrusel-puntos';
	puntos.setAttribute('aria-hidden', 'true');
	const marcasPunto = ventas.map(() => document.createElement('span'));
	if (ventas.length > 1) puntos.append(...marcasPunto);
	centro.append(estado, puntos);

	let indice = -1;
	const marcar = (nuevo: number) => {
		if (nuevo === indice) return;
		indice = nuevo;
		const venta = ventas[indice]!;
		hojaAnterior = venta.id;
		hojas.forEach((h, i) => h.classList.toggle('activa', i === indice));
		marcasPunto.forEach((p, i) => p.classList.toggle('actual', i === indice));
		estado.textContent = ventas.length > 1 ? `Venta ${indice + 1} de ${ventas.length}` : 'Venta en curso';
		acciones.alSeleccionar(venta.id);
	};
	const posicion = (i: number) => {
		const hoja = hojas[i]!;
		return hoja.offsetLeft - (ventana.clientWidth - hoja.offsetWidth) / 2;
	};
	const irA = (i: number, suave = true) => {
		const destino = Math.max(0, Math.min(ventas.length - 1, i));
		ventana.scrollTo({ left: posicion(destino), behavior: suave && !sinAnimacion ? 'smooth' : 'instant' });
		marcar(destino);
	};

	// Mientras se desliza, la hoja activa es la que quedó más cerca del centro.
	let pendiente = 0;
	ventana.addEventListener(
		'scroll',
		() => {
			cancelAnimationFrame(pendiente);
			pendiente = requestAnimationFrame(() => {
				const centro = ventana.scrollLeft + ventana.clientWidth / 2;
				let masCerca = 0;
				hojas.forEach((h, i) => {
					const distancia = Math.abs(h.offsetLeft + h.offsetWidth / 2 - centro);
					const mejor = Math.abs(hojas[masCerca]!.offsetLeft + hojas[masCerca]!.offsetWidth / 2 - centro);
					if (distancia < mejor) masCerca = i;
				});
				marcar(masCerca);
			});
		},
		{ passive: true },
	);
	ventana.addEventListener('keydown', (evento) => {
		if ((evento.target as HTMLElement).closest('input')) return;
		if (evento.key === 'ArrowLeft') irA(indice - 1);
		if (evento.key === 'ArrowRight') irA(indice + 1);
	});

	const cabecera = document.createElement('div');
	cabecera.className = 'carrusel-cabecera';
	cabecera.append(centro, nueva);
	contenedor.replaceChildren(cabecera, ventana);

	// Arranca donde estaba el usuario; si la activa cambió (venta nueva), se desliza hasta ella.
	const buscar = (id: string | null) => ventas.findIndex((v) => v.id === id);
	const destino = Math.max(0, buscar(activaId));
	const desde = buscar(hojaAnterior);
	irA(desde >= 0 ? desde : destino, false);
	if (desde >= 0 && desde !== destino) requestAnimationFrame(() => irA(destino));
	centrarHojaActiva = () => irA(indice, false);
}

function boton(clase: string, texto: string, etiqueta: string): HTMLButtonElement {
	const b = document.createElement('button');
	b.type = 'button';
	b.className = clase;
	b.textContent = texto;
	b.setAttribute('aria-label', etiqueta);
	return b;
}

function tarjetaVentaAbierta(venta: Venta, acciones: AccionesVentasAbiertas): HTMLElement {
	const tarjeta = document.createElement('article');
	tarjeta.className = 'venta-abierta';
	const cliente = document.createElement('label');
	cliente.className = 'cliente-campo';
	const textoCliente = document.createElement('span');
	textoCliente.textContent = `Cliente (opcional) · desde las ${hora(venta.creada)}`;
	const inputCliente = document.createElement('input');
	inputCliente.type = 'text';
	inputCliente.autocomplete = 'off';
	inputCliente.placeholder = 'Nombre del cliente';
	inputCliente.value = venta.cliente;
	inputCliente.setAttribute('aria-label', 'Cliente de esta venta');
	inputCliente.addEventListener('change', () => acciones.alCambiarCliente(venta, inputCliente.value.trim()));
	cliente.append(textoCliente, inputCliente);

	const productos = document.createElement('ul');
	productos.className = 'productos-abiertos';
	if (!venta.productos.length) {
		const vacio = document.createElement('li');
		vacio.className = 'producto-pendiente';
		vacio.textContent = 'Sin productos todavía. Agregalos con los botones de abajo.';
		productos.append(vacio);
	} else {
		// El último producto cargado va arriba: es el que hay que ver al agregarlo.
		const filas = [...venta.productos].reverse().map((item) => {
			const li = document.createElement('li');
			const detalle = document.createElement('span');
			detalle.textContent = `${item.producto}${item.pesoKg != null ? ` · ${kilos(item.pesoKg)}` : ''}`;
			const total = document.createElement('strong');
			total.textContent = pesos(item.total);
			li.append(detalle, total);
			return li;
		});
		productos.append(...filas);
		new ResizeObserver(() => recortarProductos(productos, filas)).observe(productos);
	}

	const pie = document.createElement('div');
	pie.className = 'venta-abierta-pie';
	const cantidad = document.createElement('span');
	const cobro = estadoCobro(totalVenta(venta), venta.pagos ?? []);
	// Si quedó un cobro a medias, se ve cuánto falta.
	cantidad.textContent = venta.pagos?.length && cobro.falta > 0
		? `Falta cobrar ${pesos(cobro.falta)}`
		: `${venta.productos.length} ${venta.productos.length === 1 ? 'producto' : 'productos'}`;
	const total = document.createElement('strong');
	total.textContent = pesos(totalVenta(venta));
	pie.append(cantidad, total);

	const accionesVenta = document.createElement('div');
	accionesVenta.className = 'venta-abierta-acciones';
	const finalizar = document.createElement('button');
	finalizar.type = 'button';
	finalizar.className = 'boton-finalizar';
	finalizar.textContent = 'Cobrar';
	finalizar.setAttribute('aria-label', 'Cobrar y finalizar la venta');
	finalizar.disabled = venta.productos.length === 0;
	finalizar.addEventListener('click', () => acciones.alFinalizar(venta));
	const cancelar = document.createElement('button');
	cancelar.type = 'button';
	cancelar.className = 'boton-cancelar-venta';
	cancelar.textContent = 'Cancelar';
	cancelar.addEventListener('click', () => acciones.alCancelar(venta));
	accionesVenta.append(finalizar, cancelar);
	tarjeta.append(cliente, productos, pie, accionesVenta);
	return tarjeta;
}

/**
 * En la hoja no se desplaza nada: si los productos no entran, se muestran los
 * que caben y el resto se resume en una fila "+ N productos más".
 */
function recortarProductos(lista: HTMLElement, filas: HTMLElement[]): void {
	lista.replaceChildren(...filas);
	if (!lista.clientHeight || lista.scrollHeight <= lista.clientHeight) return;
	const mas = document.createElement('li');
	mas.className = 'productos-mas';
	for (let visibles = filas.length - 1; visibles >= 0; visibles--) {
		const resto = filas.length - visibles;
		mas.textContent = `+ ${resto} ${resto === 1 ? 'producto' : 'productos'} más`;
		lista.replaceChildren(...filas.slice(0, visibles), mas);
		if (lista.scrollHeight <= lista.clientHeight) return;
	}
}

export function dibujarLista(
	contenedor: HTMLElement,
	ventas: Venta[],
	acciones: AccionesLista,
	textoVacio = 'Las ventas aparecen acá cuando se finalizan.',
): void {
	if (!ventas.length) {
		const vacio = document.createElement('p');
		vacio.className = 'lista-vacia';
		vacio.textContent = textoVacio;
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
	// Cada pago con su monto, aunque se repita el medio (por ejemplo, varias Cuenta DNI).
	const pagados = (venta.pagos ?? []).filter((p) => p.metodo !== 'debe');
	const pago = document.createElement('ul');
	pago.className = 'venta-historial-pagos';
	pago.setAttribute('aria-label', 'Pagos');
	pago.append(
		...pagados.map((p) => {
			const fila = document.createElement('li');
			const medio = document.createElement('span');
			medio.textContent = nombreMetodo(p.metodo);
			const monto = document.createElement('strong');
			monto.textContent = pesos(p.monto);
			fila.append(medio, monto);
			return fila;
		}),
	);

	const extras: HTMLElement[] = pagados.length ? [pago] : [];
	const debe = deuda(venta.pagos);
	if (debe > 0) {
		const aviso = document.createElement('div');
		aviso.className = 'venta-deuda';
		const texto = document.createElement('span');
		texto.textContent = `Debe ${pesos(debe)}${venta.nota ? ` · ${venta.nota}` : ''}`;
		const cobrar = document.createElement('button');
		cobrar.type = 'button';
		cobrar.textContent = 'Cobrar deuda';
		cobrar.addEventListener('click', () => acciones.alSaldar(venta));
		aviso.append(texto, cobrar);
		extras.push(aviso);
	} else if (venta.nota) {
		const nota = document.createElement('p');
		nota.className = 'venta-historial-nota';
		nota.textContent = `Nota: ${venta.nota}`;
		extras.push(nota);
	}

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
	li.append(cabecera, ...extras, productos, borrar);
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

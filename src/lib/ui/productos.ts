// La sección "Productos": lista del catálogo y las hojas de src/components/Producto.astro.

import { guardarItem, guardarPromo, leerCatalogo, type ItemCatalogo, type Promo } from '../catalogo';
import { leerNumero, numeroEditable, pesos } from '../formato';
import { MARCAS, marcaPorId } from '../marcas';
import { nuevoId } from '../ventas/db';
import { leerCodigo } from './codigo';

export const precioConUnidad = (p: ItemCatalogo) => (p.precio == null ? 'Sin precio' : `${pesos(p.precio)}${p.tipo === 'kg' ? ' / kg' : ' c/u'}`);

let filtro: string = MARCAS[0]!.id;

function elemento<K extends keyof HTMLElementTagNameMap>(tag: K, texto = '', clase = ''): HTMLElementTagNameMap[K] {
	const e = document.createElement(tag);
	e.textContent = texto;
	if (clase) e.className = clase;
	return e;
}

/** Un renglón tocable: nombre y detalle a la izquierda, precio a la derecha. */
function renglon(nombre: string, detalle: string, precio: string, alTocar: () => void): HTMLLIElement {
	const li = elemento('li');
	const boton = elemento('button');
	boton.type = 'button';
	const texto = elemento('span', nombre);
	if (detalle) texto.append(elemento('small', detalle));
	boton.append(texto, elemento('strong', precio));
	boton.addEventListener('click', alTocar);
	li.append(boton);
	return li;
}

const redibujar = (guardado: boolean | ItemCatalogo | null) => guardado && dibujarCatalogo();

/** Dibuja las dos vistas: Productos (filtrados por marca) y Promos. */
export function dibujarCatalogo(): void {
	const catalogo = leerCatalogo();

	document.getElementById('catalogo-filtros')!.replaceChildren(
		...MARCAS.map((m) => {
			const b = elemento('button', m.nombre);
			b.type = 'button';
			b.setAttribute('aria-pressed', String(m.id === filtro));
			b.addEventListener('click', () => {
				filtro = m.id;
				dibujarCatalogo();
			});
			return b;
		}),
	);
	document.getElementById('catalogo-lista')!.replaceChildren(
		...catalogo.productos
			.filter((p) => p.marca === filtro)
			.map((p) => {
				const detalle = [p.activo === false ? 'No se ofrece' : '', p.revisar ? 'Precio a confirmar' : '', p.codigo ? 'Con código' : '']
					.filter(Boolean)
					.join(' · ');
				return renglon(p.nombre, detalle, precioConUnidad(p), () => void abrirProducto(p).then(redibujar));
			}),
	);
	document.getElementById('catalogo-nuevo')!.onclick = () => void abrirProducto({ marca: filtro }).then(redibujar);

	document.getElementById('promos-lista')!.replaceChildren(
		...catalogo.promos.map((p) => {
			const lleva = p.items
				.map((i) => `${i.cantidad} × ${catalogo.productos.find((x) => x.id === i.productoId)?.nombre ?? 'producto borrado'}`)
				.join(' + ');
			const estado = p.activa && p.precio != null ? 'Activa' : 'Apagada';
			return renglon(p.nombre, `${lleva} · ${estado}`, p.precio == null ? 'Sin precio' : pesos(p.precio), () => void abrirPromo(p).then(redibujar));
		}),
	);
	document.getElementById('promo-nueva')!.onclick = () => void abrirPromo().then(redibujar);
}

/** El botón "Borrar" de una hoja: solo para lo que ya existe, y con confirmación. */
function prepararBorrar(form: HTMLFormElement, nombre: string | undefined, borrar: () => void) {
	const boton = form.querySelector<HTMLButtonElement>('[data-borrar]')!;
	boton.hidden = nombre == null;
	boton.onclick = () => {
		if (!window.confirm(`¿Borrar "${nombre}"? Las ventas ya hechas no cambian.`)) return;
		borrar();
		form.closest('dialog')!.close();
		dibujarCatalogo();
	};
}

/** Abre una hoja con formulario y se resuelve con lo que devuelva `leer`, o `null` si se canceló. */
function hoja<T>(id: string, preparar: (form: HTMLFormElement) => () => T | string): Promise<T | null> {
	const dialogo = document.getElementById(id) as HTMLDialogElement;
	const form = dialogo.querySelector('form')!;
	form.reset();
	const error = form.querySelector<HTMLElement>('.error')!;
	error.hidden = true;
	const leer = preparar(form);
	dialogo.showModal();
	return new Promise((resolver) => {
		const cancelar = form.querySelector('[data-cancelar]')!;
		const terminar = (valor: T | null) => {
			form.onsubmit = null;
			dialogo.onclose = null;
			cancelar.removeEventListener('click', alCancelar);
			if (dialogo.open) dialogo.close();
			resolver(valor);
		};
		const alCancelar = () => terminar(null);
		cancelar.addEventListener('click', alCancelar);
		dialogo.onclose = alCancelar;
		form.onsubmit = (evento) => {
			evento.preventDefault();
			const valor = leer();
			if (typeof valor === 'string') {
				error.textContent = valor;
				error.hidden = false;
			} else terminar(valor);
		};
	});
}

const campo = <T extends HTMLElement = HTMLInputElement>(form: HTMLFormElement, nombre: string) => form.elements.namedItem(nombre) as unknown as T;

/** Alta o edición de un producto. Devuelve lo guardado. */
export async function abrirProducto(datos: Partial<ItemCatalogo>): Promise<ItemCatalogo | null> {
	const item = await hoja<ItemCatalogo>('producto', (form) => {
		const nombre = campo(form, 'nombre');
		const marca = campo<HTMLSelectElement>(form, 'marca');
		const tipo = campo<HTMLSelectElement>(form, 'tipo');
		const precio = campo(form, 'precio');
		const codigo = campo(form, 'codigo');
		const activo = campo(form, 'activo');
		document.getElementById('producto-titulo')!.textContent = datos.id ? 'Editar producto' : 'Producto nuevo';
		nombre.value = datos.nombre ?? '';
		marca.value = datos.marca ?? MARCAS[0]!.id;
		tipo.value = datos.tipo ?? 'kg';
		precio.value = numeroEditable(datos.precio);
		codigo.value = datos.codigo ?? '';
		activo.checked = datos.activo !== false;
		prepararBorrar(form, datos.id ? datos.nombre : undefined, () => guardarItem({ ...(datos as ItemCatalogo), borrado: true }));
		const mostrarCodigo = () => (form.querySelector<HTMLElement>('[data-solo="unidad"]')!.hidden = tipo.value !== 'unidad');
		tipo.onchange = mostrarCodigo;
		mostrarCodigo();
		form.querySelector<HTMLButtonElement>('[data-escanear]')!.onclick = () =>
			void leerCodigo().then((leido) => leido && (codigo.value = leido));
		return () => {
			const valor = leerNumero(precio.value);
			const barras = tipo.value === 'unidad' ? codigo.value.trim() : '';
			if (!nombre.value.trim()) return 'Escribí el nombre.';
			if (precio.value.trim() && (valor == null || valor <= 0)) return 'El precio no es un número.';
			const otro = leerCatalogo().productos.find((p) => barras && p.codigo === barras && p.id !== datos.id && p.activo !== false);
			if (otro) return `Ese código ya es de "${otro.nombre}".`;
			return {
				id: datos.id ?? nuevoId(),
				nombre: nombre.value.trim(),
				marca: marca.value,
				tipo: tipo.value as ItemCatalogo['tipo'],
				precio: valor,
				codigo: barras || undefined,
				activo: activo.checked,
			};
		};
	});
	if (item) guardarItem(item);
	return item;
}

async function abrirPromo(datos?: Promo): Promise<boolean> {
	const promo = await hoja<Promo>('promo', (form) => {
		const nombre = campo(form, 'nombre');
		const precio = campo(form, 'precio');
		const activa = campo(form, 'activa');
		const unidades = leerCatalogo().productos.filter((p) => p.tipo === 'unidad' && p.activo !== false);
		const filas = [1, 2].map((n) => {
			const producto = campo<HTMLSelectElement>(form, `producto${n}`);
			const cantidad = campo(form, `cantidad${n}`);
			producto.replaceChildren(new Option('—', ''), ...unidades.map((p) => new Option(p.nombre, p.id)));
			const item = datos?.items[n - 1];
			producto.value = item?.productoId ?? '';
			cantidad.value = item ? String(item.cantidad) : '';
			return { producto, cantidad };
		});
		nombre.value = datos?.nombre ?? '';
		precio.value = numeroEditable(datos?.precio);
		activa.checked = datos?.activa ?? true;
		prepararBorrar(form, datos?.nombre, () => guardarPromo({ ...datos!, borrado: true }));
		return () => {
			const valor = leerNumero(precio.value);
			const items = filas
				.filter((f) => f.producto.value)
				.map((f) => ({ productoId: f.producto.value, cantidad: Number(f.cantidad.value) }));
			if (!nombre.value.trim()) return 'Escribí el nombre.';
			if (!items.length || items.some((i) => !Number.isInteger(i.cantidad) || i.cantidad < 1)) return 'Elegí el producto y cuántos.';
			if (precio.value.trim() && (valor == null || valor <= 0)) return 'El precio no es un número.';
			if (activa.checked && valor == null) return 'Para activarla hace falta el precio.';
			return { id: datos?.id ?? nuevoId(), nombre: nombre.value.trim(), items, precio: valor, activa: activa.checked };
		};
	});
	if (promo) guardarPromo(promo);
	return promo != null;
}

/** Para un código que todavía no está: se elige el producto (queda guardado) o se crea uno. */
export function asociarCodigo(codigo: string): Promise<ItemCatalogo | null> {
	const dialogo = document.getElementById('elegir') as HTMLDialogElement;
	const lista = document.getElementById('elegir-lista')!;
	const cancelar = dialogo.querySelector<HTMLButtonElement>('[data-cancelar]')!;
	const nuevo = dialogo.querySelector<HTMLButtonElement>('[data-nuevo]')!;
	document.getElementById('elegir-codigo')!.textContent = `Código nuevo: ${codigo}. Se pide una sola vez.`;
	return new Promise((resolver) => {
		let cerrado = false;
		const terminar = (item: ItemCatalogo | null) => {
			if (cerrado) return;
			cerrado = true;
			dialogo.onclose = null;
			if (dialogo.open) dialogo.close();
			resolver(item);
		};
		lista.replaceChildren(
			...leerCatalogo()
				.productos.filter((p) => p.tipo === 'unidad' && p.activo !== false && !p.codigo)
				.map((p) =>
					renglon(`${p.nombre} · ${marcaPorId(p.marca)?.nombre ?? p.marca}`, '', precioConUnidad(p), () => {
						const conCodigo = { ...p, codigo };
						guardarItem(conCodigo);
						terminar(conCodigo);
					}),
				),
		);
		cancelar.onclick = () => terminar(null);
		nuevo.onclick = () => {
			dialogo.onclose = null;
			dialogo.close();
			void abrirProducto({ codigo, tipo: 'unidad' }).then(terminar);
		};
		dialogo.onclose = () => terminar(null);
		dialogo.showModal();
	});
}

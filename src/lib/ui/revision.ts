// Controla la hoja de revisión de productos de src/components/Revision.astro.

import { leerCatalogo, type ItemCatalogo } from '../catalogo';
import { leerNumero, numeroEditable, pesos } from '../formato';
import { cierraLaCuenta, formatearNombre, PRODUCTOS_COMUNES, type LecturaTicket } from '../tickets/parser';
import { nuevoId, type Producto, type ProductoVenta, type Venta } from '../ventas/db';

export interface DatosRevision {
	/** Venta abierta a la que se agrega el producto, si corresponde. */
	venta?: Venta;
	/** Producto de una venta existente que se está editando. */
	productoVenta?: ProductoVenta;
	origen: ProductoVenta['origen'];
	productos: Producto[];
	marcaSugerida?: string | null;
}

export interface ResultadoRevision {
	producto: ProductoVenta;
	/** Permite actualizar la marca cuando se agrega un producto a una venta abierta. */
	marca: string;
}

export interface ControlRevision {
	/** Muestra el avance de la lectura del ticket. */
	progreso(mensaje: string, avance: number): void;
	/** Carga lo que se leyó del ticket. */
	completar(lectura: LecturaTicket, miniatura: Blob | null): void;
	/** La lectura falló: se puede cargar a mano igual. */
	fallo(mensaje: string): void;
	/** Se resuelve con el producto listo para guardar, o `null` si se canceló. */
	resultado: Promise<ResultadoRevision | null>;
}

function marcarInvalido(campo: HTMLInputElement, invalido: boolean) {
	if (invalido) campo.setAttribute('aria-invalid', 'true');
	else campo.removeAttribute('aria-invalid');
}

const NOMBRES_CAMPO = { peso: 'peso', precio: 'precio por kilo', total: 'total' } as const;

export function abrirRevision(datos: DatosRevision): ControlRevision {
	const dialogo = document.getElementById('revision') as HTMLDialogElement;
	const form = document.getElementById('revision-form') as HTMLFormElement;
	const titulo = document.getElementById('revision-titulo')!;
	const foto = document.getElementById('revision-foto')!;
	const leyendo = document.getElementById('revision-leyendo')!;
	const barra = leyendo.querySelector<HTMLElement>('.barra-progreso span')!;
	const textoLeyendo = leyendo.querySelector('p')!;
	const aviso = document.getElementById('revision-aviso')!;
	const campos = document.getElementById('revision-campos') as HTMLFieldSetElement;
	const cuenta = document.getElementById('revision-cuenta')!;
	const error = document.getElementById('revision-error')!;
	const guardar = document.getElementById('revision-guardar') as HTMLButtonElement;
	const lista = document.getElementById('revision-productos') as HTMLDataListElement;

	const producto = form.elements.namedItem('producto') as HTMLInputElement;
	const peso = form.elements.namedItem('peso') as HTMLInputElement;
	const precio = form.elements.namedItem('precio') as HTMLInputElement;
	const total = form.elements.namedItem('total') as HTMLInputElement;
	const chips = document.getElementById('revision-catalogo')!;
	const unidadPeso = peso.parentElement!.querySelector('.unidad')!;
	const catalogo = leerCatalogo().productos.filter((p) => p.activo !== false);

	const { venta, productoVenta, origen, productos } = datos;
	let miniatura: Blob | null = productoVenta?.miniatura ?? null;
	let urlFoto: string | null = null;
	let totalAMano = false;
	let cerrado = false;

	form.reset();
	titulo.textContent = productoVenta ? 'Editar producto' : venta ? 'Sumar a la venta' : 'Revisá el producto';
	guardar.textContent = productoVenta ? 'Guardar cambios' : 'Agregar producto';
	aviso.hidden = true;
	error.hidden = true;
	cuenta.textContent = '';
	[peso, precio, total, producto].forEach((i) => {
		delete i.dataset.calculado;
		i.removeAttribute('aria-invalid');
	});

	/** Producto del catálogo que se está cargando; define si va por kilo o por unidad. */
	let elegido: ItemCatalogo | undefined;
	const porUnidad = () => elegido?.tipo === 'unidad';

	lista.replaceChildren(
		...[...new Set([...catalogo.map((p) => p.nombre), ...productos.map((p) => p.nombre), ...PRODUCTOS_COMUNES.map(formatearNombre)])].map(
			(nombre) => new Option(nombre),
		),
	);

	if (productoVenta) {
		producto.value = productoVenta.producto;
		peso.value = numeroEditable(productoVenta.pesoKg);
		precio.value = numeroEditable(productoVenta.precioKg);
		total.value = numeroEditable(productoVenta.total);
		if (productoVenta.cantidad != null) {
			peso.value = String(productoVenta.cantidad);
			precio.value = numeroEditable(productoVenta.precioUnidad);
		}
		totalAMano = true;
		for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="marca"]')) {
			radio.checked = radio.value === productoVenta.marca;
		}
	} else {
		const marcaUltimoProducto = venta?.productos.at(-1)?.marca;
		const marca = marcaUltimoProducto ?? datos.marcaSugerida ?? null;
		if (marca) {
			for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="marca"]')) {
				radio.checked = radio.value === marca;
			}
		}
	}
	mostrarFoto(miniatura);
	elegido = catalogo.find((p) => p.id === productoVenta?.productoId);
	// Un producto envasado que ya no está en el catálogo se sigue editando por unidad.
	if (!elegido && productoVenta?.cantidad != null) {
		elegido = { id: productoVenta.productoId ?? '', marca: productoVenta.marca, nombre: productoVenta.producto, tipo: 'unidad', precio: null };
	}
	mostrarModo();
	dibujarChips();

	const esperandoLectura = origen === 'ticket' && !productoVenta;
	leyendo.hidden = !esperandoLectura;
	campos.disabled = esperandoLectura;
	guardar.disabled = esperandoLectura;
	barra.style.width = '5%';
	textoLeyendo.textContent = 'Leyendo el ticket…';
	actualizarCuenta();

	function valores() {
		return {
			p: leerNumero(peso.value, true),
			q: leerNumero(precio.value),
			t: leerNumero(total.value),
		};
	}

	function actualizarCuenta() {
		const { p, q, t } = valores();
		cuenta.replaceChildren();
		delete cuenta.dataset.tipo;
		if (porUnidad() || p == null || q == null) return;
		const calculado = Math.round(p * q * 100) / 100;
		if (t != null && cierraLaCuenta(p, q, t)) {
			cuenta.dataset.tipo = 'ok';
			cuenta.textContent = `✓ La cuenta cierra: ${numeroEditable(p)} kg × ${pesos(q)} = ${pesos(t)}`;
		} else if (t != null) {
			cuenta.dataset.tipo = 'mal';
			cuenta.append(`Peso × precio da ${pesos(calculado)}, no ${pesos(t)}.`);
			const usar = document.createElement('button');
			usar.type = 'button';
			usar.textContent = `Usar ${pesos(calculado)}`;
			usar.addEventListener('click', () => {
				total.value = numeroEditable(calculado);
				totalAMano = false;
				actualizarCuenta();
			});
			cuenta.append(usar);
		}
	}

	const alCambiarPesoOPrecio = (e: Event) => {
		delete (e.target as HTMLInputElement).dataset.calculado;
		const { p, q, t } = valores();
		if (p != null && q != null && !totalAMano) {
			total.value = numeroEditable(Math.round(p * q * 100) / 100);
		} else if (p != null && q == null && t != null && p > 0 && e.target === peso) {
			precio.value = numeroEditable(Math.round((t / p) * 100) / 100);
			precio.dataset.calculado = '';
		}
		actualizarCuenta();
	};
	const alCambiarTotal = () => {
		totalAMano = total.value.trim() !== '';
		delete total.dataset.calculado;
		actualizarCuenta();
	};

	function elegirMarca(id: string) {
		for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="marca"]')) {
			radio.checked = radio.value === id;
		}
	}

	function mostrarModo() {
		const unidad = porUnidad();
		form.querySelector('[data-etiqueta="peso"]')!.textContent = unidad ? 'Cantidad' : 'Peso';
		form.querySelector('[data-etiqueta="precio"]')!.textContent = unidad ? 'Precio c/u' : 'Precio por kg';
		peso.placeholder = unidad ? '1' : '0,000';
		peso.inputMode = unidad ? 'numeric' : 'decimal';
		unidadPeso.textContent = unidad ? 'u.' : 'kg';
	}

	function elegirItem(item: ItemCatalogo) {
		elegido = item;
		producto.value = item.nombre;
		elegirMarca(item.marca);
		precio.value = numeroEditable(item.precio);
		peso.value = item.tipo === 'unidad' ? '1' : '';
		totalAMano = false;
		total.value = item.tipo === 'unidad' && item.precio != null ? numeroEditable(item.precio) : '';
		mostrarModo();
		dibujarChips();
		actualizarCuenta();
		// Lo que falta escribir: el precio si no se sabe, o cuánto pesó.
		if (item.precio == null) precio.focus();
		else if (item.tipo === 'kg') peso.focus();
	}

	function dibujarChips() {
		const marca = (form.elements.namedItem('marca') as RadioNodeList).value;
		chips.replaceChildren(
			...catalogo
				.filter((p) => p.marca === marca)
				.map((p) => {
					const b = document.createElement('button');
					b.type = 'button';
					b.textContent = p.nombre;
					b.setAttribute('aria-pressed', String(p.id === elegido?.id));
					b.addEventListener('click', () => elegirItem(p));
					return b;
				}),
		);
	}

	const alCambiarMarca = (e: Event) => {
		if ((e.target as HTMLInputElement).name !== 'marca') return;
		if (elegido && elegido.marca !== (e.target as HTMLInputElement).value) {
			elegido = undefined;
			mostrarModo();
		}
		dibujarChips();
	};

	const alCambiarProducto = () => {
		const nombre = producto.value.trim().toLowerCase();
		const marca = (form.elements.namedItem('marca') as RadioNodeList).value;
		const delCatalogo = catalogo.find((p) => p.nombre.toLowerCase() === nombre && (!marca || p.marca === marca))
			?? catalogo.find((p) => p.nombre.toLowerCase() === nombre);
		// El ticket de la balanza es siempre por kilo y sus números mandan.
		if (delCatalogo && (origen === 'manual' || delCatalogo.tipo === 'kg')) {
			elegido = delCatalogo;
			elegirMarca(delCatalogo.marca);
			if (!precio.value && delCatalogo.precio != null) {
				precio.value = numeroEditable(delCatalogo.precio);
				precio.dataset.calculado = '';
				if (porUnidad() && !peso.value) peso.value = '1';
				precio.dispatchEvent(new Event('input'));
			}
			mostrarModo();
			dibujarChips();
			return;
		}
		elegido = undefined;
		mostrarModo();
		dibujarChips();
		const conocido = productos.find((p) => p.nombre.toLowerCase() === producto.value.trim().toLowerCase());
		if (!conocido) return;
		elegirMarca(conocido.marca);
		if (!precio.value && conocido.precioKg) {
			precio.value = numeroEditable(conocido.precioKg);
			precio.dataset.calculado = '';
			precio.dispatchEvent(new Event('input'));
		}
	};

	function mostrarFoto(blob: Blob | null) {
		if (urlFoto) URL.revokeObjectURL(urlFoto);
		urlFoto = blob ? URL.createObjectURL(blob) : null;
		foto.hidden = !urlFoto;
		if (urlFoto) {
			const img = new Image();
			img.alt = 'Etiqueta del ticket';
			img.src = urlFoto;
			foto.replaceChildren(img);
		} else {
			foto.replaceChildren();
		}
	}

	form.addEventListener('change', alCambiarMarca);
	peso.addEventListener('input', alCambiarPesoOPrecio);
	precio.addEventListener('input', alCambiarPesoOPrecio);
	total.addEventListener('input', alCambiarTotal);
	producto.addEventListener('change', alCambiarProducto);

	const resultado = new Promise<ResultadoRevision | null>((resolver) => {
		const cancelar = () => dialogo.close('cancelar');
		const botonesCancelar = form.querySelectorAll<HTMLButtonElement>('[data-cancelar]');
		botonesCancelar.forEach((b) => b.addEventListener('click', cancelar));

		const alEnviar = (e: SubmitEvent) => {
			e.preventDefault();
			const resultado = validar();
			if (resultado) cerrarCon(resultado);
		};
		form.addEventListener('submit', alEnviar);

		const alCerrar = () => cerrarCon(null);
		dialogo.addEventListener('close', alCerrar);

		function cerrarCon(v: ResultadoRevision | null) {
			if (cerrado) return;
			cerrado = true;
			form.removeEventListener('submit', alEnviar);
			dialogo.removeEventListener('close', alCerrar);
			botonesCancelar.forEach((b) => b.removeEventListener('click', cancelar));
			peso.removeEventListener('input', alCambiarPesoOPrecio);
			precio.removeEventListener('input', alCambiarPesoOPrecio);
			total.removeEventListener('input', alCambiarTotal);
			producto.removeEventListener('change', alCambiarProducto);
			form.removeEventListener('change', alCambiarMarca);
			if (dialogo.open) dialogo.close();
			if (urlFoto) URL.revokeObjectURL(urlFoto);
			resolver(v);
		}
	});

	function validar(): ResultadoRevision | null {
		const { p, q, t } = valores();
		const marca = (form.elements.namedItem('marca') as RadioNodeList).value as string;
		const nombre = producto.value.trim();
		const problemas: string[] = [];
		const pesoMal = peso.value.trim() !== '' && (p == null || p <= 0);
		const precioMal = precio.value.trim() !== '' && (q == null || q <= 0);
		marcarInvalido(producto, !nombre);
		marcarInvalido(total, t == null || t <= 0);
		marcarInvalido(peso, pesoMal);
		marcarInvalido(precio, precioMal);
		if (!marca) problemas.push('elegí la marca');
		if (!nombre) problemas.push('escribí el producto');
		if (t == null || t <= 0) problemas.push('falta el total');
		const cantidadMal = porUnidad() && (p == null || !Number.isInteger(p) || p < 1);
		if (cantidadMal) marcarInvalido(peso, true);
		if (cantidadMal) problemas.push('falta la cantidad');
		else if (pesoMal) problemas.push('el peso no es un número');
		if (precioMal) problemas.push('el precio no es un número');
		if (problemas.length) {
			error.hidden = false;
			const texto = problemas.join(', ');
			error.textContent = texto.charAt(0).toUpperCase() + texto.slice(1) + '.';
			return null;
		}
		return {
			producto: {
				id: productoVenta?.id ?? nuevoId(),
				marca,
				producto: nombre,
				pesoKg: porUnidad() ? null : p,
				precioKg: porUnidad() ? null : q,
				total: t!,
				productoId: elegido?.id || undefined,
				...(porUnidad() ? { cantidad: p!, precioUnidad: q ?? Math.round((t! / p!) * 100) / 100 } : {}),
				// Si al editar no cambiaron los números, se conserva la promoción.
				...(productoVenta?.descuento && productoVenta.total === t && productoVenta.cantidad === p
					? { descuento: productoVenta.descuento, promo: productoVenta.promo }
					: {}),
				origen,
				miniatura,
			},
			marca,
		};
	}

	if (!dialogo.open) dialogo.showModal();
	if (!esperandoLectura && !productoVenta) producto.focus();

	return {
		progreso(mensaje, avance) {
			if (cerrado) return;
			textoLeyendo.textContent = mensaje;
			barra.style.width = `${Math.round(Math.max(0.05, Math.min(1, avance)) * 100)}%`;
		},
		completar(lectura, nuevaMiniatura) {
			if (cerrado) return;
			miniatura = nuevaMiniatura;
			mostrarFoto(miniatura);
			leyendo.hidden = true;
			campos.disabled = false;
			guardar.disabled = false;
			if (lectura.producto) producto.value = lectura.producto;
			peso.value = numeroEditable(lectura.pesoKg);
			precio.value = numeroEditable(lectura.precioKg);
			total.value = numeroEditable(lectura.total);
			totalAMano = lectura.total != null;
			if (lectura.calculado) {
				const campo = { peso, precio, total }[lectura.calculado];
				campo.dataset.calculado = '';
			}
			alCambiarProducto();

			aviso.hidden = false;
			if (lectura.estado === 'verificado') {
				aviso.dataset.tipo = 'ok';
				aviso.textContent = 'Leímos el ticket y la cuenta cierra. Fijate que el producto y la marca estén bien.';
			} else if (lectura.estado === 'calculado' && lectura.calculado) {
				delete aviso.dataset.tipo;
				aviso.textContent = `No se leyó bien el ${NOMBRES_CAMPO[lectura.calculado]}: lo calculamos con la cuenta. Comparalo con la etiqueta.`;
			} else if (lectura.pesoKg != null && lectura.precioKg != null && lectura.total != null) {
				delete aviso.dataset.tipo;
				aviso.textContent = 'Leímos los números pero la cuenta no cierra: alguno está mal leído. Comparalos con la etiqueta.';
			} else {
				delete aviso.dataset.tipo;
				aviso.textContent = 'No pudimos leer todo el ticket. Completá lo que falta mirando la etiqueta.';
			}
			actualizarCuenta();
			const marca = (form.elements.namedItem('marca') as RadioNodeList).value;
			if (!producto.value) producto.focus();
			else if (!marca) form.querySelector<HTMLInputElement>('input[name="marca"]')?.focus();
		},
		fallo(mensaje) {
			if (cerrado) return;
			leyendo.hidden = true;
			campos.disabled = false;
			guardar.disabled = false;
			aviso.hidden = false;
			delete aviso.dataset.tipo;
			aviso.textContent = mensaje;
		},
		resultado,
	};
}

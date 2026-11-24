// Controla la cámara de src/components/Camara.astro.

export type FotoElegida =
	| { tipo: 'camara'; foto: HTMLCanvasElement }
	| { tipo: 'galeria'; foto: File };

/** La cámara de la app solo tiene sentido en celulares y tablets (pantalla táctil). */
export function esCelular(): boolean {
	return matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches;
}

export function hayCamara(): boolean {
	return Boolean(navigator.mediaDevices?.getUserMedia) && isSecureContext;
}

/**
 * Abre la cámara y espera a que se saque una foto, se elija una de la galería
 * o se cierre (devuelve `null`).
 */
export function abrirCamara(): Promise<FotoElegida | null> {
	const raiz = document.getElementById('camara')!;
	const video = document.getElementById('camara-video') as HTMLVideoElement;
	const recuadro = document.getElementById('camara-recuadro')!;
	const disparar = document.getElementById('camara-disparar') as HTMLButtonElement;
	const cerrar = document.getElementById('camara-cerrar') as HTMLButtonElement;
	const galeria = document.getElementById('camara-galeria') as HTMLInputElement;
	const linterna = document.getElementById('camara-linterna') as HTMLButtonElement;
	const estado = document.getElementById('camara-estado')!;

	return new Promise((resolver) => {
		let stream: MediaStream | null = null;
		let terminado = false;

		const mostrarEstado = (texto: string | null) => {
			estado.hidden = !texto;
			estado.textContent = texto ?? '';
		};

		const terminar = (resultado: FotoElegida | null) => {
			if (terminado) return;
			terminado = true;
			stream?.getTracks().forEach((t) => t.stop());
			video.srcObject = null;
			raiz.hidden = true;
			raiz.classList.remove('capturando');
			document.body.style.overflow = '';
			disparar.removeEventListener('click', alDisparar);
			cerrar.removeEventListener('click', alCerrar);
			galeria.removeEventListener('change', alElegir);
			linterna.removeEventListener('click', alLinterna);
			window.removeEventListener('popstate', alVolver);
			// Si se cerró con un botón, se saca la entrada que se agregó al historial.
			if (history.state?.camara) history.back();
			resolver(resultado);
		};

		const alDisparar = () => {
			if (!video.videoWidth) return;
			raiz.classList.add('capturando');
			const foto = recortarRecuadro(video, recuadro);
			// Un instante para que se vea el destello antes de cerrar.
			setTimeout(() => terminar({ tipo: 'camara', foto }), 180);
		};
		const alCerrar = () => terminar(null);
		const alElegir = () => {
			const archivo = galeria.files?.[0];
			galeria.value = '';
			if (archivo) terminar({ tipo: 'galeria', foto: archivo });
		};
		const alLinterna = async () => {
			const pista = stream?.getVideoTracks()[0];
			if (!pista) return;
			const prender = linterna.getAttribute('aria-pressed') !== 'true';
			try {
				await pista.applyConstraints({ advanced: [{ torch: prender } as MediaTrackConstraintSet] });
				linterna.setAttribute('aria-pressed', String(prender));
				linterna.setAttribute('aria-label', prender ? 'Apagar la linterna' : 'Prender la linterna');
			} catch {
				linterna.hidden = true;
			}
		};
		// El botón "atrás" de Android cierra la cámara en vez de salir de la app.
		const alVolver = () => terminar(null);

		raiz.hidden = false;
		document.body.style.overflow = 'hidden';
		disparar.disabled = true;
		linterna.hidden = true;
		linterna.setAttribute('aria-pressed', 'false');
		mostrarEstado('Abriendo la cámara…');
		history.pushState({ camara: true }, '');

		disparar.addEventListener('click', alDisparar);
		cerrar.addEventListener('click', alCerrar);
		galeria.addEventListener('change', alElegir);
		linterna.addEventListener('click', alLinterna);
		window.addEventListener('popstate', alVolver);

		navigator.mediaDevices
			.getUserMedia({
				audio: false,
				video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
			})
			.then(async (s) => {
				if (terminado) {
					s.getTracks().forEach((t) => t.stop());
					return;
				}
				stream = s;
				video.srcObject = s;
				await video.play().catch(() => {});
				mostrarEstado(null);
				disparar.disabled = false;
				const capacidades = s.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
				linterna.hidden = !capacidades?.torch;
			})
			.catch((error: DOMException) => {
				mostrarEstado(
					error.name === 'NotAllowedError'
						? 'No hay permiso para usar la cámara. Podés habilitarlo en los ajustes del navegador o elegir una foto de la galería.'
						: 'No se pudo abrir la cámara. Elegí una foto de la galería.',
				);
			});
	});
}

/**
 * Copia a un canvas la parte del video que se ve dentro del recuadro. El video
 * se muestra con `object-fit: cover`, así que hay que deshacer ese escalado.
 */
function recortarRecuadro(video: HTMLVideoElement, recuadro: HTMLElement): HTMLCanvasElement {
	const pantalla = video.getBoundingClientRect();
	const r = recuadro.getBoundingClientRect();
	const escala = Math.max(pantalla.width / video.videoWidth, pantalla.height / video.videoHeight);
	const sobraX = (video.videoWidth * escala - pantalla.width) / 2;
	const sobraY = (video.videoHeight * escala - pantalla.height) / 2;

	// Un poco de margen: es fácil dejar un borde de la etiqueta afuera.
	const margen = 0.06;
	const x = (r.left - pantalla.left + sobraX - r.width * margen) / escala;
	const y = (r.top - pantalla.top + sobraY - r.height * margen) / escala;
	const ancho = (r.width * (1 + 2 * margen)) / escala;
	const alto = (r.height * (1 + 2 * margen)) / escala;

	const sx = Math.max(0, Math.round(x));
	const sy = Math.max(0, Math.round(y));
	const sw = Math.min(video.videoWidth - sx, Math.round(ancho));
	const sh = Math.min(video.videoHeight - sy, Math.round(alto));

	const canvas = document.createElement('canvas');
	canvas.width = sw;
	canvas.height = sh;
	canvas.getContext('2d')!.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
	return canvas;
}

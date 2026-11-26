// Lee códigos de barras con la cámara, sin conexión. La librería usa ZXing en
// WebAssembly; el archivo se sirve desde la app (por defecto lo bajaría de un
// CDN) y el service worker lo precachea.

import wasm from 'zxing-wasm/reader/zxing_reader.wasm?url';

async function crearLector() {
	const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
	prepareZXingModule({
		overrides: { locateFile: (archivo: string, prefijo: string) => (archivo.endsWith('.wasm') ? wasm : prefijo + archivo) },
	});
	return new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
}

/** Abre la cámara y devuelve el primer código leído, o `null` si se canceló. */
export function leerCodigo(): Promise<string | null> {
	const dialogo = document.getElementById('codigo') as HTMLDialogElement;
	const video = document.getElementById('codigo-video') as HTMLVideoElement;
	const estado = document.getElementById('codigo-estado')!;
	const cerrar = document.getElementById('codigo-cerrar')!;
	estado.textContent = 'Abriendo la cámara…';
	dialogo.returnValue = '';
	dialogo.showModal();

	return new Promise((resolver) => {
		let stream: MediaStream | null = null;
		let terminado = false;
		const terminar = (codigo: string | null) => {
			if (terminado) return;
			terminado = true;
			stream?.getTracks().forEach((t) => t.stop());
			video.srcObject = null;
			cerrar.removeEventListener('click', cancelar);
			dialogo.removeEventListener('close', cancelar);
			if (dialogo.open) dialogo.close();
			resolver(codigo);
		};
		const cancelar = () => terminar(null);
		cerrar.addEventListener('click', cancelar);
		dialogo.addEventListener('close', cancelar);

		void (async () => {
			try {
				const lector = await crearLector();
				const nuevo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
				if (terminado) return nuevo.getTracks().forEach((t) => t.stop());
				stream = nuevo;
				video.srcObject = stream;
				await video.play();
				estado.textContent = 'Acercá el envase hasta que el código entre en el recuadro.';
				while (!terminado) {
					const [leido] = await lector.detect(video);
					if (leido?.rawValue) {
						navigator.vibrate?.(80);
						return terminar(leido.rawValue);
					}
					await new Promise((r) => setTimeout(r, 150));
				}
			} catch (error) {
				console.error(error);
				if (!terminado) estado.textContent = 'No se pudo usar la cámara. Cargá el producto con "A mano".';
			}
		})();
	});
}

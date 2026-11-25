import { registerSW } from 'virtual:pwa-register';

// Actualización automática (registerType 'autoUpdate'): cuando se publica una
// versión nueva, el service worker la descarga y la deja en caché para usarla
// sin conexión, toma el control y la página se recarga sola.
//
// Dos cuidados para el uso en el puesto:
// - La app puede quedar abierta todo el día: además de al abrirla, se busca
//   una versión nueva cada 30 minutos y al volver a la app, si hay señal.
// - La recarga espera a que no haya nada a medio hacer (cargando un producto,
//   cobrando, con la cámara abierta o escribiendo), para no perder lo escrito.

const CADA_MS = 30 * 60 * 1000;

/** Hay algo a medio hacer: una hoja abierta, la cámara o un campo con el cursor. */
function ocupado(): boolean {
	const camara = document.getElementById('camara');
	const activo = document.activeElement;
	return (
		document.querySelector('dialog[open]') != null ||
		(camara != null && !camara.hidden) ||
		(activo instanceof HTMLInputElement && activo.type !== 'file')
	);
}

let recargaPendiente = false;

function recargarCuandoSeaSeguro() {
	if (recargaPendiente) return;
	recargaPendiente = true;
	const intentar = () => {
		if (ocupado()) return;
		clearInterval(revision);
		location.reload();
	};
	const revision = setInterval(intentar, 2000);
	intentar();
}

async function buscarVersionNueva(swUrl: string, registro: ServiceWorkerRegistration) {
	if (registro.installing || !navigator.onLine) return;
	try {
		// Si el servidor no responde (sin señal o caído), no se intenta actualizar.
		const respuesta = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
		if (respuesta.status === 200) await registro.update();
	} catch {
		// Sin conexión: se vuelve a intentar en la próxima revisión.
	}
}

registerSW({
	immediate: true,
	onOfflineReady() {
		document.dispatchEvent(new CustomEvent('pwa:offline-ready'));
	},
	onNeedReload: recargarCuandoSeaSeguro,
	onRegisteredSW(swUrl, registro) {
		if (!registro) return;
		setInterval(() => void buscarVersionNueva(swUrl, registro), CADA_MS);
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') void buscarVersionNueva(swUrl, registro);
		});
	},
});

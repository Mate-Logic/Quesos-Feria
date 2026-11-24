import { registerSW } from 'virtual:pwa-register';

// Con registerType 'autoUpdate' el service worker nuevo se activa solo
// y la página se recarga con la versión actualizada.
registerSW({
	immediate: true,
	onOfflineReady() {
		document.dispatchEvent(new CustomEvent('pwa:offline-ready'));
	},
});

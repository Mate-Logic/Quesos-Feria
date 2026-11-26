/// <reference types="@unplugin-pwa/core/info" />
/// <reference types="@unplugin-pwa/core/vanillajs" />

declare module '*.wasm?url' {
	const url: string;
	export default url;
}

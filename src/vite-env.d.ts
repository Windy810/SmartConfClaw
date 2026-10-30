/// <reference types="vite/client" />

interface Window {
	__TAURI__?: unknown;
	__TAURI_INTERNALS__?: unknown;
}

// React 19 types no longer declare a global `JSX` namespace; components here annotate their
// return type as `JSX.Element`, so keep that name available.
declare namespace JSX {
	type Element = import("react").JSX.Element;
}

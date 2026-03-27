import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { currentWindowLabel } from "./lib/windowLabel";
import "./index.css";

if (currentWindowLabel !== "main") {
	const style = document.createElement("style");
	style.textContent =
		"html, body, #root { background: transparent !important; overflow: hidden; }";
	document.head.appendChild(style);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);

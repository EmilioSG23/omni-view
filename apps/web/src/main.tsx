import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { ModalProvider } from "./context/ModalProvider.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ErrorBoundary>
			<ModalProvider>
				<App />
			</ModalProvider>
		</ErrorBoundary>
	</StrictMode>,
);

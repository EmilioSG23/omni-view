import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { ModalProvider } from "./context/ModalProvider.tsx";
import { ThemeProvider } from "./context/ThemeProvider.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ErrorBoundary>
			<ThemeProvider>
				<ModalProvider>
					<App />
				</ModalProvider>
			</ThemeProvider>
		</ErrorBoundary>
	</StrictMode>,
);

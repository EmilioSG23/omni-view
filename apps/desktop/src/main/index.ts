import { app, BrowserWindow } from "electron";
import { join } from "path";

function createWindow(): void {
	const win = new BrowserWindow({
		width: 1280,
		height: 800,
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			contextIsolation: true,
			sandbox: true,
		},
	});

	// In development, load the Vite dev server for apps/web.
	// In production, load the built output from apps/web/dist.
	if (process.env.NODE_ENV === "development") {
		win.loadURL("http://localhost:5173");
	} else {
		win.loadFile(join(__dirname, "../../web/dist/index.html"));
	}
}

app.whenReady().then(() => {
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

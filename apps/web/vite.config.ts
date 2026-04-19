import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		proxy: {
			"/api": {
				target: "http://localhost:3000",
				changeOrigin: true,
				ws: true,
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
			"@omni-view/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
		},
	},
});

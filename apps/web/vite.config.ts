import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const backendUrl = env.VITE_BACKEND_URL || "http://localhost:4000";

	return {
		plugins: [react(), tailwindcss()],
		server: {
			proxy: {
				"/api": {
					target: backendUrl,
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
	};
});

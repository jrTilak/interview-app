import { fileURLToPath, URL } from "node:url";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		tanstackRouter({ autoCodeSplitting: true, target: "react" }),
		react(),
		VitePWA({
			devOptions: { enabled: false },
			injectRegister: "auto",
			manifest: {
				background_color: "#f4f5f7",
				description: "Create, share, and take structured interviews.",
				display: "standalone",
				icons: [
					{
						src: "/pwa-192x192.png",
						sizes: "192x192",
						type: "image/png",
						purpose: "any",
					},
					{
						src: "/pwa-512x512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "any",
					},
					{
						src: "/pwa-maskable-512x512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
				name: "Interview Desk",
				orientation: "landscape",
				short_name: "Interview Desk",
				start_url: "/",
				theme_color: "#172522",
			},
			registerType: "prompt",
			workbox: {
				cleanupOutdatedCaches: true,
				globIgnores: ["**/vision_wasm_*.wasm"],
				navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/socket\.io(?:\/|$)/],
				runtimeCaching: [
					{
						handler: "NetworkOnly",
						urlPattern: ({ url }) =>
							url.pathname.startsWith("/api/") ||
							url.pathname.startsWith("/socket.io/"),
					},
				],
			},
		}),
	],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	server: {
		host: "0.0.0.0",
		port: 5173,
		proxy: {
			"/api": {
				changeOrigin: true,
				target:
					process.env.VITE_API_PROXY_TARGET?.trim() ?? "http://localhost:3000",
			},
			"/socket.io": {
				changeOrigin: true,
				target:
					process.env.VITE_API_PROXY_TARGET?.trim() ?? "http://localhost:3000",
				ws: true,
			},
		},
	},
	test: {
		css: true,
		environment: "jsdom",
		setupFiles: ["./src/test/setup.ts"],
	},
});

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { browserslistToTargets } from 'lightningcss';
import browserslist from 'browserslist';

// During `pnpm dev`, vite doesn't serve our Vercel Edge functions (api/*.ts).
// Without this proxy, /api/proxy and /api/session return the SPA's index.html,
// which causes the Edge browser iframe to load this app recursively. Forward
// /api/* to the live deployment so local dev exercises the real backend.
// Override target with VITE_API_PROXY_TARGET (e.g. `vercel dev` at :3000).
const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'https://windows-web-gray.vercel.app';

export default defineConfig({
	base: './',
	plugins: [svelte()],
	resolve: {
		alias: {
			'~': new URL('./src/', import.meta.url).pathname,
		},
	},
	build: {
		minify: 'terser',
		cssMinify: 'lightningcss',
	},
	css: {
		transformer: 'lightningcss',
		lightningcss: {
			targets: browserslistToTargets(browserslist('defaults, not IE 11, not IE_Mob 11, not dead')),
		},
	},
	server: {
		proxy: {
			'/api': {
				target: API_PROXY_TARGET,
				changeOrigin: true,
				secure: true,
				// SSE / EventSource needs ws: false (we want plain HTTP streaming).
				ws: false,
			},
		},
	},
	preview: {
		port: 4200,
	},
});

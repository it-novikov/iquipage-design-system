import {resolve} from 'node:path';
import {defineConfig} from 'vite';
export default defineConfig({
  root: 'web',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {input: {
      app: resolve(import.meta.dirname,'web/index.html'),
      about: resolve(import.meta.dirname,'web/about.html'),
      privacy: resolve(import.meta.dirname,'web/privacy.html'),
      terms: resolve(import.meta.dirname,'web/terms.html'),
    }},
  },
  server: {proxy: {'/api': 'http://127.0.0.1:4311', '/auth': 'http://127.0.0.1:4311'}}
});

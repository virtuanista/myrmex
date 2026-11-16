import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2022', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 5000 },
  server: { port: 4747, host: '127.0.0.1', strictPort: true },
});

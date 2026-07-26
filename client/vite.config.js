import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: currentDirectory,
  plugins: [react()],
  base: '/',
  publicDir: path.resolve(currentDirectory, 'public'),
  build: {
    outDir: path.resolve(currentDirectory, '../dist'),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022'
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8090',
      '/media': 'http://127.0.0.1:8090'
    }
  }
});

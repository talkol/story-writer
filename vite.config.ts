import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build runs from any path — a domain root, a GitHub
  // Pages project subdirectory, or a nested folder on a plain static host. Safe
  // because routing is hash-based and never touches the server path.
  base: './',
  server: { port: 5173, host: true },
});

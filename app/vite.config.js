import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// La API Express escucha solo en loopback. Vite la alcanza por 127.0.0.1 (no 'localhost', que puede
// resolverse a IPv6) y reenvía /api, así el celular solo necesita la IP de la laptop y el puerto de Vite.
const API_LOCAL = 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Accesible desde la red local (celular en el mismo Wi-Fi). No es para publicar en internet.
    host: true,
    port: 5173,
    strictPort: true,
    proxy: { '/api': API_LOCAL },
  },
  preview: { host: true, port: 4173, strictPort: true, proxy: { '/api': API_LOCAL } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/preparar.js'] },
});

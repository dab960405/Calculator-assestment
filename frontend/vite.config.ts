import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        // Drop the connection when the backend is down so the browser sees a
        // network failure, as it would without the proxy, instead of a 502.
        configure: (proxy) => {
          proxy.on('error', (_error, _req, res) => res.destroy());
        },
      },
    },
  },
});

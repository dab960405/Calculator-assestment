import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

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
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      // The second text reporter writes the same table to a file for /coverage/frontend.txt.
      reporter: [
        ['text', { skipFull: false }],
        ['text', { skipFull: false, file: 'coverage-summary.txt' }],
        'html',
        'lcov',
      ],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/**/*.d.ts',
        'src/api/types.ts',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
      ],
      thresholds: {
        'src/{api,domain,hooks}/**': { lines: 85, statements: 85, functions: 85, branches: 85 },
      },
    },
  },
});

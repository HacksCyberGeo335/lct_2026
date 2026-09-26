import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.API_PROXY_TARGET || 'http://127.0.0.1:8080';
  return {
    plugins: [react()],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'motion',
                test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/,
              },
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              { name: 'data', test: /node_modules[\\/](zod|papaparse|@tanstack)[\\/]/ },
            ],
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target, changeOrigin: true }, '/health': { target, changeOrigin: true } },
    },
    preview: { port: 4173, strictPort: true },
  };
});

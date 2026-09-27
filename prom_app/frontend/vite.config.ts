import { defineConfig, loadEnv, type Plugin, type Connect } from 'vite';
import { existsSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.API_PROXY_TARGET || 'http://127.0.0.1:8080';
  return {
    plugins: [react(), staticAssetBoundary()],
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

/** Missing public files must not turn into an HTML SPA response, including in local preview. */
function staticAssetBoundary(): Plugin {
  const install = (server: {
    config: { publicDir: string };
    middlewares: { use: (handler: Connect.NextHandleFunction) => void };
  }) => {
    server.middlewares.use((req, res, next) => {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (pathname.startsWith('/tests/')) {
        res.statusCode = 404;
        res.end();
        return;
      }
      if (!/^\/(media|inspection|catalog|fonts)\//.test(pathname)) {
        next();
        return;
      }
      let file: string;
      try {
        file = resolve(server.config.publicDir, '.' + decodeURIComponent(pathname));
      } catch {
        res.statusCode = 400;
        res.end();
        return;
      }
      if (
        !file.startsWith(resolve(server.config.publicDir) + sep) ||
        !existsSync(file) ||
        !statSync(file).isFile()
      ) {
        res.statusCode = 404;
        res.end();
        return;
      }
      next();
    });
  };
  return { name: 'static-asset-boundary', configureServer: install, configurePreviewServer: install };
}

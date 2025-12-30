import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist/main',
            sourcemap: true,
            rollupOptions: {
              external: ['better-sqlite3', 'electron', 'tiktoken']
            }
          },
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'src/shared'),
              '@main': path.resolve(__dirname, 'src/main')
            }
          }
        }
      },
      {
        entry: 'src/preload.ts',
        vite: {
          build: {
            outDir: 'dist/preload',
            sourcemap: true
          }
        },
        onstart(options) {
          options.reload();
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer')
    }
  },
  build: {
    outDir: 'dist/renderer',
    sourcemap: true
  },
  server: {
    port: 5173
  }
});

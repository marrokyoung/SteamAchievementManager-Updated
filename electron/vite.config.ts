import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry
        entry: path.resolve(__dirname, 'main/index.ts'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron'),
            rollupOptions: {
              external: ['electron'],
              output: {
                entryFileNames: 'index.js',
                format: 'cjs'
              }
            }
          }
        }
      },
      {
        // Preload script
        entry: path.resolve(__dirname, 'preload/index.ts'),
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron'),
            rollupOptions: {
              external: ['electron'],
              output: {
                entryFileNames: 'preload.js',
                format: 'cjs'
              }
            }
          }
        }
      }
    ]),
    renderer()
  ],
  root: 'web',
  build: {
    outDir: '../dist'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './web/src')
    }
  }
})

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import wasmInlinePlugin from './vite-plugin-wasm-inline'

export default defineConfig({
  plugins: [wasmInlinePlugin(), vue(), viteSingleFile()],
  base: './',
  server: {
    port: 5174
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'esnext',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000
  }
})

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import wasmInlinePlugin from './vite-plugin-wasm-inline'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [wasmInlinePlugin(), vue(), viteSingleFile()],
  base: './',
  // 注入版本号：侧边栏展示的版本与 package.json 单一来源，避免两处手改不同步
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
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

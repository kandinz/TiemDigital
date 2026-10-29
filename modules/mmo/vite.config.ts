import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwind from 'tailwindcss-mmo';
import autoprefixer from 'autoprefixer';
import { fileURLToPath, URL } from 'node:url';
import tailwindConfig from './tailwind.config.js';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/mmo/',
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  css: { postcss: { plugins: [tailwind({ ...tailwindConfig, content: [fileURLToPath(new URL('./src/**/*.{vue,ts}', import.meta.url))] }), autoprefixer()] } },
  build: { outDir: '../../dist/mmo', emptyOutDir: true },
});

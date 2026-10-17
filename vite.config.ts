import { defineConfig } from 'vite';

// GitHub Pages はサブパス配信になるため相対パスでビルドする
export default defineConfig({
  base: './',
});

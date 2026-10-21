import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// 画面の端に出すバージョン表記：コミットの短いID＋ビルドした日時（日本時間）
function buildLabel(): string {
  let sha = process.env.GITHUB_SHA?.slice(0, 7) ?? '';
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short=7 HEAD').toString().trim();
    } catch {
      sha = 'dev';
    }
  }
  const jst = new Date(Date.now() + 9 * 3600 * 1000).toISOString();
  return `${sha} · ${jst.slice(5, 10).replace('-', '/')} ${jst.slice(11, 16)}`;
}

// GitHub Pages はサブパス配信になるため相対パスでビルドする
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(buildLabel()) },
});

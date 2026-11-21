import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

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
const BUILD = buildLabel();

// オフライン用の保存（public/sw.js）の名前にビルドの版を入れる。更新すると古い画面・古い保存が必ず入れ替わる
function swVersion(): Plugin {
  return {
    name: 'sw-version',
    apply: 'build',
    writeBundle(opts) {
      const file = join(opts.dir ?? 'dist', 'sw.js');
      if (!existsSync(file)) return;
      const tag = BUILD.replace(/[^0-9A-Za-z]/g, '');
      writeFileSync(file, readFileSync(file, 'utf8').replace("'hatake-slot-v1'", `'hatake-slot-${tag}'`));
    },
  };
}

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [swVersion()],
});

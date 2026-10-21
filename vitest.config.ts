import { defineConfig } from 'vitest/config';

// ルールの単体テスト（画面に依存しない部分）。通しの確認は tests/e2e（Playwright）
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});

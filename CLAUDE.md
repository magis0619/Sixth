# 畑スロット 開発メモ

## 必ず守ること
- 画面に情報を出す・変えるときは、毎回 **`docs/ui-reading.md`（情報の読み取りやすさ）** を読み、その決まりに沿って作る。
  - 1行に1つのこと、短く。数字と絵で言えることは文字にしない。
  - 伝えることは同じ幅の行に1つずつ並べる。その場面で要らないことは書かない。
  - 文字は本文15px以上・補足13px以上。12px以下は使わない。
- 今のルールは `docs/rules.md` にまとめてある。ルールを変えたら、ここも直す。
- 画面の確認は縦画面（p430）だけでよい（横画面・PCは見なくてよい）。
- 絵文字はUIに使わない。絵は `src/art.ts` の自作SVG。

## 確かめるコマンド
- 型：`npx tsc --noEmit -p .`
- 単体テスト：`npx vitest run`
- 通しのテスト：`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test`
- 画面の点検：`npx vite build && npm run audit -- <出力先> p430`（先に `vite preview --port 4173` を起動）
- 自動プレイ：`npm run sim -- 400 starter smart`

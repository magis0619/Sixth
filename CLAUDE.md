# 畑スロット 開発メモ

## 必ず守ること
- 画面に情報を出す・変えるときは、毎回 **`docs/ui-reading.md`（情報の読み取りやすさ）** を読み、その決まりに沿って作る。
  - 1行に1つのこと、短く。数字と絵で言えることは文字にしない。
  - 伝えることは同じ幅の行に1つずつ並べる。その場面で要らないことは書かない。
  - 文字は本文15px以上・補足13px以上。12px以下は使わない。
- 画面の日本語を書き足す・変えるときは、`.claude/skills/yomiyasu`（日本語の推敲の決まり）で読み直す。比喩の動詞・英語の直訳語・作った言葉・ぼんやりした言い方を避け、コードの動きと同じことを書く。ゲームの決まった言葉（札・出目・市・年貢など）は `.yomiyasu-words/allow.txt` にあり、直さない。
- 今のルールは `docs/rules.md` にまとめてある。ルールを変えたら、ここも直す。
- 想定ビルド（クリアのためにプレイヤーが目指す方針。例：苺と巣箱ビルド）は `docs/builds.md` にまとめてある。ルール・数値・札・お守り・置き物を変えたら、関係するビルドの行（要る物・強さ）も直す。プレイログを分析したら、その表の「確かめた記録」に1行足す。
- 画面の確認は縦画面（p430）だけでよい（横画面・PCは見なくてよい）。
- 絵文字はUIに使わない。絵は `src/art.ts` の自作SVG。
- CSS は `src/style.css` が `src/styles/01〜11` を順に読み込む。後ろの決まりが前を上書きするので順番は変えず、新しい決まりは `11-screens.css` の末尾に足す。
- 画面の部品は `src/ui/`（市＝market.ts、上の表示＝hud.ts、チュートリアル＝tutorial.ts など）。遊んでいる間の操作の状態（選んでいる出目・チュートリアルの段など）は `src/ui/play.ts` の `play` にまとめてある。

## 確かめるコマンド
- 型：`npx tsc --noEmit -p .`
- 単体テスト：`npx vitest run`
- 通しのテスト：`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test`
- 画面の点検：`npx vite build && npm run audit -- <出力先> p430`（先に `vite preview --port 4173` を起動）
- 自動プレイ：`STOPCLEAR=1 DIFF=0 npm run sim -- 300 starter player`（player＝プレイヤー程度に考えるボット。DIFF＝難しさ。TAX・DMULT・REELUP・SEEDW で年貢やルールを差し替えて試せる。LORD=1〜3 で殿様モード）

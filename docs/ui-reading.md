# 情報の読み取りやすさ（UIを作るときに毎回見る）

ゲームでプレイヤーが情報を読み取るときの原則を、ネットの資料から集めて、このゲームの決まりに落としたもの。
画面に情報を足す・変えるときは、必ずこの表で確かめる。

---

## 1. 集めた原則（出典つき）

| # | 原則 | 中身 | 出典 |
|---|---|---|---|
| 1 | **プレイヤーは文字を読まない** | 画面に出した文章は、かなりの割合で読み飛ばされる。案内は「見落とせない形」にすると迷いが減る | [7 UX Lessons From The Trenches（GameDev.net）](https://gamedev.net/articles/game-design/ux-for-games/7-ux-lessons-from-the-trenches-r4969/) |
| 2 | **大事な順に目立たせる** | 大きさ・位置・コントラストで、目の行き先を決める。全部が同じ強さだと読み取れない | [Roblox：UI and UX design（情報の階層）](https://create.roblox.com/docs/production/game-design/ui-ux-design)・[How to design a readable HUD](https://bugnet.io/blog/how-to-design-a-readable-hud) |
| 3 | **出す物を減らす** | 置く理由がある物だけ出す。目立たせる理由が言えない物は小さくする | [How to design a readable HUD](https://bugnet.io/blog/how-to-design-a-readable-hud)・[Make your game's interface clearer](https://indieklem.substack.com/p/make-your-games-interface-clearer) |
| 4 | **視野の端では文字は読めない** | 周辺視野では文字はほぼ読めない。端に出す物は、大きく・太く・強いコントラストの形で | [Perceiving without looking（Game Developer）](https://gamedeveloper.com/design/perceiving-without-looking-designing-huds-for-peripheral-vision) |
| 5 | **要る時にだけ出す** | その場面でしか要らない情報は、その場面で出す | [How to design a readable HUD](https://bugnet.io/blog/how-to-design-a-readable-hud) |
| 6 | **短く、平易な言葉で** | 平易な言葉と、飾りの少ない文字。大事な説明は文字だけに頼らず、絵でも伝える | [Game Accessibility Guidelines（基本）](https://gameaccessibilityguidelines.com/basic/)・[Unity：アクセシビリティの基本](https://unity.com/blog/video-game-accessibility-basics) |
| 7 | **読める大きさとコントラスト** | 読みやすい既定の文字の大きさ。文字のコントラストは 4.5:1 以上（大きい文字は 3:1） | [Unity：アクセシビリティの基本](https://unity.com/blog/video-game-accessibility-basics)・[Xbox：文字の表示](https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-101-text-display.md) |
| 8 | **繰り返す言葉は記号に** | 何度も出る言葉は、記号（アイコン）に置き換える。ただし絵だけだと意味が分からないので、短い文字と組にする | [5 Graphic Design and Typography Tips for your Card Game](https://danielsolisblog.blogspot.com/2011/11/5-graphic-design-and-typography-tips.html)・[Effective Reference Cards](https://herotime1.com/academy/design/how-to-design-effective-reference-cards-for-your-board-game/) |
| 9 | **飾りの文は遊びの文と競わせない** | 遊びに関係ない文は目立たせない | [4 Layout Tips for Designing Card Games](https://medium.com/@dylanmangini/4-layout-tips-for-designing-card-games-17cc98b89b96) |
| 10 | **形は働きに従う・覚えさせない** | 見た目で働きが分かるように。覚えることを減らし、同時に追うものを少なく、少しずつ増やす | [Celia Hodent（The Gamer's Brain）のまとめ](https://www.creativebloq.com/features/how-neuroscience-and-ux-impacts-video-game-design)・[作業記憶に合わせた設計](https://ixdf.org/literature/article/design-for-working-memory-players-will-remember-what-matters) |
| 11 | **実際の条件で試す** | 実際の距離・明るさ・画面で読めるかを確かめる。遊んでいる人を見て、迷う所を探す | [Card game typography tips](https://danielsolisblog.blogspot.com/2011/11/5-graphic-design-and-typography-tips.html)・[GameDev.net](https://gamedev.net/articles/game-design/ux-for-games/7-ux-lessons-from-the-trenches-r4969/) |

※ どれも開発者の記事が中心で、数字（文字の大きさなど）は資料によって違う。目安として使う。

---

## 2. このゲームでの決まり

### 文字
- **1行に1つのこと**。1行は全角14文字くらいまで。読点で2つ目のことをつながない。
- **数字と絵で言えることは文字にしない**（「売値4」→ 金貨の絵＋4）。
- 文字の大きさは、本文 **15px（0.9375rem）以上**、補足でも **13px（0.8125rem）以上**。12px以下は使わない。
- 文字の色は、地の色と 4.5:1 以上の差。薄い灰色の小さい字は使わない。
- 遊びに関係ない言葉（「〜しよう」「まずはここから」など）は、なくても困らなければ消す。

### 書体と太さ
- 書体は **Zen Maru Gothic**（日本語）。**数字と記号だけ M PLUS Rounded 1c**（幅がそろい、日本語と大きさが釣り合う）。`src/styles/07-shop-tutorial.css` の `:root` の font-family と `--font-pop` は同じ並び。
- 太さは5つだけ使う：タイトル・大見出し **900**／見出し・品の名前・大事な数字 **700**／本文 **500**（`:root` の既定）／補足（13px・薄い墨）**500**／注意書き **400**。800は書体に無いので使わない（900に飛んで全部太く見える）。
- Zen Maru は同じ px でも字が小さく見えるので、ふだんの大きさは **本文16px・補足14px**（下限の15px・13pxより1つ上）。小さい字は太くしない（太い小さな漢字は「回」が「◎」、「日」が「8」に見える）。補足の色は濃いめの墨（`--ink-soft: #54473a`）。
- 数字のあとの単位（日目・回・個）は `<i class="u">` で細く小さめに。数字と同じ要素の中に入れる（flex のすき間で離れないように）。
- 数字の幅をそろえる `tabular-nums` は、縦に並ぶ・増え減りする所だけ（所持金・年貢・値札・市の帯・結果の表・記録）。ほかは普通の幅（「7 日目」と離れないように）。
- Webフォントが届かないときは、ヒラギノ丸ゴ → ヒラギノ角ゴ → Noto Sans JP → 游ゴシックの順で出る。

### 説明カード・札
- 伝えることは、**同じ幅の行（同じ形の帯）に1つずつ**並べる。行の頭に絵、後ろに数字か一言。
- **一番大事な1つ**（何をする札か）を一番大きく。ほかは同じ強さで並べる。
- その場面で要らないこと（例：初めての札の説明に、3つそろったときの話）は書かない。
- 説明カードは画面の幅いっぱいに近い大きさで、絵を大きく。

### 画面
- 目立たせる順番を決めてから作る：①今やること ②危ないこと ③数字 ④そのほか。
- 端に出す情報（お金・年貢・曜日）は、文字より色と形で分かるように（赤＝足りない、金＝今日など）。
- 1つの画面で新しく覚えることは1つまで。増やすときは、別の場面に分ける。

### 軽さ（PCの大きな画面でも重くしない）
- ずっと続く動きや、画面の広い所の動きは **transform・opacity・translate・scale だけ** で作る。margin・width・box-shadow・filter・background-position を動かすと毎コマ描き直しになる。
- 画面いっぱいの背景の色を transition で変えない（その間ずっと全画面を描き直す）。body の `background-attachment: fixed` は外さない（外すと描き直す範囲が広がる）。
- 演出で位置を測るのは `center()`（同じコマの中では測った値を使い回す）。演出の中で offsetWidth などを読まない。
- 舞う葉は8つまで。15秒触らないと飾りの動きを止める（html.idle）。
- 全画面の層に will-change を付けない（その層を丸ごと描くことになり、かえって重い）。

### 確かめ方
- 縦画面（430×932）で撮って、**指でスクロールせずに読めるか**、**3秒で何の画面か分かるか**を見る。
- 文字が12px以下・2行以上の説明・同じ強さの物が並びすぎ、がないかを点検する。

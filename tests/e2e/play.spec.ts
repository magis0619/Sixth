import { expect, test, type Page } from '@playwright/test';

// 画面の通し確認：タイトル → 準備 → 遊ぶ（植える・使う・売る・次の日）→ 年貢 → 終わり
// 演出は控えめにして待ち時間を短くする。脈打ち続けるボタン（スタートなど）は止まらないので force で押す

async function boot(page: Page, opts: { tutorial?: boolean } = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((tutorial: boolean) => {
    try {
      if (!sessionStorage.getItem('e2e')) {
        localStorage.clear();
        sessionStorage.setItem('e2e', '1');
        // ふだんの確認ではチュートリアルを済ませた状態から
        if (!tutorial) localStorage.setItem('hatake-slot:meta', JSON.stringify({ tutorialDone: true }));
      }
      localStorage.setItem('hatake-slot:calm', '1');
      localStorage.setItem('hatake-slot:lang', 'ja');
      localStorage.setItem('hatake-slot:noexplain', '1');
    } catch { /* 保存できなくても遊べる */ }
  }, !!opts.tutorial);
  await page.goto('./');
  return errors;
}

async function start(page: Page): Promise<void> {
  await page.click('#title-start', { force: true });
  await expect(page.locator('#prep-start')).toBeVisible();
  // 準備の窓が入ってくる動きの途中で押すと外れるので、止まってから押す
  await page.click('#prep-start');
  await expect(page.locator('#overlay')).not.toHaveClass(/show/);
}

/** 回転と演出が終わり、次の操作を受け付けるまで待つ。お守りの3択が出たら1つ選ぶ */
/**
 * 押せる状態になるまで待つ。出たばかりの画面（.arming）と、連打の続きを飲み込む間（html.tap-hold）は押しても効かない
 * （急いで連打する人の誤操作を防ぐ仕組み。src/ui/tapguard.ts）
 */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.documentElement.classList.contains('tap-hold') && !document.querySelector('.arming'), null, { timeout: 5_000 });
}

async function settle(page: Page): Promise<'play' | 'over' | 'clear'> {
  for (let k = 0; k < 150; k++) {
    await ready(page);
    if (await page.locator('#overlay.show #restart').count()) return 'over';
    if (await page.locator('#overlay.show #clear-continue').count()) return 'clear';
    // お守りの3択が出ていれば1つ選ぶ（お邪魔の窓より先に見る）
    const card = page.locator('#overlay.show .charm-card:not([disabled])').first();
    if (await card.count()) { await card.click({ force: true, timeout: 1000 }).catch(() => {}); await page.waitForTimeout(300); continue; }
    // 年貢のあと：お邪魔が袋に入る窓（見えているときだけ押す）
    if (await page.locator('#overlay.show .pest-modal #pest-ok:visible').count()) { await page.click('#pest-ok', { timeout: 1000 }).catch(() => {}); await page.waitForTimeout(1000); continue; }
    // 市の日：仕入れを1つ選んでから市を閉じる
    const take = page.locator('#offer-screen:not([hidden]) [data-take]').first();
    if (await take.count()) { await take.click({ force: true, timeout: 1000 }).catch(() => {}); await page.waitForTimeout(400); continue; }
    if (await page.locator('#sheet.open').count()) { await page.click((await page.locator('#sheet.open[data-pane="shop"]').count()) ? '#market-next' : '#sheet-close', { force: true }).catch(() => {}); await page.waitForTimeout(300); continue; }
    // お守りでもらった道具（大かかしなど）は、畑に置くまで先へ進めない
    const stock = await page.evaluate(() => JSON.parse(localStorage.getItem('hatake-slot:run') ?? 'null')?.stock?.length ?? 0);
    const spot = page.locator('#field .plot.target').first();
    if (stock && !(await page.locator('#overlay.show, #sheet.open').count()) && (await spot.count())) { await spot.click({ force: true }).catch(() => {}); await page.waitForTimeout(300); continue; }
    const spinReady = await page.locator('#spin').evaluate((n) => !(n as HTMLButtonElement).disabled);
    if (spinReady && !(await page.locator('#overlay.show').count())) return 'play';
    await page.waitForTimeout(100);
  }
  throw new Error('操作できる状態に戻らない');
}

/** 最初の回転を回して、1日目に入るまで待つ */
async function firstDay(page: Page): Promise<void> {
  await page.locator('#reels .reel').first().click({ force: true });
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem('hatake-slot:run')), { timeout: 15_000 }).toBe(true);
  await settle(page);
}

async function useReels(page: Page): Promise<number> {
  let used = 0;
  for (let k = 0; k < 12; k++) {
    // 選んだリールは .selected になる。選んでいなければ使えるリールを選ぶ
    if (!(await page.locator('.reel.selected').count())) {
      const reel = page.locator('.reel.usable').first();
      if (!(await reel.count())) break;
      await reel.click({ force: true });
      // 満月はタップだけで使い終わる
      if (!(await page.locator('.reel.selected').count())) { await settle(page); used++; continue; }
    }
    const target = page.locator('.plot.target').first();
    if (!(await target.count())) {
      // 置けるマスがない：選択を外して終わり
      await page.locator('.reel.selected').click({ force: true });
      break;
    }
    await target.click({ force: true });
    await settle(page);
    used++;
  }
  return used;
}

test('タイトルから始めて、植えて育てて売り、年貢まで進む', async ({ page }) => {
  // 並べて動かすと遅くなるので長めに（単独なら2分弱）
  test.setTimeout(480_000);
  const errors = await boot(page);
  await expect(page.locator('#title-start')).toBeVisible();
  await expect(page.locator('#build-label')).toContainText(/\S/);
  await start(page);

  let soldLine = false;
  let usedTotal = 0;
  let end: 'play' | 'over' | 'clear' = 'play';
  for (let d = 1; d <= 16 && end === 'play'; d++) {
    // 使える出目がなければ、リールのタップがそのまま「回す」
    await page.locator('#reels .reel').first().click({ force: true });
    const modal = page.locator('#overlay.show #skip-yes');
    await page.waitForTimeout(150);
    await ready(page);
    if (await modal.count()) await modal.click({ force: true });
    end = await settle(page);
    if (end !== 'play') break;
    usedTotal += await useReels(page);
    const ripe = page.locator('.plot.ripe').first();
    if (await ripe.count()) {
      soldLine ||= (await page.locator('.plot.ripe.line').count()) > 0;
      const before = await page.locator('#gold-box').innerText();
      await ripe.click({ force: true });
      await settle(page);
      // 演出の途中のタップは受け付けないので、売れていなければもう一度押す
      await expect(async () => {
        if ((await page.locator('#gold-box').innerText()) === before && (await ripe.count())) await ripe.click({ force: true, timeout: 1000 });
        expect(await page.locator('#gold-box').innerText()).not.toBe(before);
      }).toPass({ timeout: 15_000 });
    }
  }
  const day = await page.evaluate(() => JSON.parse(localStorage.getItem('hatake-slot:run') ?? 'null')?.day ?? null);
  expect(usedTotal).toBeGreaterThan(0);
  // 1回目の年貢（7日目）は越えている。終わっていれば保存は消える
  if (end === 'play') expect(day).toBeGreaterThan(7);
  test.info().annotations.push({ type: 'run', description: `end=${end} day=${day} line=${soldLine}` });
  expect(errors).toEqual([]);
});

test('出目を残して回すと確認が出て、もどるで残る', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  await firstDay(page);
  // 使える出目があるうちに、使い終わった・自動のリールを押す（なければ確認は出ない）。
  // 手動の出目が今は使えないリールは、理由を出すだけで次の日へは進まない
  const unusable = page.locator('#reels .reel.used').first();
  if ((await page.locator('.reel.usable').count()) && (await unusable.count())) {
    await unusable.click({ force: true });
    await expect(page.locator('#overlay.show #skip-no')).toBeVisible();
    await page.click('#skip-no', { force: true });
    await expect(page.locator('#overlay')).not.toHaveClass(/show/);
    expect(await page.locator('.reel.usable').count()).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

/** 指で長押し（0.7秒）して離す */
async function hold(page: Page, selector: string): Promise<void> {
  const box = (await page.locator(selector).first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
}

test('畑のマスとリールを長押しすると説明が出る', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  await firstDay(page);
  await hold(page, '#field .plot');
  await expect(page.locator('.info-pop')).toBeVisible();
  await page.mouse.click(5, 5);
  // 使える出目がない日は「次の日へ」の札がリールを覆うので、リールの長押しは札がないときだけ
  if (!(await page.locator('#machine.ready-spin').count())) {
    await hold(page, '#reels .reel');
    await expect(page.locator('.info-pop')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('続きから：途中でページを開き直すと同じ日から再開できる', async ({ page }) => {
  await boot(page);
  await start(page);
  await firstDay(page);
  await page.reload();
  await expect(page.locator('#title-resume')).toContainText('1日目');
  await page.click('#title-resume', { force: true });
  await expect(page.locator('#overlay')).not.toHaveClass(/show/);
  expect(await page.locator('#reels .reel').count()).toBeGreaterThan(0);
});

test('解放と遊び方の画面が開いて戻れる', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#title-unlock');
  await expect(page.locator('#unlock-back')).toBeVisible();
  await page.click('#unlock-back');
  await page.click('#title-help');
  await expect(page.locator('#help-close')).toBeVisible();
  await page.click('#help-close');
  await expect(page.locator('#title-start')).toBeVisible();
  expect(errors).toEqual([]);
});

test('お守りの3択を連打しても1つしか取れず、最後（7回目・49日目）の年貢でクリア画面が残る', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  await firstDay(page);
  // 最後の年貢の日に書き換える
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('hatake-slot:run')!);
    Object.assign(s, { day: 49, taxesPaid: 6, gold: 9999 });
    for (const id of Object.keys(s.charms)) s.charms[id] = 0;
    localStorage.setItem('hatake-slot:run', JSON.stringify(s));
  });
  await page.reload();
  await page.click('#title-resume', { force: true });
  await page.evaluate(() => document.getElementById('spin')!.click());
  const skip = page.locator('#overlay.show #skip-yes');
  await page.waitForTimeout(150);
  await ready(page);
  if (await skip.count()) await skip.click({ force: true });
  // 年貢のあと、お邪魔が袋に入る窓を進める
  const pest = page.locator('#overlay.show #pest-ok');
  await expect(pest).toBeVisible({ timeout: 20_000 });
  await ready(page);
  await pest.click({ force: true });
  const card = page.locator('#overlay.show .charm-card:not([disabled])').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  // 「畑を見る」で窓が隠れて畑が見え、どこを押しても窓に戻る
  await page.click('#overlay.show .charm-peek');
  await expect(page.locator('#overlay.peek .charm-modal')).toBeHidden();
  await expect(page.locator('#overlay.peek .peek-back')).toBeVisible();
  await page.click('#overlay.peek .peek-back');
  await expect(page.locator('#overlay')).not.toHaveClass(/peek/);
  await expect(page.locator('#overlay.show .charm-modal')).toBeVisible();
  // 3枚とも素早く押す
  // お守りの札を指で押しても、早送りにはならない
  await card.dispatchEvent('pointerdown');
  expect(await page.evaluate(() => document.documentElement.classList.contains('hurry'))).toBe(false);
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('#overlay .charm-card').forEach((c) => { c.click(); c.click(); }));
  await expect(page.locator('#overlay.show #clear-continue')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  await expect(page.locator('#overlay.show #clear-continue')).toBeVisible();
  const owned = await page.evaluate(() => document.querySelectorAll('#charms [data-charm]').length);
  expect(owned).toBe(1);
  expect(errors).toEqual([]);
});

test('初めての人はチュートリアルで、横一列に植えて列で売るまで案内される', async ({ page }) => {
  const errors = await boot(page, { tutorial: true });
  // 初めての人は準備画面を飛ばして、そのままチュートリアル
  await page.click('#title-start', { force: true });
  await expect(page.locator('#prep-start')).toHaveCount(0);
  await expect(page.locator('#overlay')).not.toHaveClass(/show/);
  const coach = page.locator('#coach');
  await expect(coach).toContainText('リールをタップ');
  await page.locator('#reels .reel').first().click({ force: true });
  await expect(coach).toContainText('種のリール', { timeout: 15_000 });
  // 案内と違うリールは触れない
  await page.locator('#reels .reel').nth(2).click({ force: true });
  await expect(coach).toContainText('種のリール');
  await page.locator('#reels .reel').nth(0).click({ force: true });
  await expect(coach).toContainText('横一列の3マス');
  for (const c of [5, 6, 7]) await page.locator('#field .plot').nth(c).click({ force: true });
  await expect(coach).toContainText('雨のリール');
  await page.locator('#reels .reel').nth(1).click({ force: true });
  await page.locator('#field .plot').nth(6).click({ force: true });
  await expect(coach).toContainText('次の日へ');
  await page.locator('#reels .reel').first().click({ force: true });
  await expect(coach).toContainText('雷', { timeout: 15_000 });
  await page.locator('#reels .reel').nth(0).click({ force: true });
  await page.locator('#field .plot').nth(6).click({ force: true });
  await expect(coach).toContainText('列ごと売ろう');
  await page.locator('#field .plot').nth(6).click({ force: true });
  await expect(coach).toContainText('単品は半値', { timeout: 15_000 });
  await page.click('.coach-next');
  // 水曜の朝：リールを押すと先に市が開き、決まった3つから1つ選ぶ
  await expect(coach).toContainText('水曜は市');
  await page.locator('#reels .reel').first().click({ force: true });
  // まず「タダで1つ選ぶ」の画面（選ぶと市が開く）
  await expect(page.locator('#offer-screen:not([hidden])')).toHaveCount(1, { timeout: 15_000 });
  await expect(coach).toContainText('3つから1つ');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hatake-slot:run')!).offer)).toEqual(['addRain', 'addSun', 'addSeed']);
  // 市の板がせり上がり終わるのを待ってから押す
  const take = page.locator('#offer-shop [data-take]').first();
  await expect(take).toBeInViewport({ timeout: 5_000 });
  // 市の板がせり上がる途中の押しは取りこぼすことがあるので、案内が進むまで押し直す
  await expect(async () => {
    await ready(page);
    if (await take.count()) await take.click({ force: true, timeout: 1_000 });
    await expect(coach).toContainText('次へ', { timeout: 1_500 });
  }).toPass({ timeout: 12_000 });
  // 選ぶと「タダで1つ」の画面が消えて市が開く。せり上がり終わってから押す
  await expect(page.locator('#market-next')).toBeInViewport({ timeout: 5_000 });
  await ready(page);
  await page.click('#market-next', { force: true });
  await expect(coach).toContainText('ノルマ', { timeout: 15_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hatake-slot:run')!).results.map((r: { symbol: string }) => r.symbol))).toEqual(['seed', 'sun', 'coin']);
  await page.click('.coach-next');
  await expect(coach).toContainText('自由');
  await page.click('.coach-next');
  await expect(coach).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hatake-slot:meta')!).tutorialDone)).toBe(true);
  expect(errors).toEqual([]);
});

test('種はなぞって続けて植えられ、出目はリールから畑へ引っぱって使える', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  await firstDay(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('hatake-slot:run')!);
    s.results = [{ symbol: 'seed', used: false, total: 3, left: 3, power: 1 }, { symbol: 'rain', used: false, total: 1, left: 1, power: 1 }, { symbol: 'coin', used: true, total: 1, left: 0, power: 1 }];
    s.field = s.field.map(() => null);
    localStorage.setItem('hatake-slot:run', JSON.stringify(s));
  });
  await page.reload();
  await page.click('#title-resume', { force: true });
  const mid = async (loc: ReturnType<Page['locator']>) => { const r = (await loc.boundingBox())!; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  await page.locator('#reels .reel').nth(0).click();
  const a = await mid(page.locator('#field .plot').nth(0));
  const c = await mid(page.locator('#field .plot').nth(2));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(a.x + ((c.x - a.x) * k) / 10, a.y);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hatake-slot:run')!).field.filter(Boolean).length)).toBe(3);
  const r = await mid(page.locator('#reels .reel').nth(1));
  const b = await mid(page.locator('#field .plot').nth(1));
  await page.mouse.move(r.x, r.y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(r.x + ((b.x - r.x) * k) / 12, r.y + ((b.y - r.y) * k) / 12);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hatake-slot:run')!).results[1].used)).toBe(true);
  expect(errors).toEqual([]);
});

test('手動の出目が今は使えないときは、タップしても次の日へ進まず理由が出る', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  await firstDay(page);
  const dead = page.locator('#reels .reel.dead').first();
  // 使える出目がほかに1つもなければ、リールのタップは「次の日へ」（作り通り）なので確かめない
  if ((await dead.count()) && (await page.locator('#reels .reel.usable').count())) {
    const day = await page.locator('#day').textContent();
    await dead.click({ force: true });
    await page.waitForTimeout(400);
    await expect(page.locator('#day')).toHaveText(day!);
    await expect(page.locator('#overlay.show #skip-no')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('市で巣箱を買って置くと、市に自動で戻る。閉じたらその日はもう開かない', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  await firstDay(page);
  // 3日目（水曜・市の日）の朝に書き換える
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('hatake-slot:run')!);
    Object.assign(s, { day: 3, morning: true, gold: 999, offer: ['addRain', 'addSun', 'addSeed'], weeklyPlaces: ['hive', 'scarecrow', 'compost'], marketClosed: false, stock: [], contractOffer: [] });
    s.field = s.field.map(() => null);
    localStorage.setItem('hatake-slot:run', JSON.stringify(s));
  });
  await page.reload();
  await page.click('#title-resume', { force: true });
  await page.evaluate(() => document.getElementById('spin')!.click());
  const take = page.locator('#offer-screen:not([hidden]) [data-take]').first();
  await expect(take).toBeInViewport({ timeout: 10_000 });
  await ready(page);
  await take.click({ force: true });
  // 選ぶと市が開く。巣箱が見えてから押す
  const hive = page.locator('#stall .farm-list [data-id="hive"]');
  await expect(hive).toBeInViewport({ timeout: 5_000 });
  await ready(page);
  await hive.click({ force: true });
  await ready(page);
  await page.click('#market-next', { force: true });
  await expect(page.locator('#sheet.open')).toHaveCount(0);
  // 置く
  const spot = page.locator('#field .plot.target').first();
  await expect(spot).toHaveCount(1, { timeout: 5_000 });
  // 市の板が閉じきってから（板の下のマスを押せるようになってから）置く
  await expect.poll(() => spot.evaluate((n) => {
    const r = n.getBoundingClientRect();
    return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.plot');
  }), { timeout: 10_000 }).toBe(true);
  await spot.click({ force: true });
  // 市に戻る
  await expect(page.locator('#sheet.open[data-pane="shop"]')).toHaveCount(1, { timeout: 15_000 });
  // 市の板がせり上がり終わってから押す
  await expect(page.locator('#market-next')).toBeInViewport({ timeout: 5_000 });
  await ready(page);
  await page.click('#market-next', { force: true });
  await expect(page.locator('#sheet.open')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hatake-slot:run')!).marketClosed), { timeout: 15_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('押してから離すまでにボタンが動いても、指が動いていなければ押したことになる', async ({ page }) => {
  await boot(page);
  await page.click('#title-start', { force: true });
  const btn = page.locator('#prep-start');
  await expect(btn).toBeVisible();
  // 開く動きが止まってから、押した指の下からボタンだけをずらす（画面が動いたときと同じ）
  await page.waitForTimeout(600);
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await btn.evaluate((b) => (b.style.transform = 'translateY(200px)'));
  await page.mouse.up();
  await expect(page.locator('#overlay')).not.toHaveClass(/show/);
});

test('ボタンを押したまま指をずらしてやめると、押したことにならない', async ({ page }) => {
  await boot(page);
  await page.click('#title-start', { force: true });
  const btn = page.locator('#prep-start');
  await expect(btn).toBeVisible();
  await page.waitForTimeout(600);
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 120, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(btn).toBeVisible();
});

test('急いで連打しても、演出が終わった瞬間のタップで勝手に植えない。指を止めれば植えられる', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  await firstDay(page);
  // リール1つ・袋は種だけ：回すと種が1つ出て、自動で選ばれる（マスを1回押すと植わる状態）
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('hatake-slot:run')!);
    for (const k of Object.keys(s.bag)) s.bag[k] = 0;
    s.bag.seed = 1;
    Object.assign(s, { reels: 1, results: [], field: s.field.map(() => null) });
    localStorage.setItem('hatake-slot:run', JSON.stringify(s));
  });
  await page.reload();
  await page.click('#title-resume', { force: true });
  await page.waitForTimeout(500);
  const plot = page.locator('#field .plot').nth(6);
  const box = (await plot.boundingBox())!;
  const tap = () => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.evaluate(() => document.getElementById('spin')!.click());
  // 回っている間から終わったあとまで、同じマスを連打する
  for (let k = 0; k < 30; k++) { await tap(); await page.waitForTimeout(120); }
  await expect(page.locator('.reel.selected')).toHaveCount(1);
  await expect(plot).not.toHaveClass(/has-crop|grow|ripe/);
  const planted = () => page.evaluate(() => JSON.parse(localStorage.getItem('hatake-slot:run')!).field.filter(Boolean).length);
  expect(await planted()).toBe(0);
  // 指を止めてから押せば植わる
  await page.waitForTimeout(600);
  await tap();
  await expect.poll(planted, { timeout: 5_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('演出の最中、ふつうのタップでは早送りにならず、長押ししている間だけ早送りになる', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  await firstDay(page);
  const hurry = () => page.evaluate(() => document.documentElement.classList.contains('hurry'));
  const box = (await page.locator('#field').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  /** 次の日へ回す（出目が残っていれば確認の「回す」も押す）。押した直後の演出の最中に戻る */
  const spin = async () => {
    await page.evaluate(() => document.getElementById('spin')!.click());
    await page.waitForTimeout(150);
    if (await page.locator('#overlay.show #skip-yes').count()) { await ready(page); await page.click('#skip-yes', { force: true }); }
    await page.waitForTimeout(50);
  };
  // 押したままにすると早送り、離すと戻る
  await spin();
  await page.mouse.down();
  await page.waitForTimeout(400);
  expect(await hurry()).toBe(true);
  await page.mouse.up();
  expect(await hurry()).toBe(false);
  // 短いタップを続けても速くならない
  await settle(page);
  await spin();
  for (let k = 0; k < 4; k++) { await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(80); }
  expect(await hurry()).toBe(false);
  expect(errors).toEqual([]);
});

test('リーチの回転を長押しで早送りしても、止まったあとに「リーチ」と暗いリールが残らない', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  await firstDay(page);
  // 袋を種だけにして、必ずリーチ（3本とも種）にする
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('hatake-slot:run')!);
    for (const k of Object.keys(s.bag)) s.bag[k] = 0;
    s.bag.seed = 6;
    Object.assign(s, { results: [], field: s.field.map(() => null) });
    localStorage.setItem('hatake-slot:run', JSON.stringify(s));
  });
  await page.reload();
  await page.click('#title-resume', { force: true });
  await page.waitForTimeout(500);
  const box = (await page.locator('#field').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.evaluate(() => document.getElementById('spin')!.click());
  await page.waitForTimeout(50);
  // 回っている間ずっと長押し（早送り）
  await page.mouse.down();
  await page.waitForTimeout(3500);
  await page.mouse.up();
  await page.waitForTimeout(2500);
  await expect(page.locator('.reach-call')).toHaveCount(0);
  await expect(page.locator('.machine.spotlight')).toHaveCount(0);
  await expect(page.locator('.reel.reach')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('仕入れの画面が出た直後の連打では選ばれない。指を止めれば選べる', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  await firstDay(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('hatake-slot:run')!);
    // 2日目の終わり（出目は使い切った）。次の日へ進むと、3日目（市）の朝に仕入れの画面が出る
    for (const r of s.results) r.used = true;
    Object.assign(s, { day: 2, morning: false, gold: 999, offer: [], marketClosed: false, stock: [] });
    localStorage.setItem('hatake-slot:run', JSON.stringify(s));
  });
  await page.reload();
  await page.click('#title-resume', { force: true });
  await page.waitForTimeout(500);
  await expect(page.locator('#offer-screen')).toBeHidden();
  // 仕入れの札が出る場所（畑の下の段）を、画面が出る前から連打し続ける
  const plot = (await page.locator('#field .plot').nth(11).boundingBox())!;
  const tap = () => page.mouse.click(plot.x + plot.width / 2, plot.y + plot.height / 2);
  await page.evaluate(() => document.getElementById('spin')!.click());
  for (let k = 0; k < 40; k++) { await tap(); await page.waitForTimeout(120); }
  // 連打の間に仕入れの画面が出たが、選ばれていない
  await expect(page.locator('#offer-screen [data-take]').first()).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hatake-slot:run')!).offer.length)).toBe(3);
  await page.waitForTimeout(600);
  await tap();
  await expect(page.locator('#offer-screen')).toBeHidden({ timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('ふつうをクリアするとタイトルに殿様モードが出て、段を選んで始められる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e')) return;
    sessionStorage.setItem('e2e', '1');
    localStorage.clear();
    localStorage.setItem('hatake-slot:meta', JSON.stringify({ tutorialDone: true, maxCleared: 0 }));
    localStorage.setItem('hatake-slot:calm', '1');
    localStorage.setItem('hatake-slot:lang', 'ja');
    localStorage.setItem('hatake-slot:noexplain', '1');
  });
  await page.goto('./');
  await page.click('#title-lord', { force: true });
  await expect(page.locator('#prep-start')).toBeVisible();
  await ready(page);
  await page.click('#prep-start', { force: true });
  await expect(page.locator('.lord-screen')).toBeVisible();
  // 段2はまだ開いていない
  await page.click('#diff-next', { force: true });
  await expect(page.locator('#diff-start')).toBeDisabled();
  await page.click('#diff-prev', { force: true });
  await ready(page);
  await page.click('#diff-start', { force: true });
  await page.locator('#reels .reel').first().click({ force: true });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hatake-slot:run') ?? '{}').lordLevel), { timeout: 15_000 }).toBe(1);
  expect(errors).toEqual([]);
});

test('絵柄袋の板を開いたあとに市を開いても、畑の品の段が出る', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  await firstDay(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('hatake-slot:run')!);
    for (const r of s.results) r.used = true;
    Object.assign(s, { day: 2, morning: false, gold: 999, offer: [], marketClosed: false, stock: [] });
    localStorage.setItem('hatake-slot:run', JSON.stringify(s));
  });
  await page.reload();
  await page.click('#title-resume', { force: true });
  await page.waitForTimeout(500);
  // 絵柄袋の板を開いて閉じる（前はこのあと市の品の段が全部隠れていた）
  await page.click('.tab[data-sheet="bag"]', { force: true });
  await expect(page.locator('#sheet.open')).toHaveCount(1);
  await ready(page);
  await page.click('#sheet-close', { force: true });
  await expect(page.locator('#sheet.open')).toHaveCount(0);
  await page.evaluate(() => document.getElementById('spin')!.click());
  const take = page.locator('#offer-screen [data-take]').first();
  await expect(take).toBeVisible({ timeout: 15_000 });
  await ready(page);
  await take.click({ force: true });
  await expect(page.locator('#sheet.open[data-pane="shop"]')).toHaveCount(1, { timeout: 5_000 });
  await expect(page.locator('#stall .stall-sec[data-cat]:not([hidden])').first()).toBeVisible();
  // 開いた時点で一度も空にならなかった（空の市を見つけて直す守りに頼っていない）
  expect(await page.evaluate(() => (window as unknown as { __marketEmpty?: number }).__marketEmpty ?? 0)).toBe(0);
  expect(errors).toEqual([]);
});

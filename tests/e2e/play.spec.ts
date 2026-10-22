import { expect, test, type Page } from '@playwright/test';

// 画面の通し確認：タイトル → 準備 → 遊ぶ（植える・使う・売る・次の日）→ 年貢 → 終わり
// 演出は控えめにして待ち時間を短くする。脈打ち続けるボタン（スタートなど）は止まらないので force で押す

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('e2e')) {
        localStorage.clear();
        sessionStorage.setItem('e2e', '1');
      }
      localStorage.setItem('hatake-slot:calm', '1');
    } catch { /* 保存できなくても遊べる */ }
  });
  await page.goto('./');
  return errors;
}

async function start(page: Page): Promise<void> {
  await page.click('#title-start', { force: true });
  await expect(page.locator('#prep-start')).toBeVisible();
  await page.click('#prep-start', { force: true });
  await expect(page.locator('#overlay')).not.toHaveClass(/show/);
}

/** 回転と演出が終わり、次の操作を受け付けるまで待つ。お守りの3択が出たら1つ選ぶ */
async function settle(page: Page): Promise<'play' | 'over' | 'clear'> {
  for (let k = 0; k < 150; k++) {
    if (await page.locator('#overlay.show #restart').count()) return 'over';
    if (await page.locator('#overlay.show #clear-continue').count()) return 'clear';
    const card = page.locator('#overlay.show .charm-card:not([disabled])').first();
    if (await card.count()) { await card.click({ force: true, timeout: 1000 }).catch(() => {}); continue; }
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
  test.setTimeout(300_000);
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
      await expect.poll(() => page.locator('#gold-box').innerText()).not.toBe(before);
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
  // 使える出目があるうちに、使えないリールを押す（なければ確認は出ない）
  const unusable = page.locator('#reels .reel:not(.usable)').first();
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
  if (await skip.count()) await skip.click({ force: true });
  const card = page.locator('#overlay.show .charm-card:not([disabled])').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  // 3枚とも素早く押す
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('#overlay .charm-card').forEach((c) => { c.click(); c.click(); }));
  await expect(page.locator('#overlay.show #clear-continue')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  await expect(page.locator('#overlay.show #clear-continue')).toBeVisible();
  const owned = await page.evaluate(() => document.querySelectorAll('#charms [data-charm]').length);
  expect(owned).toBe(1);
  expect(errors).toEqual([]);
});

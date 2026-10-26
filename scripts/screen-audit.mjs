// 画面の総点検：4サイズ×全画面を撮って、はみ出し・切れ・折り返し・重なり・小さすぎるボタンを数える
// npm run build && npx vite preview --port 4173 を出した状態で  npm run audit -- [出力先] [s360|p430|land|pc]（BASE=URL で別の場所も見られる）
import { chromium } from '@playwright/test';
const pw = { chromium };
const OUT = process.argv[2] ?? 'screen-audit';
await import('node:fs').then((fs) => fs.mkdirSync(OUT, { recursive: true }));
const only = process.argv[3];
const SIZES = {
  s360: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  p430: { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  land: { viewport: { width: 932, height: 430 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  pc: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
};
const b = await pw.chromium.launch();
const report = [];

function detect() {
  const W = innerWidth, H = innerHeight;
  const issues = [];
  const name = (e) => (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') || e.tagName;
  const vis = (e) => { const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const deco = (e) => e.closest('#fx, #critters, .scene, #build-label, .info-pop, svg, .burst, .float');
  if (document.documentElement.scrollWidth > W + 1) issues.push(`横スクロール ${document.documentElement.scrollWidth}>${W}`);
  const modal = document.querySelector('#overlay.show');
  const scope = modal ?? document.body;
  for (const e of scope.querySelectorAll('button, h1, h2, h3, p, b, small, span, label, .modal, .order-tag, .pill, .tab')) {
    if (deco(e) || !vis(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.right > W + 1 || r.left < -1) issues.push(`画面外(横) ${name(e)} ${Math.round(r.left)}..${Math.round(r.right)}`);
    const s = getComputedStyle(e);
    // 短い言葉が折れて縦に積まれていないか
    const t = e.textContent.trim();
    if (t && t.length >= 2 && t.length <= 6 && !e.children.length && r.height > parseFloat(s.fontSize) * 2.2 && r.width < parseFloat(s.fontSize) * 2.5) issues.push(`折り返し ${name(e)} 「${t}」`);
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own && (s.overflow === 'hidden' || s.textOverflow === 'ellipsis' || s.overflowX === 'hidden') && e.scrollWidth > e.clientWidth + 1) issues.push(`文字切れ ${name(e)} 「${e.textContent.trim().slice(0, 14)}」`);
  }
  // モーダルが画面に入りきるか（中でスクロールできればよい）
  if (modal) {
    const m = modal.querySelector('.modal, [role=dialog]');
    if (m) { const r = m.getBoundingClientRect(); const s = getComputedStyle(m); if ((r.bottom > H + 1 || r.top < -1) && s.overflowY !== 'auto' && s.overflowY !== 'scroll') issues.push(`モーダルが縦に入らない ${Math.round(r.top)}..${Math.round(r.bottom)}>${H}`); }
  }
  const btns = [...scope.querySelectorAll('button')].filter((e) => vis(e) && !deco(e) && !e.closest('.sr-only') && !e.classList.contains('sr-only'));
  for (const e of btns) {
    const r = e.getBoundingClientRect();
    if (Math.min(r.width, r.height) < 28) issues.push(`小さいボタン ${name(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i], c = btns[j];
    if (a.contains(c) || c.contains(a)) continue;
    // 下から開くパネルが畑に重なるのは作り通り
    if (!!a.closest('.sheet') !== !!c.closest('.sheet')) continue;
    // 開いたメニュー（≡）が下の物に重なるのも作り通り（外を押すと閉じる）
    if (!!a.closest('.hud-menu') !== !!c.closest('.hud-menu')) continue;
    // 下に固定した「もどる」の下を中身がスクロールするのも作り通り
    if (a.closest('.prep-actions') || c.closest('.prep-actions')) continue;
    if (a.id === 'sheet-close' || c.id === 'sheet-close' || a.id === 'spin-go' || c.id === 'spin-go') continue;
    const r = a.getBoundingClientRect(), q = c.getBoundingClientRect();
    const ox = Math.min(r.right, q.right) - Math.max(r.left, q.left), oy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
    if (ox > 4 && oy > 4) issues.push(`ボタンの重なり ${name(a)} × ${name(c)} ${Math.round(ox)}x${Math.round(oy)}`);
  }
  return [...new Set(issues)];
}

async function snap(p, size, key) {
  await p.waitForTimeout(450);
  const issues = await p.evaluate(detect);
  await p.screenshot({ path: `${OUT}/${size}-${key}.png` });
  report.push({ size, key, issues });
}

async function page(size, run) {
  const ctx = await b.newContext(SIZES[size]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(([r, lang]) => {
    if (sessionStorage.getItem('a')) return;
    sessionStorage.setItem('a', '1');
    localStorage.clear();
    localStorage.setItem('hatake-slot:calm', '1');
    // 表示の言語（UI_LANG=en で英語の画面を確かめる）
    localStorage.setItem('hatake-slot:lang', lang);
    // チュートリアルは別に確かめる（ここでは済ませた状態から）
    localStorage.setItem('hatake-slot:meta', JSON.stringify({ tutorialDone: true }));
    if (r) localStorage.setItem('hatake-slot:run', r);
  }, [run ?? null, process.env.UI_LANG ?? 'ja']);
  await p.goto(process.env.BASE ?? 'http://localhost:4173/');
  await p.waitForTimeout(300);
  return { p, ctx, errs };
}
const f = { force: true };
async function settle(p) {
  for (let k = 0; k < 80; k++) {
    if (await p.$('#overlay.show')) return;
    if (await p.$eval('#spin', (n) => !n.disabled)) return;
    await p.waitForTimeout(100);
  }
}

// 1日目を遊んだ保存データを作り、場面ごとに書き換えて使う
let base;
{
  const { p, ctx } = await page('p430');
  await p.click('#title-start', f); await p.click('#prep-start', f);
  await p.locator('#reels .reel').first().click(f); await settle(p);
  // 演出が終わって保存されるまで待つ
  for (let k = 0; k < 100 && !base; k++) {
    base = await p.evaluate(() => localStorage.getItem('hatake-slot:run'));
    if (!base) await p.waitForTimeout(100);
  }
  await ctx.close();
}
const mod = (fn) => { const s = JSON.parse(base); fn(s); return JSON.stringify(s); };
const C = 5;
const rich = mod((s) => {
  s.cols = 5; s.rows = 5; s.gold = 1234; s.day = 26; s.taxesPaid = 3;
  const kinds = ['tomato', 'corn', 'pumpkin', 'strawberry'];
  for (let i = 0; i < 25; i++) s.field[i] = i % 4 === 3 ? null : { kind: kinds[i % 3], growth: i % 2 ? 99 : 1, fertilized: false, bonus: 0 };
  s.tools[6] = 'scarecrow'; s.tools[18] = 'goldenWell'; s.tiles[12] = 'water'; s.tiles[8] = 'compost';
  s.weeds[3] = true; s.frost[20] = 2;
  for (const id of Object.keys(s.charms).slice(0, 9)) s.charms[id] = 1 + (id.length % 3);
  s.stock = ['hive'];
});

for (const size of Object.keys(SIZES)) {
  if (only && only !== size) continue;
  // タイトル・準備・解放・遊び方
  {
    const { p, ctx, errs } = await page(size);
    await snap(p, size, '01-title');
    await p.click('#title-unlock', f); await snap(p, size, '02-unlock');
    await p.evaluate(() => document.querySelector('#overlay .modal, #overlay [role=dialog]')?.scrollTo(0, 99999)); await snap(p, size, '02b-unlock-bottom');
    await p.click('#unlock-back', f);
    await p.click('#title-help', f); await snap(p, size, '03-help');
    const tabs = await p.$$('#overlay [data-tab]');
    for (let i = 1; i < tabs.length; i++) { await p.locator('#overlay [data-tab]').nth(i).click(f); await snap(p, size, `03-help-${i}`); }
    await p.click('#help-close', f);
    await p.click('#title-records', f); await snap(p, size, '03b-records');
    await p.click('#records-close', f);
    await p.click('#title-settings', f); await snap(p, size, '03c-settings');
    await p.click('#set-close', f);
    await p.click('#title-start', f); await snap(p, size, '04-prep');
    await p.click('#prep-start', f); await snap(p, size, '05-day0');
    await p.locator('#reels .reel').first().click(f); await settle(p); await snap(p, size, '06-day1');
    const u = p.locator('.reel.usable').first();
    if (await u.count()) { await u.click(f); await snap(p, size, '07-selected'); }
    const nu = p.locator('#reels .reel:not(.usable):not(.selected)').first();
    if (await nu.count()) { await nu.click(f); await p.waitForTimeout(200); if (await p.$('#skip-no')) { await snap(p, size, '08-confirm'); await p.click('#skip-no', f); } }
    if (errs.length) report.push({ size, key: 'errors-a', issues: errs });
    await ctx.close();
  }
  // 育った広い畑・ショップ・袋・お守り・メニュー・長押し
  {
    const { p, ctx, errs } = await page(size, rich);
    await p.click('#title-resume', f); await p.waitForTimeout(400); await snap(p, size, '10-rich');
    for (const t of ['shop', 'bag', 'charms']) {
      await p.click(`.tab[data-sheet="${t}"]`, f); await snap(p, size, `11-${t}`);
      await p.evaluate(() => { const s = document.querySelector('.sheet'); s?.scrollTo(0, 99999); }); await snap(p, size, `11-${t}-bottom`);
      await p.click('#sheet-close', f); await p.waitForTimeout(300);
    }
    await p.click('#menu-btn', f); await snap(p, size, '12-menu'); await p.click('#menu-btn', f);
    const ripe = await p.locator('.plot').nth(1).boundingBox();
    if (ripe) { await p.mouse.move(ripe.x + 20, ripe.y + 20); await p.mouse.down(); await p.waitForTimeout(700); await snap(p, size, '13-longpress'); await p.mouse.up(); }
    if (errs.length) report.push({ size, key: 'errors-b', issues: errs });
    await ctx.close();
  }
  // 年貢→お守りの3択
  {
    const { p, ctx, errs } = await page(size, mod((s) => { s.day = 7; s.gold = 999; }));
    await p.click('#title-resume', f); await p.waitForTimeout(300);
    await p.evaluate(() => document.getElementById('spin').click()); await p.waitForTimeout(200);
    if (await p.$('#skip-yes')) await p.click('#skip-yes', f);
    for (let k = 0; k < 60; k++) { await p.waitForTimeout(150); if (await p.$('#overlay.show .charm-card:not([disabled])')) break; }
    await snap(p, size, '20-charm-offer');
    if (errs.length) report.push({ size, key: 'errors-c', issues: errs });
    await ctx.close();
  }
  // 年貢が払えずゲームオーバー
  {
    const { p, ctx, errs } = await page(size, mod((s) => { s.day = 7; s.gold = 0; s.field = s.field.map(() => null); }));
    await p.click('#title-resume', f); await p.waitForTimeout(300);
    await p.evaluate(() => document.getElementById('spin').click()); await p.waitForTimeout(200);
    if (await p.$('#skip-yes')) await p.click('#skip-yes', f);
    for (let k = 0; k < 80; k++) { await p.waitForTimeout(150); if (await p.$('#restart:not([disabled])')) break; }
    await snap(p, size, '21-gameover');
    if (errs.length) report.push({ size, key: 'errors-d', issues: errs });
    await ctx.close();
  }
  // 6回目の年貢でクリア
  {
    const { p, ctx, errs } = await page(size, mod((s) => { s.day = 42; s.taxesPaid = 5; s.gold = 9999; }));
    p.on('dialog', () => {});
    await p.click('#title-resume', f); await p.waitForTimeout(300);
    await p.evaluate(() => document.getElementById('spin').click()); await p.waitForTimeout(200);
    if (await p.$('#skip-yes')) await p.click('#skip-yes', f);
    for (let k = 0; k < 120; k++) { await p.waitForTimeout(150); if (await p.$('#clear-continue')) break; if (await p.$('#overlay.show .charm-card:not([disabled])')) await p.locator('#overlay.show .charm-card:not([disabled])').first().click({ force: true, timeout: 500 }).catch(() => {}); }
    await p.waitForTimeout(1000);
    await snap(p, size, '22-clear');
    if (errs.length) report.push({ size, key: 'errors-e', issues: errs });
    await ctx.close();
  }
}
await b.close();
const bad = report.filter((r) => r.issues.length);
const by = new Map();
for (const r of bad) for (const i of r.issues) { const k = i.replace(/\d+(x\d+)?(\.\.\d+)?(>\d+)?$/, '').trim(); (by.get(k) ?? by.set(k, []).get(k)).push(`${r.size}/${r.key}`); }
for (const [k, v] of by) console.log(`${k}\n    ${v.length}: ${[...new Set(v)].slice(0, 8).join(' ')}`);
console.log(`screens=${report.length} withIssues=${bad.length}`);

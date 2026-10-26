// 表示の言語（日本語・英語）。切り替えたら読み込み直す（文言は起動時に決まる）

export type Lang = 'ja' | 'en';

const KEY = 'hatake-slot:lang';

function detect(): Lang {
  // テストやシミュレーター（画面なし）はいつも日本語
  if (typeof document === 'undefined') return 'ja';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ja' || saved === 'en') return saved;
  } catch {
    // 保存が使えない環境では端末の言語で決める
  }
  return typeof navigator !== 'undefined' && !navigator.language.toLowerCase().startsWith('ja') ? 'en' : 'ja';
}

export const lang: Lang = detect();
export const EN = lang === 'en';

/** 日本語と英語の文言から、今の言語のほうを返す */
export function L(ja: string, en: string): string {
  return EN ? en : ja;
}

/** お金の表記（12金 / 12g） */
export function gold(n: number | string): string {
  return EN ? `${n}g` : `${n}金`;
}

export function setLang(next: Lang): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // 保存できなくても、この回は切り替える
  }
  location.reload();
}

/** index.html の固定の文言を英語にする（data-en：中身、data-en-label：aria-label、data-en-title：title） */
export function applyStaticLang(): void {
  document.documentElement.lang = lang;
  if (!EN) return;
  document.title = 'Farm Slots';
  document.querySelectorAll<HTMLElement>('[data-en]').forEach((n) => (n.innerHTML = n.dataset.en!));
  document.querySelectorAll<HTMLElement>('[data-en-label]').forEach((n) => n.setAttribute('aria-label', n.dataset.enLabel!));
  document.querySelectorAll<HTMLElement>('[data-en-title]').forEach((n) => n.setAttribute('title', n.dataset.enTitle!));
}

// 設定：音量・振動・演出の速さ・演出控えめ・プレイ記録・データを消す・クレジット

import { EN, L, setLang } from '../i18n.ts';
import { CONFIG, TELEMETRY_URL } from '../config.ts';
import { isMuted, setBgmVolume, setVolume, sfx, toggleMute } from '../audio.ts';
import { isCalm, setFastFx, setVibrate, toggleCalm } from '../fx.ts';
import { $, el, meta } from './store.ts';
import { saveMeta } from '../meta.ts';
import { art } from '../art.ts';
import { buildLogText } from './save.ts';
import { resetExplains } from './explain.ts';

export interface Settings {
  /** 効果音の大きさ（0〜1） */
  volume: number;
  /** BGM の大きさ（0〜1） */
  bgm: number;
  vibrate: boolean;
  /** 演出をはやく */
  fast: boolean;
  /** 遊んだ記録（匿名）を送る */
  telemetry: boolean;
}

const KEY = 'hatake-slot:settings';
const DEFAULTS: Settings = { volume: 0.7, bgm: 0.5, vibrate: true, fast: false, telemetry: true };

export const settings: Settings = load();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくても、その回は効く
  }
}

/** 起動時に設定を反映する */
export function applySettings(): void {
  setVolume(settings.volume);
  setBgmVolume(settings.bgm);
  setVibrate(settings.vibrate);
  setFastFx(settings.fast);
}

/** 設定の画面。onClose：閉じたあとに戻す画面 */
/**
 * 試し用（一時的）：チュートリアルを確かめるため、ゼロデータと今のデータを行き来する。
 * false にすると設定から2つのボタンが消える
 */
const DEV_DATA_SWAP = true;
/** 退避したデータの置き場（「データを消す」でも消えないよう、別の名前） */
const BACKUP_KEY = 'hatake-backup:data';
/** 行き来するデータ（記録・解放・続き）。音や言語の設定はそのまま */
const SWAP_KEYS = ['hatake-slot:meta', 'hatake-slot:run', 'hatake-slot:best'];

function hasBackup(): boolean {
  try {
    return localStorage.getItem(BACKUP_KEY) !== null;
  } catch {
    return false;
  }
}

/** 今のデータを退避して空にする（初めての人の状態） */
function toZeroData(): void {
  try {
    const data = Object.fromEntries(SWAP_KEYS.map((k) => [k, localStorage.getItem(k)]));
    localStorage.setItem(BACKUP_KEY, JSON.stringify(data));
    SWAP_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    // 保存が使えない環境では何もしない
  }
  location.reload();
}

/** 退避したデータに戻す（ゼロデータで遊んだ分は捨てる） */
function restoreData(): void {
  try {
    const data = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? '{}') as Record<string, string | null>;
    SWAP_KEYS.forEach((k) => (data[k] === null || data[k] === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, data[k]!)));
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // 保存が使えない環境では何もしない
  }
  location.reload();
}

export function showSettings(onClose?: () => void): void {
  const toggle = (id: string, label: string, on: boolean) =>
    `<button class="set-row toggle${on ? ' on' : ''}" id="${id}" role="switch" aria-checked="${on}"><span>${label}</span><i class="sw"></i></button>`;
  const paint = () => {
    el.overlay.innerHTML = `
      <div class="modal settings-modal" role="dialog" aria-label="${L('設定', 'Settings')}">
        <h2>${art('gear')} ${L('設定', 'Settings')}</h2>
        <div class="set-row lang-row"><span>${L('言語', 'Language')}</span><span class="seg"><button id="set-lang-ja" class="${EN ? '' : 'on'}">日本語</button><button id="set-lang-en" class="${EN ? 'on' : ''}">English</button></span></div>
        <label class="set-row"><span>${L('BGMの大きさ', 'Music volume')}</span><input type="range" id="set-bgm" min="0" max="100" step="10" value="${Math.round(settings.bgm * 100)}" /></label>
        <label class="set-row"><span>${L('効果音の大きさ', 'Sound volume')}</span><input type="range" id="set-volume" min="0" max="100" step="10" value="${Math.round(settings.volume * 100)}" /></label>
        ${toggle('set-mute', L('音を消す', 'Mute'), isMuted())}
        ${toggle('set-vibrate', L('振動', 'Vibration'), settings.vibrate)}
        ${toggle('set-fast', L('演出をはやく', 'Faster effects'), settings.fast)}
        ${toggle('set-calm', L('演出控えめ', 'Calm effects'), isCalm())}
        ${TELEMETRY_URL ? toggle('set-telemetry', L('遊んだ記録を送る（匿名）', 'Send play stats (anonymous)'), settings.telemetry) : ''}
        <button class="set-row" id="set-tutorial"><span>${art('question')} ${meta.tutorialDone ? L('チュートリアルをもう一度', 'Replay the tutorial') : L('チュートリアル：次にスタートを押すと始まる', 'Tutorial: starts on your next Start')}</span></button>
        <button class="set-row" id="set-explain"><span>${art('book')} ${L('説明カードをもう一度出す', 'Show the picture guides again')}</span></button>
        ${DEV_DATA_SWAP ? `<div class="dev-swap"><span class="dev-tag">${L('試し用', 'Testing')}</span>${hasBackup()
          ? `<button class="set-row" id="set-restore"><span>${L('元のデータに戻す', 'Restore my data')}</span></button>`
          : `<button class="set-row" id="set-zero"><span>${L('ゼロデータで試す（今のデータは取っておく）', 'Try as a new player (keeps your data)')}</span></button>`}</div>` : ''}
        ${DEV_DATA_SWAP ? `<button class="set-row" id="set-log"><span>${art('copy')} ${L('プレイログを書き出す（開発用）', 'Export play log (dev)')}</span></button>` : ''}
        <button class="set-row danger" id="set-reset"><span>${L('データを消す', 'Erase data')}</span></button>
        <div class="credits">
          <b>${L('畑スロット', 'Farm Slots')}</b>
          <small>${L('書体', 'Fonts')}：Zen Maru Gothic、M PLUS Rounded 1c（SIL Open Font License）</small>
          <small>${L('版', 'Version')}：${__BUILD__}・${L(`年貢${CONFIG.winTaxes}回でクリア`, `Win by paying ${CONFIG.winTaxes} taxes`)}</small>
        </div>
        <button class="primary" id="set-close">${L('閉じる', 'Close')}</button>
      </div>`;
    el.overlay.classList.add('show');
    const flip = (id: string, fn: () => void) =>
      $(id)?.addEventListener('click', () => {
        fn();
        save();
        sfx.select();
        paint();
      });
    $<HTMLInputElement>('set-volume').addEventListener('change', (e) => {
      settings.volume = Number((e.target as HTMLInputElement).value) / 100;
      setVolume(settings.volume);
      save();
      sfx.select();
    });
    $<HTMLInputElement>('set-bgm').addEventListener('input', (e) => {
      settings.bgm = Number((e.target as HTMLInputElement).value) / 100;
      setBgmVolume(settings.bgm);
      save();
    });
    $('set-lang-ja').addEventListener('click', () => EN && setLang('ja'));
    $('set-lang-en').addEventListener('click', () => !EN && setLang('en'));
    flip('set-mute', () => toggleMute());
    flip('set-vibrate', () => {
      settings.vibrate = !settings.vibrate;
      setVibrate(settings.vibrate);
    });
    flip('set-fast', () => {
      settings.fast = !settings.fast;
      setFastFx(settings.fast);
    });
    flip('set-calm', () => toggleCalm());
    flip('set-telemetry', () => (settings.telemetry = !settings.telemetry));
    // チュートリアルをもう一度：次にスタートを押すと、準備画面を飛ばして始まる
    $('set-tutorial').addEventListener('click', () => {
      meta.tutorialDone = false;
      saveMeta(meta);
      sfx.select();
      paint();
    });
    document.getElementById('set-zero')?.addEventListener('click', () => toZeroData());
    $('set-explain').addEventListener('click', (e) => {
      resetExplains();
      sfx.select();
      (e.currentTarget as HTMLElement).querySelector('span')!.lastChild!.textContent = ` ${L('次に出会ったときに出ます', 'They will show again')}`;
    });
    document.getElementById('set-log')?.addEventListener('click', () => {
      sfx.select();
      showLogExport(paint);
    });
    document.getElementById('set-restore')?.addEventListener('click', () => restoreData());
    // データを消す：2回押して確かめる
    let armed = false;
    $('set-reset').addEventListener('click', (e) => {
      const b = e.currentTarget as HTMLElement;
      if (!armed) {
        armed = true;
        sfx.error();
        b.querySelector('span')!.firstChild!.textContent = L('もう一度押すと消します', 'Press again to erase');
        b.classList.add('armed');
        return;
      }
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('hatake-slot:'))
          .forEach((k) => localStorage.removeItem(k));
      } catch {
        // 消せない環境では何もしない
      }
      location.reload();
    });
    $('set-close').addEventListener('click', () => {
      sfx.cancel();
      el.overlay.classList.remove('show');
      el.overlay.innerHTML = '';
      onClose?.();
    });
  };
  paint();
}

/** 開発用：プレイログを表示して、コピー・ファイル保存できるようにする */
function showLogExport(back: () => void): void {
  const text = buildLogText(__BUILD__);
  el.overlay.innerHTML = `
    <div class="modal settings-modal log-modal" role="dialog" aria-label="${L('プレイログ', 'Play log')}">
      <h2>${art('copy')} ${L('プレイログ', 'Play log')}</h2>
      ${text
        ? `<p class="log-sub">${L(`${text.split('\n').length}行。コピーかファイルで渡してください`, `${text.split('\n').length} lines. Copy it or save it as a file`)}</p>
           <textarea class="log-text" readonly>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>
           <div class="log-btns"><button class="primary" id="log-copy">${L('コピー', 'Copy')}</button><button class="primary" id="log-save">${L('ファイルに保存', 'Save file')}</button></div>`
        : `<p class="log-sub">${L('まだログがありません。1日以上遊ぶと残ります', 'No log yet. Play at least one day')}</p>`}
      <button class="set-row" id="log-back"><span>${L('戻る', 'Back')}</span></button>
    </div>`;
  el.overlay.classList.add('show');
  const ta = el.overlay.querySelector<HTMLTextAreaElement>('.log-text');
  document.getElementById('log-copy')?.addEventListener('click', async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // クリップボードが使えないときは選択して端末のコピーに任せる
      ta?.select();
      document.execCommand?.('copy');
    }
    sfx.select();
    b.textContent = L('コピーした', 'Copied');
  });
  document.getElementById('log-save')?.addEventListener('click', () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hatake-log-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    sfx.select();
  });
  $('log-back').addEventListener('click', () => {
    sfx.cancel();
    back();
  });
}

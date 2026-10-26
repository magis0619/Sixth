// 設定：音量・振動・演出の速さ・演出控えめ・プレイ記録・データを消す・クレジット

import { CONFIG, TELEMETRY_URL } from '../config.ts';
import { isMuted, setVolume, sfx, toggleMute } from '../audio.ts';
import { isCalm, setFastFx, setVibrate, toggleCalm } from '../fx.ts';
import { $, el } from './store.ts';

export interface Settings {
  /** 効果音の大きさ（0〜1） */
  volume: number;
  vibrate: boolean;
  /** 演出をはやく */
  fast: boolean;
  /** 遊んだ記録（匿名）を送る */
  telemetry: boolean;
}

const KEY = 'hatake-slot:settings';
const DEFAULTS: Settings = { volume: 0.7, vibrate: true, fast: false, telemetry: true };

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
  setVibrate(settings.vibrate);
  setFastFx(settings.fast);
}

/** 設定の画面。onClose：閉じたあとに戻す画面 */
export function showSettings(onClose?: () => void): void {
  const toggle = (id: string, label: string, on: boolean, note = '') =>
    `<button class="set-row toggle${on ? ' on' : ''}" id="${id}" role="switch" aria-checked="${on}"><span>${label}${note ? `<small>${note}</small>` : ''}</span><i class="sw"></i></button>`;
  const paint = () => {
    el.overlay.innerHTML = `
      <div class="modal settings-modal" role="dialog" aria-label="設定">
        <h2>⚙ 設定</h2>
        <label class="set-row"><span>効果音の大きさ</span><input type="range" id="set-volume" min="0" max="100" step="10" value="${Math.round(settings.volume * 100)}" /></label>
        ${toggle('set-mute', '音を消す', isMuted())}
        ${toggle('set-vibrate', '振動', settings.vibrate, '対応している端末だけ')}
        ${toggle('set-fast', '演出をはやく', settings.fast, '慣れてきた人向け')}
        ${toggle('set-calm', '演出控えめ', isCalm(), '揺れ・点滅・フリーズを弱める')}
        ${TELEMETRY_URL ? toggle('set-telemetry', '遊んだ記録を送る', settings.telemetry, '匿名。難しさの調整に使います') : ''}
        <button class="set-row danger" id="set-reset"><span>データを消す<small>解放・記録・途中のゲームがすべて消えます</small></span></button>
        <div class="credits">
          <b>畑スロット</b>
          <small>書体：Mochiy Pop One、M PLUS Rounded 1c（SIL Open Font License）</small>
          <small>版：${__BUILD__}・年貢${CONFIG.winTaxes}回でクリア</small>
        </div>
        <button class="primary" id="set-close">閉じる</button>
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
    // データを消す：2回押して確かめる
    let armed = false;
    $('set-reset').addEventListener('click', (e) => {
      const b = e.currentTarget as HTMLElement;
      if (!armed) {
        armed = true;
        sfx.error();
        b.querySelector('span')!.firstChild!.textContent = 'もう一度押すと消します';
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

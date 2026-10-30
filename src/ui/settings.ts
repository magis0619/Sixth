// 設定：音量・振動・演出の速さ・演出控えめ・プレイ記録・データを消す・クレジット

import { EN, L, setLang } from '../i18n.ts';
import { CONFIG, TELEMETRY_URL } from '../config.ts';
import { isMuted, setBgmVolume, setVolume, sfx, toggleMute } from '../audio.ts';
import { isCalm, setFastFx, setVibrate, toggleCalm } from '../fx.ts';
import { $, el } from './store.ts';
import { art } from '../art.ts';

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
        ${TELEMETRY_URL ? toggle('set-telemetry', L('遊んだ記録を送る', 'Send play stats'), settings.telemetry) : ''}
        <button class="set-row danger" id="set-reset"><span>${L('データを消す', 'Erase data')}</span></button>
        <div class="credits">
          <b>${L('畑スロット', 'Farm Slots')}</b>
          <small>${L('書体', 'Fonts')}：Mochiy Pop One、M PLUS Rounded 1c（SIL Open Font License）</small>
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

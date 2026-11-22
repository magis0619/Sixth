// 長押しで出る虫眼鏡・文字選び・メニューと、ピンチや2回タップの拡大を止める。
// iPhone の Safari は viewport の user-scalable=no を無視するので、指の動きの側でも止める

const editable = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('input, textarea');

export function installNoZoom(): void {
  // ピンチで拡大・縮小（Safari の gesture は Safari だけの合図）
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  // 2本指で動かしたとき
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  // 長押しの文字選び（虫眼鏡）とメニュー
  document.addEventListener('selectstart', (e) => { if (!editable(e.target)) e.preventDefault(); });
  document.addEventListener('contextmenu', (e) => { if (!editable(e.target)) e.preventDefault(); });
  // パソコン：Ctrl＋ホイールでの拡大
  document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
}

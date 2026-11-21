// 使い方：node scripts/css-clean.cjs（src/style.css が読み込む src/styles/*.css を、読み込む順に1つの並びとして整理して書き換える）。前後で SEED=1 DUMPSTYLE=フォルダ の画面の点検を取り、計算後のスタイルが同じか比べること
// CSS の整理：1) どこにも出てこないクラス・id だけを指す規則を消す 2) 後ろに同じセレクタ・同じ性質があって、絶対に効かない宣言を消す
const fs = require('fs');
const postcss = require('postcss');
const path = require('path');
// 読み込む順（style.css の @import の順）。後ろの決まりが前を上書きするので、この順のまま1つの並びとして扱う
const cssFiles = [...fs.readFileSync('src/style.css', 'utf8').matchAll(/@import '\.\/([^']+)'/g)].map((m) => path.join('src', m[1]));
const tsFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tsFiles(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []));
const files = ['index.html', ...tsFiles('src')];
const code = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
// クラスが生きているか：そのまま出てくる、または「前半-${」の形で組み立てられている
const alive = new Map();
function isAlive(tok) {
  if (alive.has(tok)) return alive.get(tok);
  let ok = code.includes(tok);
  if (!ok) { const parts = tok.split('-'); for (let k = parts.length - 1; k >= 1 && !ok; k--) { const pre = parts.slice(0, k).join('-') + '-'; ok = code.includes(pre + '${') || code.includes(pre + "' +") || code.includes(pre + '" +'); } }
  alive.set(tok, ok); return ok;
}
function selAlive(sel) {
  const toks = [...sel.matchAll(/[.#]([a-zA-Z_][\w-]*)/g)].map((m) => m[1]).filter((t) => !/^\d/.test(t));
  // :not(...) の中は消えていても生きている扱い（否定なので）
  const outside = sel.replace(/:not\([^)]*\)/g, '');
  const need = [...outside.matchAll(/[.#]([a-zA-Z_][\w-]*)/g)].map((m) => m[1]);
  return need.every(isAlive) || toks.length === 0;
}
const roots = cssFiles.map((f) => postcss.parse(fs.readFileSync(f, 'utf8')));
// 全部のファイルをまとめて歩く（順番は読み込む順）
const root = { walkRules: (fn) => roots.forEach((r) => r.walkRules(fn)), walkAtRules: (fn) => roots.forEach((r) => r.walkAtRules(fn)) };
let removedSel = 0, removedRules = 0, removedDecl = 0;
// 1) 死んだセレクタ
root.walkRules((rule) => {
  if (rule.parent && rule.parent.type === 'atrule' && /keyframes/.test(rule.parent.name)) return;
  const sels = rule.selectors;
  const keep = sels.filter(selAlive);
  if (keep.length === sels.length) return;
  removedSel += sels.length - keep.length;
  if (!keep.length) { rule.remove(); removedRules++; } else rule.selectors = keep;
});
// 2) 後ろの同じセレクタに上書きされる宣言（同じ入れ物＝同じ @media の中だけで比べる）
const ctxKey = (n) => { const a = []; let p = n.parent; while (p && p.type !== 'root') { if (p.type === 'atrule') a.push(p.name + ' ' + p.params); p = p.parent; } return a.join('|'); };
const rules = [];
root.walkRules((r) => { if (!(r.parent && r.parent.type === 'atrule' && /keyframes/.test(r.parent.name))) rules.push(r); });
const later = new Map(); // key -> Map(prop -> important?)
for (let i = rules.length - 1; i >= 0; i--) {
  const r = rules[i];
  const key = ctxKey(r) + '##' + r.selectors.map((s) => s.trim()).join(',');
  const seen = later.get(key) ?? new Map();
  r.each((d) => {
    if (d.type !== 'decl') return;
    const prop = d.prop.toLowerCase();
    const laterImp = seen.get(prop);
    if (laterImp !== undefined && (laterImp || !d.important)) { d.remove(); removedDecl++; }
  });
  r.each((d) => { if (d.type === 'decl') { const p = d.prop.toLowerCase(); seen.set(p, (seen.get(p) ?? false) || d.important); } });
  later.set(key, seen);
}
// 中身が空になった規則・@media を消す
root.walkRules((r) => { if (!r.nodes.some((n) => n.type === 'decl')) { if (!r.nodes.length || r.nodes.every((n) => n.type === 'comment')) { r.remove(); removedRules++; } } });
root.walkAtRules((a) => { if (a.nodes && !a.nodes.some((n) => n.type !== 'comment')) a.remove(); });
cssFiles.forEach((f, i) => fs.writeFileSync(f, roots[i].toString()));
console.log({ removedSel, removedRules, removedDecl });

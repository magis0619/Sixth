/**
 * 畑スロットのプレイ記録を受け取る Google Apps Script。
 *
 * 使い方（はじめて）
 * 1. 新しい Google スプレッドシートを作る
 * 2. メニュー「拡張機能」→「Apps Script」を開き、このファイルの中身を全部貼り付けて保存
 * 3. 右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *    - 次のユーザーとして実行：自分
 *    - アクセスできるユーザー：全員
 * 4. 表示された「ウェブアプリのURL」（https://script.google.com/macros/s/…/exec）を
 *    src/config.ts の TELEMETRY_URL に入れる
 *
 * 書き換えたとき（URLを変えずに新しい中身にする）
 *   「デプロイ」→「デプロイを管理」→ 鉛筆（編集）→ バージョン「新バージョン」→「デプロイ」
 *   （「新しいデプロイ」にするとURLが変わってしまう）
 *
 * シート
 *   progress：年貢を納めたときの途中経過（1回1行）
 *   result  ：プレイが終わったときの結果（1プレイ1行）
 *   quit    ：遊んでいる途中で画面を離れたとき（同じ日には1回）
 *   log     ：プレイログ全文（result・quit のとき）。1マス5万字までなので、長いときは何行かに分ける。run の列で上の行とつなぐ
 * 列は届いた項目から自動で作る（後から項目が増えても右に足される）。
 */
var LOG_CHUNK = 45000;

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var name = data.kind === 'result' || data.kind === 'quit' ? data.kind : 'progress';
  var log = data.log;
  delete data.log;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var book = SpreadsheetApp.getActiveSpreadsheet();
    appendRow(book, name, data);
    if (log) {
      var parts = Math.ceil(log.length / LOG_CHUNK);
      for (var i = 0; i < parts; i++) {
        appendRow(book, 'log', { at: data.at, kind: data.kind, run: data.run, pid: data.pid, day: data.day, part: "'" + (i + 1) + '/' + parts, text: log.slice(i * LOG_CHUNK, (i + 1) * LOG_CHUNK) });
      }
    }
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}

function appendRow(book, name, data) {
  var sheet = book.getSheetByName(name) || book.insertSheet(name);
  var header = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  Object.keys(data).forEach(function (key) {
    if (header.indexOf(key) < 0) {
      header.push(key);
      sheet.getRange(1, header.length).setValue(key);
    }
  });
  sheet.appendRow(header.map(function (key) {
    var v = data[key];
    // 「=」などで始まる文字は式にならないように（part の「1/1」は日付にならないよう先頭に ' を付けてある）
    if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
    return v === undefined ? '' : v;
  }));
}

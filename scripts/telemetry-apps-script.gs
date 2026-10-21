/**
 * 畑スロットのプレイ記録を受け取る Google Apps Script。
 *
 * 使い方
 * 1. 新しい Google スプレッドシートを作る
 * 2. メニュー「拡張機能」→「Apps Script」を開き、このファイルの中身を全部貼り付けて保存
 * 3. 右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *    - 次のユーザーとして実行：自分
 *    - アクセスできるユーザー：全員
 * 4. 表示された「ウェブアプリのURL」（https://script.google.com/macros/s/…/exec）を
 *    src/config.ts の TELEMETRY_URL に入れる
 *
 * シート「progress」に年貢ごとの途中経過、シート「result」に1プレイの結果が1行ずつ入る。
 * 列は届いた項目から自動で作る（後から項目が増えても右に足される）。
 */
function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var name = data.kind === 'result' ? 'result' : 'progress';
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var book = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = book.getSheetByName(name) || book.insertSheet(name);
    var header = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
    Object.keys(data).forEach(function (key) {
      if (header.indexOf(key) < 0) {
        header.push(key);
        sheet.getRange(1, header.length).setValue(key);
      }
    });
    sheet.appendRow(header.map(function (key) {
      return data[key] === undefined ? '' : data[key];
    }));
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}

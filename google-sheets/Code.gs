/* สคริปต์รับบิลจากแอป POS สแมชเบอร์เกอร์ แล้วเก็บลง Google Sheets นี้ */
var KEY = 'ใส่รหัสจากแอป (หน้า ตั้งค่า → คัดลอกสคริปต์)';
var SHEET = 'บิล';
var HEAD = ['id', 'วันที่', 'เวลา', 'เลขบิล', 'ลูกค้า', 'ทานที่ร้าน/กลับบ้าน', 'ชำระด้วย', 'ยอด', 'รับเงิน', 'ทอน', 'รายการ', 'สถานะ', 'อัปเดตล่าสุด', 'ข้อมูลสำหรับกู้คืน (ห้ามแก้)'];

function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  if (d.key !== KEY) return out({ ok: false, err: 'key' });
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = billSheet(ss);
    var idx = rowIndex(sh), now = new Date(), fresh = [];
    (d.orders || []).forEach(function (o) {
      var row = toRow(o, now), r = idx[String(o.id)];
      if (r) sh.getRange(r, 1, 1, row.length).setValues([row]);
      else { fresh.push(row); idx[String(o.id)] = -1; }
    });
    if (fresh.length) sh.getRange(sh.getLastRow() + 1, 1, fresh.length, HEAD.length).setValues(fresh);
    (d.del || []).forEach(function (id) {
      var r = idx[String(id)];
      if (r > 0) sh.getRange(r, 12, 1, 2).setValues([['ลบในแอปแล้ว', now]]);
    });
    if (d.menu) {
      var st = ss.getSheetByName('ตั้งค่าแอป') || ss.insertSheet('ตั้งค่าแอป');
      st.getRange(1, 1, 1, 3).setValues([['ข้อมูลเมนู (ห้ามแก้)', JSON.stringify({ menu: d.menu, counter: d.counter, pw: d.pw }), now]]);
    }
    return out({ ok: true, n: (d.orders || []).length });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  if (e.parameter.key !== KEY) return out({ ok: false, err: 'key' });
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = billSheet(ss), n = sh.getLastRow(), os = [];
  if (n > 1) sh.getRange(2, 12, n - 1, 3).getValues().forEach(function (r) {
    if (r[0] === 'ลบในแอปแล้ว') return;
    try { os.push(JSON.parse(r[2])); } catch (x) {}
  });
  var cfg = {}, st = ss.getSheetByName('ตั้งค่าแอป');
  if (st) try { cfg = JSON.parse(st.getRange(1, 2).getValue()); } catch (x) {}
  return out({ ok: true, orders: os, menu: cfg.menu, counter: cfg.counter, pw: cfg.pw, at: new Date().toISOString() });
}

function billSheet(ss) {
  var sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET, 0);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.hideColumns(1);
    sh.hideColumns(HEAD.length);
  }
  return sh;
}

function rowIndex(sh) {
  var idx = {}, n = sh.getLastRow();
  if (n > 1) sh.getRange(2, 1, n - 1, 1).getValues().forEach(function (r, i) { idx[String(r[0])] = i + 2; });
  return idx;
}

function txt(v) {
  v = String(v == null ? '' : v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function toRow(o, now) {
  var d = new Date(o.ts);
  var items = (o.lines || []).map(function (l) {
    var x = (l.add || []).map(function (a) { return a.name + (a.qty > 1 ? ' x' + a.qty : ''); });
    return l.name + ' x' + l.qty + (x.length ? ' (' + x.join(', ') + ')' : '');
  }).join(' / ');
  var pay = o.method === 'transfer' ? 'โอน/QR' : (o.method === 'thaichuay' ? 'ไทยช่วยไทย' : 'เงินสด');
  return [String(o.id), o.day, Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm'), o.no, txt(o.cust),
    o.mode === 'take' ? 'กลับบ้าน' : 'ทานที่ร้าน', pay, o.total, o.recv, o.change, txt(items),
    o.void ? 'ยกเลิก' : (o.edited ? 'แก้ไขแล้ว' : 'ปกติ'), now, JSON.stringify(o)];
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
